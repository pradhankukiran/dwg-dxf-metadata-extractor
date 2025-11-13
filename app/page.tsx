"use client"

import { useState, useRef, useEffect } from "react"
import { FileUpload } from "@/components/file-upload"
import { MetadataDisplay } from "@/components/metadata-display"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Loader2, Upload as UploadIcon, CheckCircle2 } from "lucide-react"

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [metadata, setMetadata] = useState(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("")
  const metadataRef = useRef<HTMLDivElement>(null)

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    setMetadata(null)
    setError(null)
  }

  // Auto-scroll to metadata when it loads
  useEffect(() => {
    if (metadata && metadataRef.current) {
      setTimeout(() => {
        metadataRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)
    }
  }, [metadata])

  const handleExtract = async () => {
    if (!file) {
      setError("Please select a file first")
      return
    }

    setLoading(true)
    setError(null)
    setMetadata(null)

    let timer1: NodeJS.Timeout | null = null
    let timer2: NodeJS.Timeout | null = null
    let timer3: NodeJS.Timeout | null = null

    try {
      setStatus("Uploading file to Autodesk OSS...")

      // Simulate progress updates to match server-side flow
      timer1 = setTimeout(() => {
        setStatus("File uploaded successfully! Submitting translation job...")
        timer2 = setTimeout(() => {
          setStatus("Translation job submitted. Processing file (pending)...")
          timer3 = setTimeout(() => {
            setStatus("Processing in progress... Extracting derivatives...")
          }, 2000)
        }, 1000)
      }, 1500)

      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      })

      // Clear all timers
      if (timer1) clearTimeout(timer1)
      if (timer2) clearTimeout(timer2)
      if (timer3) clearTimeout(timer3)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to extract metadata")
      }

      setStatus("Extraction complete! Parsing metadata...")
      const data = await response.json()

      setTimeout(() => {
        setStatus("")
        setMetadata(data.metadata)
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setStatus("")
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

          {/* Status Card */}
          {loading && (
            <Card className="p-6 bg-primary/5 border-primary/20">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <div className="flex-1">
                    <p className="font-medium text-primary">{status}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      This may take 1-2 minutes for large or complex files...
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Error Display */}
          {error && (
            <Card className="p-6 bg-destructive/10 border-destructive">
              <p className="text-destructive font-medium">{error}</p>
            </Card>
          )}

          {/* Metadata Display */}
          {metadata && (
            <div ref={metadataRef}>
              <MetadataDisplay metadata={metadata} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
