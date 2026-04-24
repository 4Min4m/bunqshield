# BunqShield — Product Vision

## Vision
BunqShield is an AI-powered invoice fraud detection and autonomous payment protection system integrated with the bunq banking API. It analyzes invoice images in real-time using computer vision and a Vision Transformer model to detect tampering, forgery, and fraud before payments are authorized.

## Problem Statement
Invoice fraud costs businesses billions annually. Traditional rule-based systems miss sophisticated forgeries. BunqShield applies state-of-the-art computer vision and AI reasoning to catch fraud that humans and legacy systems miss — directly inside the payment flow.

## User Stories

### Primary User: Finance Manager / Business Owner
- As a finance manager, I want to upload an invoice and get an instant fraud risk score so I can decide whether to approve the payment.
- As a business owner, I want suspicious payments automatically blocked so I don't have to manually review every transaction.
- As a user, I want to see exactly which parts of an invoice look suspicious so I can understand the AI's reasoning.
- As a user, I want the system to work even when I'm offline or in demo mode so I can evaluate it without setup.

### Secondary User: Hackathon Judge / Technical Evaluator
- As a judge, I want to see the AI pipeline steps (CV → ViT → Agent) so I can assess technical depth.
- As a judge, I want to see real bunq sandbox integration so I can verify the banking connection.
- As a judge, I want to inspect the architecture and code quality so I can evaluate production-readiness.

## Success Criteria
1. Invoice upload → fraud score in < 5 seconds (demo mode < 100ms)
2. All 6 CV methods produce interpretable scores with explanations
3. ViT heatmap correctly highlights tampered regions
4. Agent produces human-readable reasoning for every decision
5. bunq sandbox: list payments, analyze attached invoices, block/approve
6. Demo mode works with zero external dependencies (no API keys, no model weights)
7. UI looks like a production fintech feature, not a hackathon prototype
8. System never crashes on stage — always falls back to demo mode gracefully

## Key Differentiators
- **Dual-stream ViT**: RGB + ELA streams with cross-attention fusion
- **Autonomous agent**: ReAct loop with tool use, not just a score
- **bunq-native**: Deep integration with bunq sandbox API
- **Explainable AI**: Every decision has a visual and textual explanation
- **Production-ready architecture**: ECS Fargate, CDK, CI/CD — not a toy

## Demo Scenarios
1. **Clean Invoice** — authentic AWS invoice, score=8, auto-approved
2. **Tampered Amount** — edited total field, score=78, auto-blocked
3. **Logo Replacement** — swapped company logo, score=62, flagged for review
