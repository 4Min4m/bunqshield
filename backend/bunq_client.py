"""BunqShield — bunq Sandbox API client (3-step handshake)."""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from schemas import PaymentSummary

logger = logging.getLogger(__name__)

BUNQ_BASE = "https://public-api.sandbox.bunq.com"


class BunqClient:
    """
    bunq sandbox client.
    3-step handshake: Installation → Device Registration → Session.
    Session token cached in memory, refreshed on 401.
    """

    def __init__(self) -> None:
        self._api_key = os.getenv("BUNQ_API_KEY", "")
        self._session_token: str | None = None
        self._installation_token: str | None = None
        self._user_id: str | None = None

    # ------------------------------------------------------------------
    # Handshake
    # ------------------------------------------------------------------

    def _ensure_session(self) -> None:
        if self._session_token:
            return
        self._installation()
        self._device_server()
        self._session_server()

    def _installation(self) -> None:
        """Step 1: POST /v1/installation — register RSA public key."""
        # For sandbox demo, use a placeholder public key
        resp = httpx.post(
            f"{BUNQ_BASE}/v1/installation",
            json={"client_public_key": self._get_public_key()},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        for item in data.get("Response", []):
            if "Token" in item:
                self._installation_token = item["Token"]["token"]
        logger.info("bunq installation complete")

    def _device_server(self) -> None:
        """Step 2: POST /v1/device-server — register this app."""
        resp = httpx.post(
            f"{BUNQ_BASE}/v1/device-server",
            headers={"X-Bunq-Client-Authentication": self._installation_token or ""},
            json={"description": "BunqShield", "secret": self._api_key, "permitted_ips": ["*"]},
            timeout=10,
        )
        resp.raise_for_status()
        logger.info("bunq device registered")

    def _session_server(self) -> None:
        """Step 3: POST /v1/session-server — get session token."""
        resp = httpx.post(
            f"{BUNQ_BASE}/v1/session-server",
            headers={"X-Bunq-Client-Authentication": self._installation_token or ""},
            json={"secret": self._api_key},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        for item in data.get("Response", []):
            if "Token" in item:
                self._session_token = item["Token"]["token"]
            if "UserCompany" in item:
                self._user_id = str(item["UserCompany"]["id"])
            elif "UserPerson" in item:
                self._user_id = str(item["UserPerson"]["id"])
        logger.info("bunq session established, user_id=%s", self._user_id)

    # ------------------------------------------------------------------
    # API calls
    # ------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "X-Bunq-Client-Authentication": self._session_token or "",
            "Content-Type": "application/json",
        }

    def _get(self, path: str) -> Any:
        self._ensure_session()
        resp = httpx.get(f"{BUNQ_BASE}{path}", headers=self._headers(), timeout=10)
        if resp.status_code == 401:
            self._session_token = None
            self._ensure_session()
            resp = httpx.get(f"{BUNQ_BASE}{path}", headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_recent_payments(self, limit: int = 10) -> list[PaymentSummary]:
        if not self._api_key:
            raise RuntimeError("BUNQ_API_KEY not set")
        data = self._get(f"/v1/user/{self._user_id}/monetary-account/1/payment?count={limit}")
        payments: list[PaymentSummary] = []
        for item in data.get("Response", []):
            p = item.get("Payment", {})
            payments.append(PaymentSummary(
                payment_id=str(p.get("id", "")),
                amount=float(p.get("amount", {}).get("value", 0)),
                currency=p.get("amount", {}).get("currency", "EUR"),
                counterparty=p.get("counterparty_alias", {}).get("display_name", "Unknown"),
                description=p.get("description", ""),
                status="pending",
                fraud_score=None,
                created_at=p.get("created", ""),
            ))
        return payments

    def block_payment(self, payment_id: str) -> None:
        logger.info("bunq block payment %s (sandbox — no-op)", payment_id)

    def approve_payment(self, payment_id: str) -> None:
        logger.info("bunq approve payment %s (sandbox — no-op)", payment_id)

    def _get_public_key(self) -> str:
        """Return RSA public key PEM. In production, load from secrets manager."""
        return (
            "-----BEGIN PUBLIC KEY-----\n"
            "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLF29amygykE\n"
            "MmYz0+Kcj3bKBp29P2rFj7bMBxFBMTOiNMFMBBHBMBBHBMBBHBMBBHBMBBHBMBB\n"
            "HBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMB\n"
            "BHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBM\n"
            "BBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHB\n"
            "MBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBHBMBBH\n"
            "BQIDAQAB\n"
            "-----END PUBLIC KEY-----"
        )
