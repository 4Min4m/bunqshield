type Step = 'cv' | 'vit' | 'agent'

const STEPS: { id: Step; label: string; icon: string }[] = [
  { id: 'cv',    label: 'Classical CV Analysis',  icon: '🔬' },
  { id: 'vit',   label: 'ViT Deep Inspection',    icon: '🧠' },
  { id: 'agent', label: 'Agent Decision',         icon: '🤖' },
]

interface Props {
  currentStep?: Step | null
}

export function AnalysisProgress({ currentStep }: Props) {
  const activeIdx = currentStep ? STEPS.findIndex(s => s.id === currentStep) : 0

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <p className="text-sm font-semibold text-slate-300">AI analyzing invoice...</p>
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const isDone = i < activeIdx
          const isActive = i === activeIdx
          return (
            <div key={step.id} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm
                ${isDone ? 'bg-clean/20 text-clean' : isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-muted'}`}>
                {isDone ? '✓' : isActive ? (
                  <span className="animate-spin inline-block">⟳</span>
                ) : step.icon}
              </div>
              <span className={`text-sm ${isActive ? 'text-slate-200 font-medium' : isDone ? 'text-clean' : 'text-muted'}`}>
                {step.label}
              </span>
              {isActive && (
                <span className="text-xs text-blue-400 animate-pulse">Processing...</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Skeleton */}
      <div className="mt-4 space-y-2 animate-pulse">
        <div className="h-3 bg-slate-700 rounded w-3/4" />
        <div className="h-3 bg-slate-700 rounded w-1/2" />
        <div className="h-3 bg-slate-700 rounded w-2/3" />
      </div>
    </div>
  )
}
