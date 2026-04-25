# BunqShield — Backend API Spec

## Overview
FastAPI 0.111 on ECS Fargate. All endpoints return JSON with `processing_time_ms`.

## Error Format
```json
{ "error": "string", "detail": "string", "status_code": 400 }
```

## Risk Level Thresholds
| Score | Risk | Action |
|-------|------|--------|
| 0–20 | clean | auto-approve |
| 20–35 | low | log for audit |
| 35–55 | medium | flag for review |
| 55–75 | high | block pending review |
| 75–100 | critical | immediate block + alert |

## Fused Score Formula
```
fused_score = 0.6 × vit_score + 0.4 × classical_score
```

## Pydantic v2 Schemas

```python
class BoundingBox(BaseModel):
    x: int; y: int; w: int; h: int

class CVMethodResult(BaseModel):
    method: str
    score: float
    details: str
    suspicious_regions: list[BoundingBox]

class ViTResult(BaseModel):
    vit_score: float
    patch_scores: list[float]       # 196 values (14×14)
    attention_map: list[list[float]] # 14×14
    heatmap_base64: str             # PNG

class FraudReport(BaseModel):
    job_id: str
    status: Literal["queued","processing","complete","failed"]
    fused_score: float
    risk_level: Literal["clean","low","medium","high","critical"]
    cv_results: list[CVMethodResult]
    vit_result: ViTResult | None
    agent_reasoning: str
    agent_decision: Literal["approve","flag","block"]
    processing_time_ms: float
    demo_mode: bool

class HealthResponse(BaseModel):
    status: Literal["ready","warming","demo"]
    demo_mode: bool
    model_loaded: bool
    version: str

class AnalyzeRequest(BaseModel):
    image_base64: str
    filename: str
    content_type: str          # must start with "image/"
    demo_scenario: str | None  # "clean"|"tampered_amount"|"logo_replacement"

class PaymentSummary(BaseModel):
    payment_id: str
    amount: float
    currency: str
    counterparty: str
    description: str
    status: Literal["pending","approved","blocked","flagged"]
    fraud_score: float | None
    created_at: str

class PaymentActionRequest(BaseModel):
    payment_id: str
    action: Literal["block","approve"]
    reason: str
```

## Endpoints

### GET /health
Returns service health. Status = "warming" if ViT not loaded, "demo" if DEMO_MODE=true.

### POST /api/analyze
- Validate content_type starts with "image/", reject >20MB decoded
- DEMO_MODE or demo_scenario provided → return preloaded result <100ms
- Otherwise → run CV + ViT + Agent pipeline
- Returns: FraudReport

### GET /api/analysis/{job_id}
Poll async result. Returns FraudReport (status may be queued/processing/complete/failed).

### GET /api/payments
- Query: limit (default 10, max 50)
- DEMO_MODE → 5 preloaded payments
- Otherwise → bunq sandbox API
- Returns: `{ "payments": [PaymentSummary], "processing_time_ms": float }`

### POST /api/payments/{payment_id}/action
- Body: PaymentActionRequest
- Returns: `{ "payment_id", "action", "success", "message", "processing_time_ms" }`

### POST /api/bunq/webhook
- Verify X-Bunq-Client-Signature header
- Parse payment event, enqueue analysis if invoice attached
- Publish to SNS if score > 55
- Returns: `{"received": true}`

### GET /api/demo/scenarios
Returns list of demo scenario metadata with expected scores.

## CORS
```python
# Allow all origins for hackathon — restrict in production
CORSMiddleware(allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
```

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| DEMO_MODE | false | Enable demo mode |
| ANTHROPIC_API_KEY | — | Claude API key |
| BUNQ_API_KEY | — | bunq sandbox key |
| AWS_REGION | us-east-1 | AWS region |
| S3_INVOICES_BUCKET | — | Invoice images |
| S3_MODELS_BUCKET | — | Model artifacts |
| DYNAMODB_TABLE | — | Results table |
| SQS_QUEUE_URL | — | Inference queue |
| SNS_TOPIC_ARN | — | Fraud alerts |
