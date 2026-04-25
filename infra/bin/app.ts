#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { BunqShieldStack } from '../lib/bunqshield-stack'

const app = new cdk.App()
new BunqShieldStack(app, 'BunqShieldStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
})
