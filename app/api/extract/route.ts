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
  Manifest
} from "@aps_sdk/model-derivative"

// Configure route for Node.js runtime and longer execution time
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for large/complex files

let cachedToken: { token: string; expiresAt: number } | null = null

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
          status: manifest.status,
          progress: manifest.progress,
          hasThumbnail: manifest.hasThumbnail,
          derivatives: [],
          message: "File processed but no derivatives generated. This may be expected for simple files."
        }
      }

      const metadata: any = {
        fileName: "",
        status: manifest.status,
        progress: manifest.progress,
        hasThumbnail: manifest.hasThumbnail,
        derivatives: [],
      }

      for (const derivative of derivatives) {
        metadata.derivatives.push({
          name: derivative.name,
          hasThumbnail: derivative.hasThumbnail,
          outputType: derivative.outputType,
          role: derivative.role,
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
          }))
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
    console.log("Metadata extracted successfully")

    return NextResponse.json({ metadata })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "An error occurred" }, { status: 500 })
  }
}
