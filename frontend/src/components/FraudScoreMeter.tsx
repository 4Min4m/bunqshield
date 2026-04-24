import { useEffect, useState } from 'react'
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'
import type { RiskLevel } from '../types'

const RISK_LABELS: Record<RiskLevel, string> = {
  clean: 'CLEAN',
  low: 'LOW RISK',
  medium: 'MEDIUM RISK',
  high: 'HIGH RISK',
  critical: 'CRITICAL',
}

const RISK_COLORS: Record<RiskLevel, string> = {
  clean: '#10B981',
  low: '#3B82F6',
  medium: '#F59E0B',
  high: '#F97316',
  critical: '#EF4444',
}

interface Props {
  score: number
  riskLevel: RiskLevel
}

export function FraudScoreMeter({ score, riskLevel }: Props) {
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    let frame: number
    const start = performance.now()
    const duration = 800

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      setDisplayed(Math.round(progress * score))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [score])

  const color = RISK_COLORS[riskLevel]
  const data = [{ value: displayed, fill: color }]

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            startAngle={225}
            endAngle={-45}
            data={[{ value: 100, fill: '#334155' }, ...data]}
          >
            <RadialBar dataKey="value" cornerRadius={6} background={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold" style={{ color }}>{displayed}</span>
          <span className="text-xs text-muted mt-1">/ 100</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-semibold tracking-widest" style={{ color }}>
        {RISK_LABELS[riskLevel]}
      </span>
    </div>
  )
}
