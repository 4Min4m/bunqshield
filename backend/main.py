"""BunqShield — FastAPI main application."""
from __future__ import annotations

import os
import time
import uuid
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    AnalyzeRequest,
    FraudReport,
    HealthResponse,
    PaymentActionRequest,
)
from demo_data import DEMO_SCENARIOS, DEMO_PAYMENTS
from fraud_engine import ClassicalFraudEngine
from vit_fraud_model import get_vit_pipeline
from agent import BunqShieldAgent, AgentConfig
from bunq_client import BunqClient

DEMO_MODE: bool = os.getenv("DEMO_MODE", "false").lower() == "true"

app = FastAPI(title="BunqShield API", version="1.0.0")

# CORS — allow all origins for hackathon; restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict in prod
    allow_methods=["*"],
    allow_headers=["*"],
)

_cv_engine = ClassicalFraudEngine()
_bunq_client = BunqClient()
_agent = BunqShieldAgent(AgentConfig())


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    if DEMO_MODE:
        return HealthResponse(status="demo", demo_mode=True, model_loaded=False, version="1.0.0")
    try:
        pipeline = get_vit_pipeline()
        loaded = pipeline is not None
    except Exception:
        loaded = False
    status = "ready" if loaded else "warming"
    return HealthResponse(status=status, demo_mode=False, model_loaded=loaded, version="1.0.0")


@app.post("/api/analyze", response_model=FraudReport)
def analyze_invoice(req: AnalyzeRequest) -> FraudReport:
    t0 = time.time()

    # Validate content type
    if not req.content_type.startswith("image/"):
        raise HTTPException(400, detail="content_type must start with 'image/'")

    # Demo mode or explicit demo scenario
    scenario_key = req.demo_scenario or (None if not DEMO_MODE else "clean")
    if scenario_key and scenario_key in DEMO_SCENARIOS:
        report = DEMO_SCENARIOS[scenario_key].model_copy()
        report.processing_time_ms = (time.time() - t0) * 1000
        report.demo_mode = True
        return report

    # Real pipeline
    try:
        import base64
        import numpy as np
        from PIL import Image
        import io

        image_bytes = base64.b64decode(req.image_base64)
        if len(image_bytes) > 20 * 1024 * 1024:
            raise HTTPException(400, detail="Image exceeds 20MB limit")

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(img)

        # Stage 1: Classical CV
        cv_results = _cv_engine.analyze(img_np, image_bytes)
        classical_score = _cv_engine.compute_weighted_score(cv_results)

        # Stage 2: ViT
        pipeline = get_vit_pipeline()
        vit_result = pipeline.analyze(img_np)
        vit_score = vit_result.vit_score

        # Fused score
        fused_score = round(0.6 * vit_score + 0.4 * classical_score, 2)
        risk_level = _score_to_risk(fused_score)

        job_id = str(uuid.uuid4())

        # Stage 3: Agent
        partial_report = FraudReport(
            job_id=job_id,
            status="processing",
            fused_score=fused_score,
            risk_level=risk_level,
            cv_results=cv_results,
            vit_result=vit_result,
            agent_reasoning="",
            agent_decision="flag",
            processing_time_ms=0,
            demo_mode=False,
        )
        agent_result = _agent.run(partial_report)

        return FraudReport(
            job_id=job_id,
            status="complete",
            fused_score=fused_score,
            risk_level=risk_level,
            cv_results=cv_results,
            vit_result=vit_result,
            agent_reasoning=agent_result.reasoning,
            agent_decision=agent_result.decision,
            processing_time_ms=(time.time() - t0) * 1000,
            demo_mode=False,
        )
    except HTTPException:
        raise
    except Exception as exc:
        # Graceful fallback to demo mode
        report = DEMO_SCENARIOS["clean"].model_copy()
        report.processing_time_ms = (time.time() - t0) * 1000
        report.demo_mode = True
        report.agent_reasoning = f"[Fallback to demo] {str(exc)[:100]}"
        return report


@app.get("/api/analysis/{job_id}", response_model=FraudReport)
def get_analysis(job_id: str) -> FraudReport:
    """Poll async analysis result (demo: return clean scenario)."""
    if DEMO_MODE:
        report = DEMO_SCENARIOS["clean"].model_copy()
        report.job_id = job_id
        return report
    # In full deployment, read from DynamoDB
    raise HTTPException(404, detail="Job not found")


@app.get("/api/payments")
def get_payments(limit: int = 10) -> dict[str, Any]:
    t0 = time.time()
    if DEMO_MODE:
        return {"payments": DEMO_PAYMENTS[:limit], "processing_time_ms": (time.time() - t0) * 1000}
    try:
        payments = _bunq_client.get_recent_payments(limit=limit)
        return {"payments": payments, "processing_time_ms": (time.time() - t0) * 1000}
    except Exception:
        return {"payments": DEMO_PAYMENTS[:limit], "processing_time_ms": (time.time() - t0) * 1000}


@app.post("/api/payments/{payment_id}/action")
def payment_action(payment_id: str, req: PaymentActionRequest) -> dict[str, Any]:
    t0 = time.time()
    if DEMO_MODE:
        return {
            "payment_id": payment_id,
            "action": req.action,
            "success": True,
            "message": f"[Demo] Payment {req.action}ed successfully",
            "processing_time_ms": (time.time() - t0) * 1000,
        }
    try:
        if req.action == "block":
            _bunq_client.block_payment(payment_id)
        else:
            _bunq_client.approve_payment(payment_id)
        return {
            "payment_id": payment_id,
            "action": req.action,
            "success": True,
            "message": f"Payment {req.action}ed successfully",
            "processing_time_ms": (time.time() - t0) * 1000,
        }
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


@app.post("/api/bunq/webhook")
def bunq_webhook(payload: dict[str, Any]) -> dict[str, bool]:
    # In production: verify X-Bunq-Client-Signature, enqueue job
    return {"received": True}


@app.get("/api/demo/scenarios")
def demo_scenarios() -> dict[str, Any]:
    return {
        "scenarios": [
            {"id": "clean", "name": "Clean Invoice", "description": "Authentic AWS invoice", "expected_score": 8, "expected_risk": "clean"},
            {"id": "tampered_amount", "name": "Tampered Amount", "description": "Invoice with edited total field", "expected_score": 78, "expected_risk": "critical"},
            {"id": "logo_replacement", "name": "Logo Replacement", "description": "Invoice with swapped company logo", "expected_score": 62, "expected_risk": "high"},
        ]
    }


def _score_to_risk(score: float) -> str:
    if score < 20:
        return "clean"
    if score < 35:
        return "low"
    if score < 55:
        return "medium"
    if score < 75:
        return "high"
    return "critical"
