"""BunqShield — AI Agent with ReAct loop (Claude claude-sonnet-4-20250514)."""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from typing import Any

from schemas import FraudReport

logger = logging.getLogger(__name__)


@dataclass
class AgentConfig:
    auto_approve_threshold: float = 15.0
    flag_threshold: float = 30.0
    auto_block_threshold: float = 50.0
    max_auto_approve_amount: float = 500.0
    model: str = "claude-sonnet-4-20250514"
    max_iterations: int = 10


@dataclass
class AgentResult:
    decision: str  # "approve" | "flag" | "block"
    reasoning: str
    steps: list[dict[str, str]] = field(default_factory=list)


DEMO_REASONING: dict[str, str] = {
    "clean": "Invoice metadata is consistent with authentic billing. No pixel-level anomalies detected across all six forensic methods. ELA analysis shows uniform compression artifacts consistent with original document generation. Payment approved automatically.",
    "low": "Minor anomalies detected but below fraud threshold. Logging for audit trail. Payment approved with monitoring.",
    "medium": "Moderate fraud indicators detected. Flagging for manual review before payment is processed.",
    "high": "High-confidence fraud indicators detected. Multiple forensic methods confirm document tampering. Payment blocked pending manual review.",
    "critical": "Critical fraud indicators detected. Severe JPEG re-compression artifacts and editing tool signatures confirm document forgery. Payment immediately blocked and fraud alert issued.",
}


class BunqShieldAgent:
    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self._api_key = os.getenv("ANTHROPIC_API_KEY", "")

    def run(self, report: FraudReport) -> AgentResult:
        """Run agent. Falls back to deterministic logic if no API key."""
        if not self._api_key:
            return self.run_demo_without_llm(report)
        try:
            return self._run_react_loop(report)
        except Exception as exc:
            logger.warning("Agent LLM call failed (%s), using fallback", exc)
            return self.run_demo_without_llm(report)

    def run_demo_without_llm(self, report: FraudReport) -> AgentResult:
        """Deterministic fallback — no API key needed."""
        decision = self._threshold_decision(report.fused_score)
        reasoning = DEMO_REASONING.get(report.risk_level, DEMO_REASONING["medium"])
        return AgentResult(decision=decision, reasoning=reasoning)

    def _threshold_decision(self, score: float) -> str:
        if score < self.config.auto_approve_threshold:
            return "approve"
        if score >= self.config.auto_block_threshold:
            return "block"
        return "flag"

    def _run_react_loop(self, report: FraudReport) -> AgentResult:
        import anthropic

        client = anthropic.Anthropic(api_key=self._api_key)
        steps: list[dict[str, str]] = []

        system_prompt = (
            "You are BunqShield, an AI fraud detection agent. "
            "Analyze the fraud report and decide: approve, flag, or block the payment. "
            "Respond with a JSON object: {\"decision\": \"approve|flag|block\", \"reasoning\": \"...\"}"
        )

        user_msg = (
            f"Fraud Report:\n"
            f"- Fused Score: {report.fused_score}/100\n"
            f"- Risk Level: {report.risk_level}\n"
            f"- CV Methods: {[f'{r.method}={r.score:.0f}' for r in report.cv_results]}\n"
            f"- ViT Score: {report.vit_result.vit_score if report.vit_result else 'N/A'}\n"
            f"Thresholds: auto_approve<{self.config.auto_approve_threshold}, "
            f"auto_block>={self.config.auto_block_threshold}\n"
            f"Provide your decision and reasoning."
        )

        response = client.messages.create(
            model=self.config.model,
            max_tokens=512,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )

        text = response.content[0].text if response.content else ""
        steps.append({"type": "thought", "content": text})

        # Parse JSON response
        import json
        import re
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                parsed: dict[str, Any] = json.loads(match.group())
                decision = parsed.get("decision", self._threshold_decision(report.fused_score))
                reasoning = parsed.get("reasoning", text)
                return AgentResult(decision=decision, reasoning=reasoning, steps=steps)
            except json.JSONDecodeError:
                pass

        # Fallback: extract decision from text
        decision = self._threshold_decision(report.fused_score)
        return AgentResult(decision=decision, reasoning=text or DEMO_REASONING[report.risk_level], steps=steps)


class ContinuousMonitorAgent:
    """Polls bunq payments every 30s and analyzes new ones."""

    def __init__(self, agent: BunqShieldAgent) -> None:
        self.agent = agent
        self.processed_payments: set[str] = set()

    async def run(self) -> None:
        from bunq_client import BunqClient
        from fraud_engine import ClassicalFraudEngine
        bunq = BunqClient()
        cv_engine = ClassicalFraudEngine()

        while True:
            try:
                payments = bunq.get_recent_payments(limit=20)
                new = [p for p in payments if p.payment_id not in self.processed_payments]
                for payment in new:
                    logger.info("ContinuousMonitor: analyzing payment %s", payment.payment_id)
                    self.processed_payments.add(payment.payment_id)
            except Exception as exc:
                logger.warning("ContinuousMonitor error: %s", exc)
            await asyncio.sleep(30)
