#!/bin/bash
set -e

AWS_REGION=${AWS_REGION:-eu-west-1}
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/bunqshield-ai-service"
IMAGE_TAG=$(git rev-parse --short HEAD)

echo "==> [1/5] Building Docker image (tag: ${IMAGE_TAG})..."
docker build -t "bunqshield-ai-service:${IMAGE_TAG}" ./backend

echo "==> [2/5] Pushing to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${ECR_REPO}"
docker tag "bunqshield-ai-service:${IMAGE_TAG}" "${ECR_REPO}:${IMAGE_TAG}"
docker tag "bunqshield-ai-service:${IMAGE_TAG}" "${ECR_REPO}:latest"
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:latest"

echo "==> [3/5] Deploying CDK stack..."
cd infra
npm ci --silent
npx cdk deploy --require-approval never --context "imageTag=${IMAGE_TAG}"
cd ..

echo "==> [4/5] Building and uploading frontend..."
cd frontend
npm ci --silent
npm run build
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name BunqShieldStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" \
  --output text)
aws s3 sync dist/ "s3://${FRONTEND_BUCKET}/" --delete
cd ..

echo "==> [5/5] Invalidating CloudFront cache..."
CF_DIST=$(aws cloudformation describe-stacks \
  --stack-name BunqShieldStack \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)
aws cloudfront create-invalidation --distribution-id "${CF_DIST}" --paths "/*" > /dev/null

echo ""
echo "✅ Deployment complete!"
echo "🌐 Live URL:"
aws cloudformation describe-stacks \
  --stack-name BunqShieldStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
  --output text
