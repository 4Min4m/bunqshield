"""BunqShield — Pydantic v2 schemas."""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel


class BoundingBox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class CVMethodResult(BaseModel):
    method: str
    score: float
    details: str
    suspicious_regions: List[BoundingBox] = []


class ViTResult(BaseModel):
    vit_score: float
    patch_scores: List[float]        # 196 values (14×14)
    attention_map: List[List[float]] # 14×14
    heatmap_base64: str              # PNG base64


class FraudReport(BaseModel):
    job_id: str
    status: Literal["queued", "processing", "complete", "failed"]
    fused_score: float
    risk_level: Literal["clean", "low", "medium", "high", "critical"]
    cv_results: List[CVMethodResult]
    vit_result: Optional[ViTResult] = None
    agent_reasoning: str
    agent_decision: Literal["approve", "flag", "block"]
    processing_time_ms: float = 0.0
    demo_mode: bool = False


class HealthResponse(BaseModel):
    status: Literal["ready", "warming", "demo"]
    demo_mode: bool
    model_loaded: bool
    version: str


class AnalyzeRequest(BaseModel):
    image_base64: str
    filename: str
    content_type: str
    demo_scenario: Optional[str] = None


class PaymentSummary(BaseModel):
    payment_id: str
    amount: float
    currency: str
    counterparty: str
    description: str
    status: Literal["pending", "approved", "blocked", "flagged"]
    fraud_score: Optional[float] = None
    created_at: str


class PaymentActionRequest(BaseModel):
    payment_id: str
    action: Literal["block", "approve"]
    reason: str
