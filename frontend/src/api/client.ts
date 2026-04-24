import type { FraudReport, HealthResponse, PaymentSummary } from '../types'

export interface AnalyzeRequest {
  image_base64: string
  filename: string
  content_type: string
  demo_scenario?: string
}

export interface PaymentActionRequest {
  payment_id: string
  action: 'block' | 'approve'
  reason: string
}

const BASE = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error((err as { detail?: string }).detail ?? 'Request failed')
  }
  return resp.json() as Promise<T>
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  analyze: (req: AnalyzeRequest) =>
    request<FraudReport>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  getAnalysis: (jobId: string) =>
    request<FraudReport>(`/api/analysis/${jobId}`),

  getPayments: (limit = 10) =>
    request<{ payments: PaymentSummary[]; processing_time_ms: number }>(
      `/api/payments?limit=${limit}`
    ),

  paymentAction: (id: string, req: PaymentActionRequest) =>
    request<{ payment_id: string; action: string; success: boolean; message: string }>(
      `/api/payments/${id}/action`,
      { method: 'POST', body: JSON.stringify(req) }
    ),

  getDemoScenarios: () =>
    request<{ scenarios: Array<{ id: string; name: string; description: string; expected_score: number; expected_risk: string }> }>(
      '/api/demo/scenarios'
    ),
}
