import { create } from 'zustand'
import { api } from '../api/client'
import type { AppState, FraudReport, PaymentSummary } from '../types'

interface BunqShieldStore {
  appState: AppState
  demoMode: boolean
  currentReport: FraudReport | null
  payments: PaymentSummary[]
  activeJobId: string | null
  _pollTimer: ReturnType<typeof setInterval> | null

  setAppState: (s: AppState) => void
  checkDemoMode: () => Promise<void>
  uploadInvoice: (file: File, demoScenario?: string) => Promise<void>
  pollAnalysis: (jobId: string) => void
  stopPolling: () => void
  loadPayments: () => Promise<void>
  triggerPaymentAction: (id: string, action: 'block' | 'approve') => Promise<void>
}

export const useStore = create<BunqShieldStore>((set, get) => ({
  appState: 'idle',
  demoMode: false,
  currentReport: null,
  payments: [],
  activeJobId: null,
  _pollTimer: null,

  setAppState: (s) => set({ appState: s }),

  checkDemoMode: async () => {
    try {
      const health = await api.health()
      set({ demoMode: health.demo_mode || health.status === 'demo' })
    } catch {
      set({ demoMode: true })
    }
  },

  uploadInvoice: async (file, demoScenario) => {
    set({ appState: 'uploading', currentReport: null })
    try {
      const base64 = await fileToBase64(file)
      set({ appState: 'analyzing' })
      const report = await api.analyze({
        image_base64: base64,
        filename: file.name,
        content_type: file.type || 'image/png',
        demo_scenario: demoScenario,
      })
      applyReport(set, report)
    } catch (err) {
      console.error('Upload failed:', err)
      set({ appState: 'idle' })
    }
  },

  pollAnalysis: (jobId) => {
    const timer = setInterval(async () => {
      try {
        const report = await api.getAnalysis(jobId)
        if (report.status === 'complete' || report.status === 'failed') {
          get().stopPolling()
          applyReport(set, report)
        }
      } catch {
        get().stopPolling()
      }
    }, 2000)
    set({ activeJobId: jobId, _pollTimer: timer })
  },

  stopPolling: () => {
    const { _pollTimer } = get()
    if (_pollTimer) clearInterval(_pollTimer)
    set({ _pollTimer: null, activeJobId: null })
  },

  loadPayments: async () => {
    try {
      const { payments } = await api.getPayments(10)
      set({ payments })
    } catch {
      // silently fail — demo data shown
    }
  },

  triggerPaymentAction: async (id, action) => {
    await api.paymentAction(id, { payment_id: id, action, reason: `Manual ${action}` })
    await get().loadPayments()
  },
}))

function applyReport(
  set: (partial: Partial<BunqShieldStore>) => void,
  report: FraudReport
) {
  let appState: AppState = 'result_warning'
  if (report.risk_level === 'clean' || report.risk_level === 'low') appState = 'result_clean'
  else if (report.risk_level === 'high' || report.risk_level === 'critical') appState = 'result_blocked'
  set({ currentReport: report, appState })
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
