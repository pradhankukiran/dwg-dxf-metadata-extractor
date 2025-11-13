import { type NextRequest, NextResponse } from "next/server"
import { StaticAuthenticationProvider } from "@aps_sdk/autodesk-sdkmanager"
import { AuthenticationClient, Scopes } from "@aps_sdk/authentication"
import { OssClient } from "@aps_sdk/oss"
import {
  ModelDerivativeClient,
  JobPayload,
  JobPayloadInput,
  JobPayloadOutput,
  OutputType,
  View,
  Region,
  Manifest,
  ManifestResources,
  ObjectTree,
  Properties
} from "@aps_sdk/model-derivative"

// Configure route for Node.js runtime and longer execution time
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for large/complex files

let cachedToken: { token: string; expiresAt: number } | null = null

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function pollForResult<T>(
  fetcher: () => Promise<T>,
  isReady: (result: T | null) => boolean,
  options?: { attempts?: number; delayMs?: number }
): Promise<{ result: T | null; ready: boolean }> {
  const attempts = options?.attempts ?? 8
  const delayMs = options?.delayMs ?? 2000
  let lastResult: T | null = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    lastResult = await fetcher()
    if (isReady(lastResult)) {
      return { result: lastResult, ready: true }
    }
    await sleep(delayMs)
  }

  return { result: lastResult, ready: false }
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.APS_CLIENT_ID
  const clientSecret = process.env.APS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Missing APS_CLIENT_ID or APS_CLIENT_SECRET environment variables")
  }

  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const authClient = new AuthenticationClient()
  const credentials = await authClient.getTwoLeggedToken(
    clientId,
    clientSecret,
    [Scopes.DataRead, Scopes.DataCreate, Scopes.BucketRead, Scopes.BucketCreate]
  )

  cachedToken = {
    token: credentials.access_token,
    expiresAt: Date.now() + credentials.expires_in * 1000 - 60000,
  }

  return credentials.access_token
}

async function ensureBucketExists(ossClient: OssClient, bucketKey: string): Promise<void> {
  console.log("Checking bucket:", bucketKey)

  try {
    await ossClient.createBucket("US", {
      bucketKey,
      policyKey: "transient",
    })
    console.log("Bucket created successfully")
  } catch (error: any) {
    // 409 means bucket already exists, which is fine
    const status = error?.axiosError?.response?.status || error?.response?.status || error?.status || error?.statusCode
    if (status === 409) {
      console.log("Bucket already exists (this is normal)")
      return
    }
    console.error("Failed to create bucket:", error.message || error)
    throw error
  }
}

async function uploadToOSS(
  ossClient: OssClient,
  bucketKey: string,
  objectKey: string,
  fileBuffer: Buffer,
): Promise<void> {
  console.log("Uploading file to OSS:", objectKey)

  await ossClient.uploadObject(bucketKey, objectKey, fileBuffer)

  console.log("File uploaded successfully:", objectKey)
}

async function submitTranslationJob(mdClient: ModelDerivativeClient, bucketKey: string, objectKey: string, fileName: string): Promise<string> {
  const urn = Buffer.from(`urn:adsk.objects:os.object:${bucketKey}/${objectKey}`).toString("base64")

  console.log("Submitting translation job with URN:", urn)
  console.log("File type:", fileName.toLowerCase().endsWith('.dxf') ? 'DXF' : 'DWG')

  const jobPayload: JobPayload = {
    input: {
      urn: urn,
      compressedUrn: false,
      // Explicitly set root filename for better DXF support
      rootFilename: fileName,
    } as JobPayloadInput,
    output: {
      formats: [
        {
          type: OutputType.Svf2,
          views: [View._2d, View._3d],
        },
      ],
    } as JobPayloadOutput,
  }

  const job = await mdClient.startJob(jobPayload)

  console.log("Job submitted successfully, URN:", job.urn)

  return job.urn
}

