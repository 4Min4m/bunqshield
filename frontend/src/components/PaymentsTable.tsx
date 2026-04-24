import type { PaymentSummary, PaymentStatus } from '../types'

const STATUS_BADGE: Record<PaymentStatus, string> = {
  pending:  'bg-slate-600/40 text-slate-300',
  approved: 'bg-clean/20 text-clean',
  blocked:  'bg-danger/20 text-danger',
  flagged:  'bg-warning/20 text-warning',
}

interface Props {
  payments: PaymentSummary[]
  onAnalyze: (id: string) => void
  onRefresh: () => void
}

export function PaymentsTable({ payments, onAnalyze, onRefresh }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Payments</h2>
        <button
          onClick={onRefresh}
          className="text-xs px-3 py-1.5 rounded-lg bg-card border border-border text-muted hover:text-white transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Counterparty</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Description</th>
              <th className="text-center px-4 py-3">Fraud Score</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-center px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.payment_id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-200">{p.counterparty}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {p.currency} {p.amount.toLocaleString('en-EU', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell truncate max-w-xs">
                  {p.description}
                </td>
                <td className="px-4 py-3 text-center">
                  {p.fraud_score != null ? (
                    <span className={`font-mono font-semibold ${
                      p.fraud_score < 20 ? 'text-clean' :
                      p.fraud_score < 55 ? 'text-warning' : 'text-danger'
                    }`}>
                      {p.fraud_score}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[p.status]}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {p.fraud_score == null && (
                    <button
                      onClick={() => onAnalyze(p.payment_id)}
                      className="text-xs px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors"
                    >
                      Analyze
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No payments found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
