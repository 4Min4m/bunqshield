import { useState } from 'react'
import type { BoundingBox } from '../types'

interface Props {
  invoiceBase64: string
  heatmapBase64: string
  suspiciousRegions: BoundingBox[]
}

export function HeatmapOverlay({ invoiceBase64, heatmapBase64, suspiciousRegions }: Props) {
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const invoiceSrc = invoiceBase64.startsWith('data:') ? invoiceBase64 : `data:image/png;base64,${invoiceBase64}`
  const heatmapSrc = heatmapBase64.startsWith('data:') ? heatmapBase64 : `data:image/png;base64,${heatmapBase64}`

  const overlay = (
    <div className="relative inline-block w-full cursor-pointer" onClick={() => setExpanded(true)}>
      <img src={invoiceSrc} alt="Invoice" className="w-full rounded-lg" />
      {showHeatmap && heatmapBase64 && (
        <img
          src={heatmapSrc}
          alt="Fraud heatmap"
          className="absolute inset-0 w-full h-full rounded-lg"
          style={{ opacity: 0.4, mixBlendMode: 'multiply' }}
        />
      )}
      {suspiciousRegions.map((r, i) => (
        <div
          key={i}
          className="absolute border-2 border-danger rounded"
          style={{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }}
        >
          <span className="absolute -top-5 left-0 text-xs bg-danger text-white px-1 rounded">
            Suspicious
          </span>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">Invoice Preview</span>
        <button
          onClick={() => setShowHeatmap(v => !v)}
          className="text-xs px-3 py-1 rounded-full bg-card border border-border text-muted hover:text-white transition-colors"
        >
          {showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
        </button>
      </div>
      {overlay}

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <button
              className="absolute -top-8 right-0 text-white text-sm"
              onClick={() => setExpanded(false)}
            >
              ✕ Close
            </button>
            {overlay}
          </div>
        </div>
      )}
    </div>
  )
}
