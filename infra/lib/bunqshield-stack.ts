import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigwv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling'
import { Construct } from 'constructs'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'

export class BunqShieldStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const imageTag = this.node.tryGetContext('imageTag') as string ?? 'latest'

    // 1. VPC — 2 AZs, 1 NAT gateway
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
    })

    // 2. ECR repository
    const ecrRepo = new ecr.Repository(this, 'AiServiceRepo', {
      repositoryName: 'bunqshield-ai-service',
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 10 }],
    })

    // 3. S3: invoice images
    const invoicesBucket = new s3.Bucket(this, 'InvoicesBucket', {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{
        noncurrentVersionExpiration: Duration.days(90),
      }],
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // 4. S3: model artifacts
    const modelsBucket = new s3.Bucket(this, 'ModelsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // 5. DynamoDB: analysis_results
    const analysisTable = new dynamodb.Table(this, 'AnalysisTable', {
      tableName: 'bunqshield-analysis-results',
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expires_at',
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // 6. SQS: inference_jobs + DLQ
    const dlq = new sqs.Queue(this, 'InferenceDlq', {
      queueName: 'bunqshield-inference-jobs-dlq',
      retentionPeriod: Duration.days(14),
    })

    const inferenceQueue = new sqs.Queue(this, 'InferenceQueue', {
      queueName: 'bunqshield-inference-jobs',
      visibilityTimeout: Duration.seconds(300),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    })

    // 7. SNS: fraud_alerts
    const fraudAlertsTopic = new sns.Topic(this, 'FraudAlerts', {
      topicName: 'bunqshield-fraud-alerts',
    })

    // 8. ECS Fargate cluster + AI service
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc })

    const taskDef = new ecs.FargateTaskDefinition(this, 'AiTaskDef', {
      cpu: 4096,
      memoryLimitMiB: 8192,
    })

    // Grant task access to AWS resources
    invoicesBucket.grantReadWrite(taskDef.taskRole)
    modelsBucket.grantRead(taskDef.taskRole)
    analysisTable.grantReadWriteData(taskDef.taskRole)
    inferenceQueue.grantConsumeMessages(taskDef.taskRole)
    fraudAlertsTopic.grantPublish(taskDef.taskRole)

    taskDef.addContainer('AiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepo, imageTag),
      portMappings: [{ containerPort: 8000 }],
      environment: {
        AWS_REGION: this.region,
        S3_INVOICES_BUCKET: invoicesBucket.bucketName,
        S3_MODELS_BUCKET: modelsBucket.bucketName,
        DYNAMODB_TABLE: analysisTable.tableName,
        SQS_QUEUE_URL: inferenceQueue.queueUrl,
        SNS_TOPIC_ARN: fraudAlertsTopic.topicArn,
        DEMO_MODE: 'false',
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'bunqshield-ai' }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8000/health || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    })

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
    })

    const aiService = new ecs.FargateService(this, 'AiService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: false,
    })

    const listener = alb.addListener('Listener', { port: 80 })
    listener.addTargets('AiTarget', {
      port: 8000,
      targets: [aiService],
      healthCheck: { path: '/health' },
    })

    // Auto-scaling based on SQS depth
    const scaling = aiService.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 4 })
    scaling.scaleOnMetric('SqsScaling', {
      metric: inferenceQueue.metricApproximateNumberOfMessagesVisible(),
      scalingSteps: [
        { upper: 0, change: -1 },
        { lower: 10, change: +1 },
        { lower: 50, change: +2 },
      ],
      adjustmentType: appscaling.AdjustmentType.CHANGE_IN_CAPACITY,
    })

    // 9. Lambda: api_router
    const apiRouterFn = new lambda.Function(this, 'ApiRouter', {
      functionName: 'bunqshield-api-router',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const url = process.env.ECS_SERVICE_URL + event.rawPath + (event.rawQueryString ? '?' + event.rawQueryString : '');
          const https = require('https');
          const http = require('http');
          const client = url.startsWith('https') ? https : http;
          return new Promise((resolve) => {
            const req = client.request(url, { method: event.requestContext.http.method, headers: event.headers }, (res) => {
              let body = '';
              res.on('data', d => body += d);
              res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
            });
            req.on('error', () => resolve({ statusCode: 502, body: '{"error":"upstream error"}' }));
            if (event.body) req.write(event.body);
            req.end();
          });
        };
      `),
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        ECS_SERVICE_URL: `http://${alb.loadBalancerDnsName}`,
        DYNAMODB_TABLE: analysisTable.tableName,
        S3_INVOICES_BUCKET: invoicesBucket.bucketName,
        SQS_QUEUE_URL: inferenceQueue.queueUrl,
      },
    })

    // 10. Lambda: webhook_receiver
    const webhookFn = new lambda.Function(this, 'WebhookReceiver', {
      functionName: 'bunqshield-webhook-receiver',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async () => ({ statusCode: 200, body: '{"received":true}' });
      `),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        SNS_TOPIC_ARN: fraudAlertsTopic.topicArn,
        SQS_QUEUE_URL: inferenceQueue.queueUrl,
      },
    })

    // 11. API Gateway HTTP v2
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'bunqshield-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['*'],
      },
    })

    httpApi.addRoutes({
      path: '/api/bunq/webhook',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2integrations.HttpLambdaIntegration('WebhookInt', webhookFn),
    })

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: new apigwv2integrations.HttpLambdaIntegration('RouterInt', apiRouterFn),
    })

    // 12. S3 frontend bucket + CloudFront
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    })

    // 13. CloudWatch Dashboard
    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'BunqShield',
      widgets: [[
        new cloudwatch.GraphWidget({
          title: 'ECS CPU',
          left: [aiService.metricCpuUtilization()],
        }),
        new cloudwatch.GraphWidget({
          title: 'ECS Memory',
          left: [aiService.metricMemoryUtilization()],
        }),
        new cloudwatch.GraphWidget({
          title: 'SQS Queue Depth',
          left: [inferenceQueue.metricApproximateNumberOfMessagesVisible()],
        }),
        new cloudwatch.GraphWidget({
          title: 'Lambda Duration p99',
          left: [apiRouterFn.metricDuration({ statistic: 'p99' })],
        }),
      ]],
    })

    // Outputs
    new cdk.CfnOutput(this, 'FrontendUrl', { value: `https://${distribution.distributionDomainName}` })
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint })
    new cdk.CfnOutput(this, 'FrontendBucket', { value: frontendBucket.bucketName })
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', { value: distribution.distributionId })
    new cdk.CfnOutput(this, 'AlbDns', { value: alb.loadBalancerDnsName })
  }
}