async function getMetadata(mdClient: ModelDerivativeClient, urn: string): Promise<any> {
  let attempts = 0
  const maxAttempts = 60 // 60 attempts × 2 seconds = 2 minutes of polling
  const delayMs = 2000
  let lastStatus = ""
  const stringToBoolean = (value: any) => value === true || value === "true"
  const analyzeObjectTree = (nodes: any[] | undefined) => {
    if (!nodes || nodes.length === 0) {
      return { nodeCount: 0, maxDepth: 0 }
    }

    let nodeCount = 0
    let maxDepth = 0

    const traverse = (items: any[], depth: number) => {
      for (const item of items) {
        nodeCount++
        if (depth > maxDepth) {
          maxDepth = depth
        }
        if (item.objects && item.objects.length > 0) {
          traverse(item.objects, depth + 1)
        }
      }
    }

    traverse(nodes, 1)
    return { nodeCount, maxDepth }
  }
  const summarizeProperties = (collection: any[] | undefined) => {
    if (!collection || collection.length === 0) {
      return { objectCount: 0, categoryCount: 0, propertyCount: 0 }
    }

    const categories = new Set<string>()
    let propertyCount = 0

    for (const entry of collection) {
      const props = entry?.properties || {}
      for (const category of Object.keys(props)) {
        categories.add(category)
        const categoryProps = props[category]
        if (categoryProps && typeof categoryProps === "object") {
          propertyCount += Object.keys(categoryProps).length
        }
      }
    }

    return {
      objectCount: collection.length,
      categoryCount: categories.size,
      propertyCount,
    }
  }
  const addResourcesToMap = (resources: ManifestResources[] | undefined, map: Map<string, ManifestResources>) => {
    if (!resources) {
      return
    }

    for (const resource of resources) {
      if (resource.guid) {
        map.set(resource.guid, resource)
      }

      if (resource.children && resource.children.length > 0) {
        addResourcesToMap(resource.children as ManifestResources[], map)
      }
    }
  }

  while (attempts < maxAttempts) {
    try {
      const manifest: Manifest = await mdClient.getManifest(urn, { region: Region.Us })

      console.log(`Manifest check ${attempts + 1}/${maxAttempts}, status: ${manifest.status}`)
      lastStatus = manifest.status

      if (manifest.status === "inprogress" || manifest.status === "pending") {
        console.log("Job still in progress, status:", manifest.status)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        attempts++
        continue
      }

      if (manifest.status === "failed") {
        // Log full manifest for debugging
        console.log("Failed manifest:", JSON.stringify(manifest, null, 2))

        // Extract failure details from manifest
        const messages = manifest.messages || []
        const derivatives = manifest.derivatives || []

        // Check derivatives for error messages
        let errorDetails = ""
        if (messages.length > 0) {
          errorDetails = messages.map((msg: any) => msg.message || msg.code).join("; ")
        } else if (derivatives.length > 0 && derivatives[0].messages) {
          errorDetails = derivatives[0].messages.map((msg: any) => msg.message || msg.code).join("; ")
        }

        throw new Error(
          `Translation job failed. ${errorDetails || "The file may be corrupted, in an unsupported format, or DXF version is not supported by Autodesk Model Derivative API."}`
        )
      }

      const derivatives = manifest.derivatives || []
      if (derivatives.length === 0) {
        // Job succeeded but no derivatives - this might be normal for some files
        console.log("Warning: Job succeeded but no derivatives found. Returning manifest info.")
        return {
          fileName: "",
          sourceUrn: manifest.urn,
          status: manifest.status,
          progress: manifest.progress,
          region: manifest.region,
          hasThumbnail: stringToBoolean(manifest.hasThumbnail),
          derivatives: [],
          message: "File processed but no derivatives generated. This may be expected for simple files."
        }
      }

      const resourceMap = new Map<string, ManifestResources>()
      for (const derivative of derivatives) {
        addResourcesToMap(derivative.children as ManifestResources[] | undefined, resourceMap)
      }

      const metadata: any = {
        fileName: derivatives[0]?.name || "",
        sourceUrn: manifest.urn,
        status: manifest.status,
        progress: manifest.progress,
        region: manifest.region,
        hasThumbnail: stringToBoolean(manifest.hasThumbnail),
        derivatives: [],
      }

      for (const derivative of derivatives) {
        const derivativeResources =
          derivative.children?.map((resource: ManifestResources) => ({
            guid: resource.guid,
            name: resource.name,
            type: resource.type,
            urn: resource.urn,
            role: resource.role,
            viewableID: resource.viewableID,
            hasThumbnail: stringToBoolean(resource.hasThumbnail),
            progress: resource.progress,
          })) || []

        metadata.derivatives.push({
          name: derivative.name,
          hasThumbnail: stringToBoolean(derivative.hasThumbnail),
          outputType: derivative.outputType,
          role: derivative.role,
          status: derivative.status,
          resources: derivativeResources,
        })
      }

      // Try to fetch model views for additional metadata
      try {
        const modelViews = await mdClient.getModelViews(urn)
        if (modelViews?.data?.metadata) {
          metadata.modelViews = modelViews.data.metadata.map((view: any) => ({
            guid: view.guid,
            name: view.name,
            role: view.role,
            urn: resourceMap.get(view.guid)?.urn,
            viewableID: resourceMap.get(view.guid)?.viewableID,
          }))

          for (const view of metadata.modelViews) {
            // Object tree enrichment with polling
            view.objectTreeStatus = "pending"
            try {
              const { result: objectTreeResult, ready: isTreeReady } = await pollForResult(
                () =>
                  mdClient.getObjectTree(urn, view.guid, {
                    region: Region.Us,
                    forceget: "true",
                    acceptEncoding: "gzip",
                  }),
                (result) => Boolean(result && (result as ObjectTree).isProcessing !== true && (result as any)?.data),
                { attempts: 10, delayMs: 2000 }
              )

              if (objectTreeResult?.data) {
                view.objectTree = objectTreeResult.data
                view.objectTreeStats = analyzeObjectTree(objectTreeResult.data.objects)
              }

              view.objectTreeStatus = isTreeReady
                ? "complete"
                : objectTreeResult?.isProcessing
                ? "processing"
                : "unavailable"
            } catch (treeError: any) {
              console.log(`Failed to fetch object tree for view ${view.guid}:`, treeError)
              view.objectTreeStatus = "error"
              view.objectTreeError = treeError?.message || "Failed to fetch object tree"
            }

            // Properties enrichment with polling
            view.propertiesStatus = "pending"
            try {
              const { result: propertiesResult, ready: arePropertiesReady } = await pollForResult(
                () =>
                  mdClient.getAllProperties(urn, view.guid, {
                    region: Region.Us,
                    forceget: "true",
                    acceptEncoding: "gzip",
                  }),
                (result) => Boolean(result && (result as Properties).isProcessing !== true && (result as any)?.data),
                { attempts: 10, delayMs: 2000 }
              )

              if (propertiesResult?.data) {
                view.properties = propertiesResult.data
                view.propertiesStats = summarizeProperties(propertiesResult.data.collection)
              }

              view.propertiesStatus = arePropertiesReady
                ? "complete"
                : propertiesResult?.isProcessing
                ? "processing"
                : "unavailable"
            } catch (propError: any) {
              console.log(`Failed to fetch properties for view ${view.guid}:`, propError)
              view.propertiesStatus = "error"
              view.propertiesError = propError?.message || "Failed to fetch properties"
            }
          }
        }
      } catch (err) {
        console.log("Failed to fetch model views:", err)
      }

      return metadata
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.statusCode === 404) {
        console.log("Waiting for job to complete, attempt", attempts + 1)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        attempts++
        continue
      }
      console.log("Error in getMetadata:", err)
      throw err
    }
  }

  throw new Error(
    `Metadata extraction timed out after ${maxAttempts * delayMs / 1000} seconds. ` +
    `Last status: ${lastStatus}. The file may need more processing time - try again in a few minutes.`
  )
}

