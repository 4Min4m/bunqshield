# BunqShield — Frontend UI Spec

## Stack
React 18 + Vite 5 + TypeScript strict + Tailwind CSS v3 + shadcn/ui + Recharts + react-dropzone + Zustand

## Design Tokens
```
bg-base: #0F172A  |  bg-card: #1E293B  |  primary: #3B82F6
clean: #10B981    |  warning: #F59E0B  |  danger: #EF4444
text: #F1F5F9     |  muted: #94A3B8    |  border: #334155
```

## App States
```typescript
type AppState = "idle" | "uploading" | "analyzing" | "result_clean"
              | "result_warning" | "result_blocked" | "demo"
```

## Zustand Store
```typescript
interface BunqShieldStore {
  appState: AppState
  demoMode: boolean
  currentReport: FraudReport | null
  payments: PaymentSummary[]
  activeJobId: string | null
  setAppState: (s: AppState) => void
  uploadInvoice: (file: File, demoScenario?: string) => Promise<void>
  pollAnalysis: (jobId: string) => void
  stopPolling: () => void
  loadPayments: () => Promise<void>
  triggerPaymentAction: (id: string, action: "block"|"approve") => Promise<void>
  checkDemoMode: () => Promise<void>
}
```

## Component Tree
```
App
├── DemoModeBanner (when demoMode=true)
├── Header (logo, tabs)
├── InvoiceAnalysisTab
│   ├── InvoiceDrop
│   ├── DemoScenarioPicker
│   ├── AnalysisProgress (during "analyzing")
│   └── ResultPanel
│       ├── FraudScoreMeter
│       ├── RiskBadge
│       ├── HeatmapOverlay
│       ├── AnalysisBreakdown
│       └── AgentChat
└── PaymentsDashboardTab
    ├── PaymentsTable
    └── PaymentDetailModal
```

## Component Specs

### DemoModeBanner
Fixed top bar, amber bg, full width, z-50.
Text: "⚠ DEMO MODE — Using simulated data. No real payments affected."

### InvoiceDrop
- Drag-and-drop zone, dashed border, accept image/*
- On file: show thumbnail preview + filename + size
- "Analyze Invoice" button (disabled until file selected)

### DemoScenarioPicker
Three cards: Clean (green, ~8), Tampered Amount (red, ~78), Logo Replacement (orange, ~62).
Click triggers analysis immediately with that scenario.

### AnalysisProgress
Three-step indicator: Classical CV → ViT Deep Inspection → Agent Decision.
Active step: spinner. Complete: checkmark. Skeleton below for result.

### FraudScoreMeter
- Radial gauge 0–100, color-coded (green/yellow/red)
- Animated count-up over 800ms
- Risk label below: CLEAN / LOW RISK / MEDIUM RISK / HIGH RISK / CRITICAL

### RiskBadge
Large pill badge per risk level:
- clean → green, "✓ Payment Safe — Auto Approved"
- medium → yellow, "⚠ Review Recommended"
- high → orange, "⛔ Payment Blocked — Pending Review"
- critical → red + pulse, "🚨 CRITICAL — Payment Immediately Blocked"

### HeatmapOverlay
- Invoice image base layer + heatmap PNG at 40% opacity
- Toggle "Show/Hide Heatmap" button
- Red bounding boxes for suspicious regions
- Click to expand full-width modal

### AnalysisBreakdown
One expandable card per CV method (6 total), sorted by score desc.
Collapsed: name + score bar. Expanded: + details text + region count.

### AgentChat
Chat-bubble style ReAct steps: Thought (gray) → Action (blue) → Observation (green).
Final decision as prominent card. "Powered by Claude claude-sonnet-4-20250514" footer.

### PaymentsTable
Columns: Date | Counterparty | Amount | Description | Fraud Score | Status | Actions
Status badges: pending/approved/blocked/flagged. Refresh button top-right.

### PaymentDetailModal
Payment details + FraudScoreMeter + RiskBadge + AnalysisBreakdown if report exists.
Block / Approve action buttons.

## API Client (src/api/client.ts)
```typescript
const BASE = import.meta.env.VITE_API_URL ?? "/api"
export const api = {
  health: () => GET(`${BASE}/health`),
  analyze: (req: AnalyzeRequest) => POST(`${BASE}/api/analyze`, req),
  getAnalysis: (jobId: string) => GET(`${BASE}/api/analysis/${jobId}`),
  getPayments: (limit = 10) => GET(`${BASE}/api/payments?limit=${limit}`),
  paymentAction: (id: string, req: PaymentActionRequest) =>
    POST(`${BASE}/api/payments/${id}/action`, req),
  getDemoScenarios: () => GET(`${BASE}/api/demo/scenarios`),
}
```
Polling: setInterval every 2000ms, stop on status complete/failed.

## Types (src/types/index.ts)
Mirror all Pydantic schemas as TypeScript interfaces. No `any`. Use `unknown` + type guards.

## Env
```
VITE_API_URL=http://localhost:8000   # dev
VITE_API_URL=https://api.bunqshield.example.com  # prod
```
