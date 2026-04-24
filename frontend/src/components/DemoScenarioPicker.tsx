interface Scenario {
  id: string
  name: string
  description: string
  score: number
  color: string
  badge: string
}

const SCENARIOS: Scenario[] = [
  { id: 'clean',            name: 'Clean Invoice',     description: 'Authentic AWS invoice',         score: 8,  color: 'border-clean/50 hover:border-clean',    badge: 'bg-clean/20 text-clean' },
  { id: 'tampered_amount',  name: 'Tampered Amount',   description: 'Edited total field',            score: 78, color: 'border-danger/50 hover:border-danger',   badge: 'bg-danger/20 text-danger' },
  { id: 'logo_replacement', name: 'Logo Replacement',  description: 'Swapped company logo',          score: 62, color: 'border-warning/50 hover:border-warning', badge: 'bg-warning/20 text-warning' },
]

interface Props {
  onSelect: (scenarioId: string) => void
  disabled?: boolean
}

export function DemoScenarioPicker({ onSelect, disabled }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted uppercase tracking-wider font-semibold">
        Or try a demo scenario
      </p>
      <div className="grid grid-cols-3 gap-3">
        {SCENARIOS.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            disabled={disabled}
            className={`bg-card border-2 rounded-xl p-4 text-left transition-all
              ${s.color} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'}`}
          >
            <div className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${s.badge}`}>
              ~{s.score}
            </div>
            <p className="text-sm font-semibold text-slate-200">{s.name}</p>
            <p className="text-xs text-muted mt-0.5">{s.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