export async function POST(request: NextRequest) {
  try {
    console.log("Parsing request body...")

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (formDataError) {
      console.error("FormData parsing error:", formDataError)
      return NextResponse.json(
        { error: `Failed to parse form data: ${formDataError instanceof Error ? formDataError.message : 'Unknown error'}` },
        { status: 400 }
      )
    }

    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    console.log("Processing file:", file.name, "Size:", file.size, "bytes")
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const token = await getAccessToken()

    // Initialize clients with authentication provider
    const authProvider = new StaticAuthenticationProvider(token)
    const ossClient = new OssClient({ authenticationProvider: authProvider })
    const mdClient = new ModelDerivativeClient({ authenticationProvider: authProvider })

    const timestamp = Date.now()
    const bucketKey = "dwg-extractor-bucket"

    // Sanitize filename: replace spaces and special chars with underscores
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const objectKey = `${timestamp}-${sanitizedFileName}`

    console.log("Starting extraction for:", file.name)
    console.log("Object key:", objectKey)

    // Ensure bucket exists
    await ensureBucketExists(ossClient, bucketKey)

    // Upload file to OSS
    await uploadToOSS(ossClient, bucketKey, objectKey, fileBuffer)

    // Submit translation job
    const urn = await submitTranslationJob(mdClient, bucketKey, objectKey, file.name)

    // Get metadata
    const metadata = await getMetadata(mdClient, urn)
    metadata.originalFileName = file.name
    metadata.sourceUrn = metadata.sourceUrn || urn
    metadata.translationUrn = urn
    metadata.bucketKey = bucketKey
    metadata.objectKey = objectKey
    console.log("Metadata extracted successfully")

    return NextResponse.json({ metadata })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "An error occurred" }, { status: 500 })
  }
}
