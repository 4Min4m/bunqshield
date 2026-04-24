export type RiskLevel = 'clean' | 'low' | 'medium' | 'high' | 'critical'
export type AgentDecision = 'approve' | 'flag' | 'block'
export type JobStatus = 'queued' | 'processing' | 'complete' | 'failed'
export type PaymentStatus = 'pending' | 'approved' | 'blocked' | 'flagged'
export type AppState =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'result_clean'
  | 'result_warning'
  | 'result_blocked'
  | 'demo'

export interface BoundingBox {
  x: number
  y: number
  w: number
  h: number
}

export interface CVMethodResult {
  method: string
  score: number
  details: string
  suspicious_regions: BoundingBox[]
}

export interface ViTResult {
  vit_score: number
  patch_scores: number[]
  attention_map: number[][]
  heatmap_base64: string
}

export interface FraudReport {
  job_id: string
  status: JobStatus
  fused_score: number
  risk_level: RiskLevel
  cv_results: CVMethodResult[]
  vit_result: ViTResult | null
  agent_reasoning: string
  agent_decision: AgentDecision
  processing_time_ms: number
  demo_mode: boolean
}

export interface PaymentSummary {
  payment_id: string
  amount: number
  currency: string
  counterparty: string
  description: string
  status: PaymentStatus
  fraud_score: number | null
  created_at: string
}

export interface HealthResponse {
  status: 'ready' | 'warming' | 'demo'
  demo_mode: boolean
  model_loaded: boolean
  version: string
}

export interface DemoScenario {
  id: string
  name: string
  description: string
  expected_score: number
  expected_risk: RiskLevel
}
