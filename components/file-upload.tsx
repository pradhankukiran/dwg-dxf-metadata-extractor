"use client"

import type React from "react"

import { useRef } from "react"
import { Upload, File } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface FileUploadProps {
  onFileSelect: (file: File) => void
  selectedFile: File | null
}

export function FileUpload({ onFileSelect, selectedFile }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase()
      if (!["dwg", "dxf"].includes(extension || "")) {
        alert("Please select a DWG or DXF file")
        return
      }
      onFileSelect(file)
    }
  }

  const handleDragDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const file = event.dataTransfer.files?.[0]
    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase()
      if (!["dwg", "dxf"].includes(extension || "")) {
        alert("Please drop a DWG or DXF file")
        return
      }
      onFileSelect(file)
    }
  }

  return (
    <div className="space-y-4">
      <Card
        className="border-2 border-dashed p-12 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
        onDrop={handleDragDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input ref={inputRef} type="file" accept=".dwg,.dxf" onChange={handleFileChange} className="hidden" />

        <div onClick={() => inputRef.current?.click()} className="space-y-4">
          <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
          <div>
            <p className="font-medium">Drag and drop your file here</p>
            <p className="text-sm text-muted-foreground">or click to browse</p>
            <p className="text-xs text-muted-foreground mt-2">Supported: DWG, DXF</p>
          </div>
        </div>
      </Card>

      {selectedFile && (
        <div className="flex items-center gap-3 p-4 bg-accent/50 rounded-lg">
          <File className="w-5 h-5 text-accent-foreground" />
          <div className="flex-1">
            <p className="font-medium text-sm">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onFileSelect(null as any)}>
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}
