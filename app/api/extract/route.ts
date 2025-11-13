import { type NextRequest, NextResponse } from "next/server"

const APS_AUTH_URL = "https://developer.api.autodesk.com/authentication/v2/token"
const APS_MODEL_DERIVATIVE_URL = "https://developer.api.autodesk.com/modelderivative/v2"
const APS_OSS_URL = "https://developer.api.autodesk.com/oss/v2"

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

  const response = await fetch(APS_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "data:read data:create bucket:read bucket:create",
    }).toString(),
  })

  if (!response.ok) {
    throw new Error("Failed to authenticate with APS")
  }

  const data = (await response.json()) as any
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60000,
  }

  return data.access_token
}

async function ensureBucketExists(token: string, bucketKey: string): Promise<void> {
  console.log("[v0] Ensuring bucket exists:", bucketKey)

  const createBucketResponse = await fetch(`${APS_OSS_URL}/buckets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketKey,
      policyKey: "transient",
    }),
  })

  // 409 means bucket already exists, which is fine
  if (createBucketResponse.status === 409) {
    console.log("[v0] Bucket already exists")
    return
  }

  if (!createBucketResponse.ok) {
    const errorText = await createBucketResponse.text()
    console.log("[v0] Bucket creation error:", createBucketResponse.status, errorText)
    throw new Error(`Failed to create or verify bucket: ${createBucketResponse.status} - ${errorText}`)
  }

  console.log("[v0] Bucket created successfully")
}

async function uploadToOSS(
  token: string,
  bucketKey: string,
  objectKey: string,
  fileBuffer: Buffer,
  fileName: string,
): Promise<void> {
  console.log("[v0] Uploading file to OSS:", objectKey)

  const uploadResponse = await fetch(`${APS_OSS_URL}/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": fileBuffer.length.toString(),
    },
    body: fileBuffer,
  })

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    console.log("[v0] Upload error:", uploadResponse.status, errorText)
    throw new Error(`Failed to upload file to OSS: ${uploadResponse.status} - ${errorText}`)
  }

  console.log("[v0] File uploaded successfully:", objectKey)
}

async function submitTranslationJob(token: string, bucketKey: string, objectKey: string): Promise<string> {
  const urn = Buffer.from(`urn:adsk.objects:os.object:${bucketKey}/${objectKey}`).toString("base64")

  console.log("[v0] Submitting translation job with URN:", urn)

  const response = await fetch(`${APS_MODEL_DERIVATIVE_URL}/designdata/job`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: {
        urn,
      },
      output: {
        formats: [
          {
            type: "metadata",
          },
        ],
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.log("[v0] Translation job error:", response.status, error)
    throw new Error(`Failed to submit translation job: ${response.status} - ${error}`)
  }

  const jobData = (await response.json()) as any
  console.log("[v0] Job submitted successfully, URN:", jobData.urn)

  return jobData.urn || urn
}

async function getMetadata(token: string, urn: string): Promise<any> {
  let attempts = 0
  const maxAttempts = 15
  const delayMs = 2000

  while (attempts < maxAttempts) {
    try {
      const manifestResponse = await fetch(`${APS_MODEL_DERIVATIVE_URL}/designdata/${urn}/manifest`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!manifestResponse.ok) {
        if (manifestResponse.status === 404) {
          console.log("[v0] Waiting for job to complete, attempt", attempts + 1)
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          attempts++
          continue
        }
        throw new Error(`Manifest error: ${manifestResponse.status}`)
      }

      const manifest = (await manifestResponse.json()) as any
      console.log("[v0] Manifest received, status:", manifest.status)

      if (manifest.status === "inprogress") {
        console.log("[v0] Job still in progress")
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        attempts++
        continue
      }

      const derivatives = manifest.derivatives || []
      if (derivatives.length === 0) {
        throw new Error("No derivatives found in manifest")
      }

      const metadata: any = {
        fileName: "",
        status: manifest.status,
        progress: manifest.progress,
        derivatives: [],
      }

      for (const derivative of derivatives) {
        metadata.derivatives.push({
          name: derivative.name,
          hasThumbnail: derivative.hasThumbnail,
          outputType: derivative.outputType,
          role: derivative.role,
        })

        // Try to fetch metadata files if available
        if (derivative.children) {
          for (const child of derivative.children) {
            if (child.role === "Metadata") {
              try {
                const metadataResponse = await fetch(child.href, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                })

                if (metadataResponse.ok) {
                  const metadataContent = await metadataResponse.json()
                  metadata.details = metadataContent
                }
              } catch (err) {
                console.log("[v0] Failed to fetch metadata details:", err)
              }
            }
          }
        }
      }

      return metadata
    } catch (err) {
      console.log("[v0] Error in getMetadata:", err)
      throw err
    }
  }

  throw new Error("Metadata extraction timed out after multiple attempts")
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    console.log("[v0] Processing file:", file.name, "Size:", file.size)
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const token = await getAccessToken()
    const timestamp = Date.now()
    const bucketKey = "dwg-extractor-bucket"
    const objectKey = `${timestamp}-${file.name}`

    console.log("[v0] Starting extraction for:", file.name)

    // Ensure bucket exists
    await ensureBucketExists(token, bucketKey)

    // Upload file to OSS
    await uploadToOSS(token, bucketKey, objectKey, fileBuffer, file.name)

    // Submit translation job
    const urn = await submitTranslationJob(token, bucketKey, objectKey)

    // Get metadata
    const metadata = await getMetadata(token, urn)
    console.log("[v0] Metadata extracted successfully")

    return NextResponse.json({ metadata })
  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "An error occurred" }, { status: 500 })
  }
}
