"use client"

import { useState } from "react"
import { FileUpload } from "@/components/file-upload"
import { MetadataDisplay } from "@/components/metadata-display"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [metadata, setMetadata] = useState(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    setMetadata(null)
    setError(null)
  }

  const handleExtract = async () => {
    if (!file) {
      setError("Please select a file first")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to extract metadata")
      }

      const data = await response.json()
      setMetadata(data.metadata)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted p-8">
      <div className="max-w-2xl mx-auto">
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">DWG/DXF Metadata Extractor</h1>
            <p className="text-muted-foreground">
              Upload a DWG or DXF file and extract its metadata using Autodesk APS
            </p>
          </div>

          {/* Upload Card */}
          <Card className="p-8">
            <div className="space-y-6">
              <FileUpload onFileSelect={handleFileSelect} selectedFile={file} />

              <Button onClick={handleExtract} disabled={!file || loading} size="lg" className="w-full">
                {loading ? "Extracting..." : "Extract Metadata"}
              </Button>
            </div>
          </Card>

          {/* Error Display */}
          {error && (
            <Card className="p-6 bg-destructive/10 border-destructive">
              <p className="text-destructive font-medium">{error}</p>
              <p className="text-sm text-destructive/80 mt-2">
                Make sure your APS_CLIENT_ID and APS_CLIENT_SECRET are configured in the Vars section.
              </p>
            </Card>
          )}

          {/* Metadata Display */}
          {metadata && <MetadataDisplay metadata={metadata} />}
        </div>
      </div>
    </main>
  )
}
