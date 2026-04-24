import { useState } from 'react'
import type { CVMethodResult } from '../types'

const METHOD_LABELS: Record<string, string> = {
  ela: 'Error Level Analysis',
  copy_move: 'Copy-Move Detection',
  noise_inconsistency: 'Noise Inconsistency',
  font_consistency: 'Font Consistency',
  metadata_forensics: 'Metadata Forensics',
  edge_coherence: 'Edge Coherence',
}

function scoreColor(score: number): string {
  if (score < 20) return '#10B981'
  if (score < 55) return '#F59E0B'
  return '#EF4444'
}

interface Props {
  cvResults: CVMethodResult[]
}

export function AnalysisBreakdown({ cvResults }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sorted = [...cvResults].sort((a, b) => b.score - a.score)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Forensic Analysis Breakdown
      </h3>
      {sorted.map(r => {
        const color = scoreColor(r.score)
        const isOpen = expanded === r.method
        return (
          <div
            key={r.method}
            className="bg-card border border-border rounded-lg overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              onClick={() => setExpanded(isOpen ? null : r.method)}
            >
              <span className="text-sm font-medium text-left flex-1">
                {METHOD_LABELS[r.method] ?? r.method}
              </span>
              <div className="flex items-center gap-2 w-32">
                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${r.score}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-xs font-mono w-8 text-right" style={{ color }}>
                  {r.score.toFixed(0)}
                </span>
              </div>
              <span className="text-muted text-xs ml-1">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-3 text-sm text-muted border-t border-border pt-3">
                <p>{r.details}</p>
                {r.suspicious_regions.length > 0 && (
                  <p className="mt-1 text-xs text-danger">
                    {r.suspicious_regions.length} suspicious region(s) flagged
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
