# BunqShield — Deployment Spec

## AWS CDK Stack: lib/bunqshield-stack.ts

Single stack, all resources. TypeScript CDK v2.

### Resources

**1. VPC**
- 2 AZs, 1 NAT gateway (cost optimization)
- Public + private subnets

**2. ECR Repository**
- Name: `bunqshield-ai-service`
- Image tag mutability: MUTABLE
- Lifecycle: keep last 10 images

**3. ECS Fargate Cluster + Service**
- Task: 4 vCPU, 8192 MB RAM
- Container port: 8000
- Health check: GET /health, expect status "ready" or "demo", interval 30s, retries 3
- Auto-scaling: min=1, max=4, scale-out when SQS depth > 10
- ALB with HTTPS listener (self-signed cert for hackathon)
- Environment vars injected from Secrets Manager / SSM

**4. S3: invoice-images**
- Versioned: true
- Lifecycle: expire non-current versions after 90 days
- Block all public access
- CORS: allow PUT/GET from API Gateway origin

**5. S3: model-artifacts**
- Private, no lifecycle rule
- Block all public access

**6. DynamoDB: analysis_results**
- PK: job_id (String)
- TTL attribute: expires_at (30 days from creation)
- Billing: PAY_PER_REQUEST
- Point-in-time recovery: enabled

**7. SQS: inference_jobs**
- Visibility timeout: 300s
- Message retention: 4 days
- Dead-letter queue: inference_jobs_dlq, maxReceiveCount=3

**8. SNS: fraud_alerts**
- Topic name: bunqshield-fraud-alerts
- Email subscription via env var ALERT_EMAIL (optional)

**9. Lambda: api_router**
- Runtime: Node 20
- Memory: 512 MB
- Timeout: 30s
- Handler: index.handler
- Env: ECS_SERVICE_URL, DYNAMODB_TABLE, S3_INVOICES_BUCKET, SQS_QUEUE_URL

**10. Lambda: webhook_receiver**
- Runtime: Node 20
- Memory: 256 MB
- Timeout: 10s
- Handler: webhook.handler
- Env: SNS_TOPIC_ARN, SQS_QUEUE_URL

**11. API Gateway HTTP v2**
- Routes: `ANY /{proxy+}` → api_router Lambda
- Route: `POST /api/bunq/webhook` → webhook_receiver Lambda
- CORS: enabled for all origins (hackathon)
- Throttling: 1000 req/s burst, 500 req/s steady

**12. CloudFront Distribution**
- Origin: S3 static site bucket (frontend build)
- Default root object: index.html
- Custom error: 404 → /index.html (SPA routing)
- Cache policy: CachingOptimized for assets, no-cache for index.html

**13. CloudWatch Dashboard: BunqShield**
Widgets:
- ECS task CPU utilization
- ECS task memory utilization
- SQS queue depth (inference_jobs)
- API Gateway 4xx rate
- API Gateway 5xx rate
- Lambda api_router duration p99
- Lambda api_router error rate

---

## scripts/deploy.sh

```bash
#!/bin/bash
set -e

AWS_REGION=${AWS_REGION:-eu-west-1}
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/bunqshield-ai-service"
IMAGE_TAG=$(git rev-parse --short HEAD)

echo "==> Building Docker image..."
docker build -t bunqshield-ai-service:${IMAGE_TAG} ./backend

echo "==> Pushing to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_REPO}
docker tag bunqshield-ai-service:${IMAGE_TAG} ${ECR_REPO}:${IMAGE_TAG}
docker tag bunqshield-ai-service:${IMAGE_TAG} ${ECR_REPO}:latest
docker push ${ECR_REPO}:${IMAGE_TAG}
docker push ${ECR_REPO}:latest

echo "==> Deploying CDK stack..."
cd infra
npm ci
npx cdk deploy --require-approval never \
  --context imageTag=${IMAGE_TAG}

echo "==> Building frontend..."
cd ../frontend
npm ci
npm run build

echo "==> Uploading frontend to S3..."
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name BunqShieldStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" \
  --output text)
aws s3 sync dist/ s3://${FRONTEND_BUCKET}/ --delete

echo "==> Invalidating CloudFront cache..."
CF_DIST=$(aws cloudformation describe-stacks \
  --stack-name BunqShieldStack \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)
aws cloudfront create-invalidation --distribution-id ${CF_DIST} --paths "/*"

echo "==> Live URL:"
aws cloudformation describe-stacks \
  --stack-name BunqShieldStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
  --output text
```

---

## GitHub Actions: .github/workflows/deploy.yml

Trigger: push to main, PR to main

Jobs:
1. **lint-backend**: ruff check + mypy (Python 3.11)
2. **lint-frontend**: eslint + tsc --noEmit
3. **test-backend**: pytest (skip GPU tests with `-m "not gpu"`)
4. **build-push** (main only): docker build + ECR push
5. **cdk-diff** (PR only): cdk diff, post as PR comment
6. **deploy** (main only): scripts/deploy.sh

---

## Docker: backend/Dockerfile

```dockerfile
# Stage 1: builder
FROM python:3.11-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: runtime
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY . .
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
ENTRYPOINT ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

## Docker: frontend/Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

nginx.conf: try_files $uri $uri/ /index.html (SPA routing).
