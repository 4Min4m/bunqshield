# BunqShield — Tech Stack

## Backend
| Package | Version | Purpose |
|---------|---------|---------|
| Python | 3.11 | Runtime |
| FastAPI | 0.111 | API framework |
| Uvicorn | latest | ASGI server |
| PyTorch | 2.2 | ViT inference |
| timm | latest | ViT-Base/16 pretrained weights |
| OpenCV | 4.9 | Classical CV methods |
| scikit-image | latest | Image processing utilities |
| anthropic | latest | Claude claude-sonnet-4-20250514 agent |
| Pydantic | v2 | Request/response schemas |
| boto3 | latest | AWS SDK (S3, DynamoDB, SQS, SNS) |
| Pillow | latest | Image I/O |
| numpy | latest | Array operations |
| ruff | latest | Linting |
| mypy | latest | Type checking |
| pytest | latest | Testing |

## Frontend
| Package | Version | Purpose |
|---------|---------|---------|
| React | 18 | UI framework |
| Vite | 5 | Build tool |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 3 | Styling |
| shadcn/ui | latest | Component library |
| Recharts | latest | Fraud score visualization |
| react-dropzone | latest | Invoice upload |
| Zustand | latest | State management |

## Infrastructure
| Service | Purpose |
|---------|---------|
| AWS CDK v2 (TypeScript) | Infrastructure as code |
| Amazon ECS Fargate | AI inference service (4 vCPU, 8GB RAM) |
| AWS Lambda (Node 20) | API routing + webhook receiver |
| Amazon API Gateway HTTP v2 | API entry point |
| Amazon S3 | Invoice images + model artifacts |
| Amazon DynamoDB | Analysis results + audit log |
| Amazon SQS | Async inference job queue |
| Amazon SNS | Fraud alert notifications |
| Amazon ECR | Docker image registry |
| Amazon CloudFront | Frontend CDN |
| Amazon CloudWatch | Logs + alarms + dashboard |

## DevOps
| Tool | Purpose |
|------|---------|
| Docker | Multi-stage container builds |
| GitHub Actions | CI/CD pipeline |
| AWS CDK | All infrastructure provisioning |

## Design System
- Background: `#0F172A`
- Card: `#1E293B`
- Primary: `#3B82F6`
- Clean/Safe: `#10B981`
- Warning: `#F59E0B`
- High/Critical: `#EF4444`
- Font: Inter (system stack fallback)
