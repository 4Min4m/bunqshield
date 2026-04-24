import type { AgentDecision } from '../types'

interface Props {
  reasoning: string
  decision: AgentDecision
}

const DECISION_CONFIG: Record<AgentDecision, { label: string; color: string; bg: string }> = {
  approve: { label: '✓ APPROVED', color: 'text-clean', bg: 'bg-clean/10 border-clean/30' },
  flag:    { label: '⚠ FLAGGED FOR REVIEW', color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
  block:   { label: '⛔ BLOCKED', color: 'text-danger', bg: 'bg-danger/10 border-danger/30' },
}

export function AgentChat({ reasoning, decision }: Props) {
  const dc = DECISION_CONFIG[decision]

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
        AI Agent Reasoning
      </h3>

      {/* Reasoning bubble */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
            AI
          </div>
          <div>
            <p className="text-sm text-slate-300 leading-relaxed">{reasoning}</p>
          </div>
        </div>
      </div>

      {/* Final decision */}
      <div className={`border rounded-xl p-4 ${dc.bg}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted uppercase tracking-wider">Agent Decision</span>
          <span className={`font-bold text-lg ${dc.color}`}>{dc.label}</span>
        </div>
      </div>

      <p className="text-xs text-muted text-right">
        Powered by Claude claude-sonnet-4-20250514
      </p>
    </div>
  )
}
