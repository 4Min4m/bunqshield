import type { RiskLevel, AgentDecision } from '../types'

interface Props {
  riskLevel: RiskLevel
  decision: AgentDecision
}

const CONFIG: Record<RiskLevel, { bg: string; text: string; icon: string; label: string; pulse: boolean }> = {
  clean:    { bg: 'bg-clean/20 border border-clean/40',    text: 'text-clean',    icon: '✓', label: 'Payment Safe — Auto Approved',          pulse: false },
  low:      { bg: 'bg-blue-500/20 border border-blue-500/40', text: 'text-blue-400', icon: 'ℹ', label: 'Low Risk — Logged for Audit',           pulse: false },
  medium:   { bg: 'bg-warning/20 border border-warning/40', text: 'text-warning',  icon: '⚠', label: 'Review Recommended',                    pulse: false },
  high:     { bg: 'bg-orange-500/20 border border-orange-500/40', text: 'text-orange-400', icon: '⛔', label: 'Payment Blocked — Pending Review', pulse: false },
  critical: { bg: 'bg-danger/20 border border-danger/40',   text: 'text-danger',   icon: '🚨', label: 'CRITICAL — Payment Immediately Blocked', pulse: true  },
}

export function RiskBadge({ riskLevel }: Props) {
  const c = CONFIG[riskLevel]
  return (
    <div className={`flex items-center gap-3 px-5 py-3 rounded-xl ${c.bg} ${c.pulse ? 'pulse-danger' : ''}`}>
      <span className="text-2xl">{c.icon}</span>
      <span className={`font-semibold text-lg ${c.text}`}>{c.label}</span>
    </div>
  )
}
