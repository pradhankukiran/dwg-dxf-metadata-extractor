"use client"

import { Card } from "@/components/ui/card"

interface MetadataDisplayProps {
  metadata: any
}

export function MetadataDisplay({ metadata }: MetadataDisplayProps) {
  const formatValue = (value: any): string => {
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  return (
    <Card className="p-8 space-y-6">
      <h2 className="text-2xl font-bold">Extracted Metadata</h2>

      <div className="grid gap-6">
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key} className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {key.replace(/([A-Z])/g, " $1").trim()}
            </p>
            {typeof value === "object" ? (
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                <code>{JSON.stringify(value, null, 2)}</code>
              </pre>
            ) : (
              <p className="text-base break-words">{formatValue(value)}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
