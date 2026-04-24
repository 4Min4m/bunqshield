"""BunqShield — Backend tests."""
import os
os.environ["DEMO_MODE"] = "true"

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_demo_mode():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "demo"
    assert data["demo_mode"] is True


def test_demo_scenarios_endpoint():
    resp = client.get("/api/demo/scenarios")
    assert resp.status_code == 200
    scenarios = resp.json()["scenarios"]
    assert len(scenarios) == 3
    ids = [s["id"] for s in scenarios]
    assert "clean" in ids
    assert "tampered_amount" in ids
    assert "logo_replacement" in ids


def test_analyze_clean_scenario():
    resp = client.post("/api/analyze", json={
        "image_base64": "iVBORw0KGgo=",
        "filename": "test.png",
        "content_type": "image/png",
        "demo_scenario": "clean",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["fused_score"] == 8.0
    assert data["risk_level"] == "clean"
    assert data["agent_decision"] == "approve"
    assert data["demo_mode"] is True


def test_analyze_tampered_scenario():
    resp = client.post("/api/analyze", json={
        "image_base64": "iVBORw0KGgo=",
        "filename": "test.png",
        "content_type": "image/png",
        "demo_scenario": "tampered_amount",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["fused_score"] == 78.0
    assert data["risk_level"] == "critical"
    assert data["agent_decision"] == "block"


def test_analyze_rejects_invalid_content_type():
    resp = client.post("/api/analyze", json={
        "image_base64": "abc",
        "filename": "test.pdf",
        "content_type": "application/pdf",
        "demo_scenario": None,
    })
    assert resp.status_code == 400


def test_get_payments_demo():
    resp = client.get("/api/payments")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["payments"]) > 0
    assert "processing_time_ms" in data


def test_payment_action_demo():
    resp = client.post("/api/payments/pay-001/action", json={
        "payment_id": "pay-001",
        "action": "block",
        "reason": "Test block",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["action"] == "block"


def test_fraud_score_thresholds():
    from main import _score_to_risk
    assert _score_to_risk(10) == "clean"
    assert _score_to_risk(25) == "low"
    assert _score_to_risk(45) == "medium"
    assert _score_to_risk(65) == "high"
    assert _score_to_risk(80) == "critical"
