# BunqShield — Architecture

## Component Diagram

```mermaid
graph TB
    subgraph Client["Browser / Client"]
        UI[React Frontend<br/>Vite + TypeScript]
    end

    subgraph AWS_Edge["AWS Edge"]
        CF[CloudFront CDN]
        APIGW[API Gateway HTTP v2]
    end

    subgraph AWS_Compute["AWS Compute"]
        LambdaRouter[Lambda: api_router<br/>Node 20 · 512MB]
        LambdaWebhook[Lambda: webhook_receiver<br/>Node 20 · 256MB]
        subgraph ECS["ECS Fargate Cluster"]
            AIService[AI Inference Service<br/>Python 3.11 · 4vCPU · 8GB<br/>FastAPI + ViT + CV Engine]
        end
    end

    subgraph AWS_Data["AWS Data"]
        S3Invoices[S3: invoice-images<br/>versioned · 90d lifecycle]
        S3Models[S3: model-artifacts<br/>private]
        DDB[DynamoDB: analysis_results<br/>PK: job_id · TTL 30d]
        SQS[SQS: inference_jobs<br/>visibility 300s]
        DLQ[SQS: inference_jobs_dlq<br/>maxReceive: 3]
        SNS[SNS: fraud_alerts]
    end

    subgraph External["External Services"]
        BunqAPI[bunq Sandbox API<br/>v1/installation<br/>v1/session-server]
        Anthropic[Anthropic API<br/>claude-sonnet-4-20250514]
    end

    UI -->|static assets| CF
    UI -->|API calls| APIGW
    APIGW --> LambdaRouter
    APIGW --> LambdaWebhook
    LambdaRouter -->|upload invoice| S3Invoices
    LambdaRouter -->|enqueue job| SQS
    LambdaRouter -->|read results| DDB
    LambdaWebhook -->|bunq events| SNS
    SQS -->|pull jobs| AIService
    SQS -->|failed jobs| DLQ
    AIService -->|load weights| S3Models
    AIService -->|write results| DDB
    AIService -->|fraud alert| SNS
    AIService -->|LLM reasoning| Anthropic
    AIService -->|payment actions| BunqAPI
```

## AI Pipeline Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as API Gateway
    participant L as Lambda Router
    participant S3 as S3
    participant Q as SQS
    participant AI as ECS AI Service
    participant DB as DynamoDB

    U->>FE: Upload invoice image
    FE->>API: POST /api/analyze
    API->>L: proxy
    L->>S3: store image → get s3_key
    L->>Q: enqueue {job_id, s3_key}
    L-->>FE: {job_id, status: queued}

    loop Poll every 2s
        FE->>API: GET /api/analysis/{job_id}
        API->>L: proxy
        L->>DB: read status
        DB-->>FE: {status: processing | complete}
    end

    Q->>AI: pull job
    AI->>S3: fetch image
    AI->>AI: Classical CV (6 methods)
    AI->>AI: DualStreamViT inference
    AI->>AI: fused_score = 0.6×vit + 0.4×classical
    AI->>AI: BunqShieldAgent ReAct loop
    AI->>DB: write FraudReport
    DB-->>FE: complete result with heatmap
```

## Key Architectural Decisions

### ECS Fargate for AI (not Lambda)
ViT-Base/16 weights are ~700MB. Lambda has a 250MB package limit. ECS Fargate
runs the model loaded once in memory, serving subsequent requests in <500ms.

### Async Queue Pattern
Heavy ViT inference is decoupled via SQS. Lambda handles fast I/O (S3 upload,
DynamoDB reads). ECS workers pull from SQS at their own pace. This prevents
API timeouts and enables horizontal scaling.

### Demo Mode
`DEMO_MODE=true` env var bypasses all external dependencies. Pre-computed
results are returned in <100ms. Frontend detects demo mode from /health and
shows a persistent amber banner. The system NEVER crashes — always falls back.

### bunq 3-Step Handshake
bunq sandbox requires: Installation → Device Registration → Session creation.
Session token is cached in memory and refreshed on 401. All payment actions
use the session token as X-Bunq-Client-Authentication header.

## Security Boundaries
- All secrets via environment variables (never hardcoded)
- S3 buckets: private, no public access
- DynamoDB: IAM role-based access from ECS task
- API Gateway: rate limiting enabled
- CORS: restricted to known origins in production (open for hackathon)
