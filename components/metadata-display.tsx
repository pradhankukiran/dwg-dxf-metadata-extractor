"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, FileText, Layers, Image, Code2, Eye } from "lucide-react"

interface MetadataDisplayProps {
  metadata: any
}

export function MetadataDisplay({ metadata }: MetadataDisplayProps) {
  const [viewMode, setViewMode] = useState<"formatted" | "json">("formatted")

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      success: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
      failed: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
      inprogress: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${statusColors[status] || statusColors.pending}`}>
        {status === "success" && <CheckCircle2 className="w-4 h-4" />}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary" />
            <h2 className="text-2xl font-bold">Extracted Metadata</h2>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "formatted" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("formatted")}
            >
              <Eye className="w-4 h-4 mr-2" />
              Formatted
            </Button>
            <Button
              variant={viewMode === "json" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("json")}
            >
              <Code2 className="w-4 h-4 mr-2" />
              Raw JSON
            </Button>
          </div>
        </div>

        {viewMode === "json" ? (
          <pre className="bg-muted p-6 rounded-lg text-xs overflow-x-auto border">
            <code>{JSON.stringify(metadata, null, 2)}</code>
          </pre>
        ) : (
          <>
            {/* Status and Progress */}
            <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Status</p>
            {getStatusBadge(metadata.status)}
          </div>
          {metadata.progress && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Progress</p>
              <p className="text-lg font-semibold">{metadata.progress}</p>
            </div>
          )}
        </div>

        {/* Derivatives */}
        {metadata.derivatives && metadata.derivatives.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Derivatives</h3>
            </div>
            <div className="grid gap-3">
              {metadata.derivatives.map((derivative: any, index: number) => (
                <Card key={index} className="p-4 bg-muted/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        {derivative.hasThumbnail && <Image className="w-4 h-4 text-muted-foreground" />}
                        <p className="font-medium">{derivative.name || `Derivative ${index + 1}`}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Type: </span>
                          <span className="font-medium">{derivative.outputType || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Role: </span>
                          <span className="font-medium">{derivative.role || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Model Views */}
        {metadata.modelViews && metadata.modelViews.length > 0 && (
          <div className="space-y-4 mt-8">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Model Views</h3>
            </div>
            <div className="grid gap-3">
              {metadata.modelViews.map((view: any, index: number) => (
                <Card key={index} className="p-4 bg-muted/50">
                  <div className="space-y-1">
                    <p className="font-medium">{view.name || `View ${index + 1}`}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">GUID: </span>
                        <code className="text-xs bg-background px-1.5 py-0.5 rounded">{view.guid}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Role: </span>
                        <span className="font-medium">{view.role || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Additional Info */}
        {metadata.hasThumbnail !== undefined && (
          <div className="mt-8 pt-6 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Image className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Thumbnail available: </span>
              <span className="font-medium">{metadata.hasThumbnail ? "Yes" : "No"}</span>
            </div>
          </div>
        )}
          </>
        )}
      </Card>
    </div>
  )
}
