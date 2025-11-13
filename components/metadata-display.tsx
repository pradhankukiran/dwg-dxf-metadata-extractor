"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, FileText, Layers, Image, Code2, Eye, ChevronDown } from "lucide-react"

interface MetadataDisplayProps {
  metadata: any
}

function JsonSection({ title, data }: { title: string; data: any }) {
  const [open, setOpen] = useState(false)

  if (!data) {
    return null
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/40">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{title}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t bg-muted/40 p-3 text-[11px]">
          <code>{JSON.stringify(data, null, 2)}</code>
        </pre>
      )}
    </div>
  )
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
          {metadata.region && (
            <div className="space-y-2 col-span-2">
              <p className="text-sm font-medium text-muted-foreground">Region</p>
              <p className="text-lg font-semibold uppercase">{metadata.region}</p>
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
                      {derivative.status && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Status: </span>
                          <span className="font-medium capitalize">{derivative.status}</span>
                        </div>
                      )}
                      {derivative.resources && derivative.resources.length > 0 && (
                        <div className="space-y-2 text-xs">
                          <p className="text-muted-foreground font-medium uppercase tracking-wide text-[11px]">
                            Resources
                          </p>
                          <div className="space-y-2">
                            {derivative.resources.map((resource: any, resourceIndex: number) => (
                              <div
                                key={resource.guid || resourceIndex}
                                className="rounded-md border border-border/60 bg-background px-3 py-2 space-y-1"
                              >
                                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase text-muted-foreground">
                                  <span>{resource.type || "Resource"}</span>
                                  {resource.viewableID && <span>Viewable: {resource.viewableID}</span>}
                                </div>
                                {resource.name && <p className="text-sm font-medium">{resource.name}</p>}
                                {resource.role && (
                                  <p className="text-[11px] text-muted-foreground">Role: {resource.role}</p>
                                )}
                                {resource.urn && (
                                  <code className="block break-all rounded bg-muted px-2 py-1 text-[11px]">
                                    {resource.urn}
                                  </code>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
                    <div className="grid gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">GUID: </span>
                        <code className="text-xs bg-background px-1.5 py-0.5 rounded">{view.guid}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Role: </span>
                        <span className="font-medium">{view.role || "N/A"}</span>
                      </div>
                      {view.viewableID && (
                        <div>
                          <span className="text-muted-foreground">Viewable ID: </span>
                          <code className="text-xs bg-background px-1.5 py-0.5 rounded">{view.viewableID}</code>
                        </div>
                      )}
                      {view.urn && (
                        <div>
                          <span className="text-muted-foreground">URN: </span>
                          <code className="text-xs bg-background px-1.5 py-0.5 rounded break-all">{view.urn}</code>
                        </div>
                      )}
                    </div>
                    {(view.objectTreeStatus || view.propertiesStatus) && (
                      <div className="mt-3 space-y-2 rounded-lg bg-background/40 p-3 text-xs text-muted-foreground">
                        {view.objectTreeStatus && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span>Object tree:</span>
                            <span className="font-semibold text-foreground capitalize">{view.objectTreeStatus}</span>
                            {view.objectTreeError && (
                              <span className="text-destructive">{view.objectTreeError}</span>
                            )}
                          </div>
                        )}
                        {view.propertiesStatus && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span>Properties:</span>
                            <span className="font-semibold text-foreground capitalize">{view.propertiesStatus}</span>
                            {view.propertiesError && (
                              <span className="text-destructive">{view.propertiesError}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {(view.objectTreeStats || view.propertiesStats) && (
                      <div className="mt-3 grid gap-2 rounded-lg bg-background/50 p-3 text-xs">
                        {view.objectTreeStats && (
                          <div className="flex flex-wrap gap-4">
                            <div>
                              <span className="text-muted-foreground">Object nodes: </span>
                              <span className="font-semibold text-foreground">{view.objectTreeStats.nodeCount}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Max depth: </span>
                              <span className="font-semibold text-foreground">{view.objectTreeStats.maxDepth}</span>
                            </div>
                          </div>
                        )}
                        {view.propertiesStats && (
                          <div className="flex flex-wrap gap-4">
                            <div>
                              <span className="text-muted-foreground">Objects: </span>
                              <span className="font-semibold text-foreground">{view.propertiesStats.objectCount}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Categories: </span>
                              <span className="font-semibold text-foreground">{view.propertiesStats.categoryCount}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Properties: </span>
                              <span className="font-semibold text-foreground">{view.propertiesStats.propertyCount}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-3 space-y-2">
                      <JsonSection title="Object Tree JSON" data={view.objectTree} />
                      <JsonSection title="Properties JSON" data={view.properties} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Additional Info */}
        {(metadata.originalFileName ||
          metadata.translationUrn ||
          metadata.sourceUrn ||
          metadata.bucketKey ||
          metadata.objectKey ||
          metadata.hasThumbnail !== undefined) && (
          <div className="mt-8 pt-6 border-t space-y-3 text-sm">
            {metadata.originalFileName && (
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Original file:</span>
                <span className="font-medium">{metadata.originalFileName}</span>
              </div>
            )}

            {(metadata.translationUrn || metadata.sourceUrn) && (
              <div className="flex items-start gap-2">
                <Code2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-muted-foreground">Source URN</p>
                  <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs break-all">
                    {metadata.translationUrn || metadata.sourceUrn}
                  </code>
                </div>
              </div>
            )}

            {metadata.bucketKey && (
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Bucket:</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded">{metadata.bucketKey}</code>
              </div>
            )}

            {metadata.objectKey && (
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Object:</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded break-all">{metadata.objectKey}</code>
              </div>
            )}

            {metadata.hasThumbnail !== undefined && (
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Thumbnail available:</span>
                <span className="font-medium">{metadata.hasThumbnail ? "Yes" : "No"}</span>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </Card>
    </div>
  )
}
