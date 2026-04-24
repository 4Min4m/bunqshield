"""BunqShield — Classical CV fraud detection engine (6 methods)."""
import io
from typing import Any

import cv2
import numpy as np
from PIL import Image

from schemas import BoundingBox, CVMethodResult


class ClassicalFraudEngine:
    """Six classical computer vision fraud detection methods."""

    def analyze(self, image: np.ndarray, image_bytes: bytes = b"") -> list[CVMethodResult]:
        results = [
            self._ela(image, image_bytes),
            self._copy_move(image),
            self._noise_inconsistency(image),
            self._font_consistency(image),
            self._metadata_forensics(image_bytes),
            self._edge_coherence(image),
        ]
        return results

    def compute_weighted_score(self, results: list[CVMethodResult]) -> float:
        weights = {
            "ela": 0.25, "copy_move": 0.20, "noise_inconsistency": 0.20,
            "font_consistency": 0.15, "metadata_forensics": 0.10, "edge_coherence": 0.10,
        }
        total = sum(r.score * weights.get(r.method, 0.1) for r in results)
        return round(min(100.0, total), 2)

    # ------------------------------------------------------------------
    def _ela(self, image: np.ndarray, image_bytes: bytes) -> CVMethodResult:
        """Error Level Analysis — JPEG re-compression at quality=90, amplify ×15."""
        try:
            pil_img = Image.fromarray(image)
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=90)
            buf.seek(0)
            recompressed = np.array(Image.open(buf).convert("RGB"))
            diff = np.abs(image.astype(np.float32) - recompressed.astype(np.float32))
            amplified = np.clip(diff * 15, 0, 255).astype(np.uint8)
            gray = cv2.cvtColor(amplified, cv2.COLOR_RGB2GRAY)
            flat = gray.flatten()
            threshold = np.percentile(flat, 95)
            score = float(np.mean(flat[flat >= threshold]))
            score = min(100.0, score)

            regions: list[BoundingBox] = []
            _, mask = cv2.threshold(gray, int(threshold), 255, cv2.THRESH_BINARY)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                if cv2.contourArea(c) > 500:
                    x, y, w, h = cv2.boundingRect(c)
                    regions.append(BoundingBox(x=x, y=y, w=w, h=h))

            return CVMethodResult(
                method="ela", score=round(score, 2),
                details=f"ELA mean top-5% intensity: {score:.1f}. {len(regions)} suspicious region(s) detected.",
                suspicious_regions=regions[:5],
            )
        except Exception as exc:
            return CVMethodResult(method="ela", score=0.0, details=f"ELA failed: {exc}")

    def _copy_move(self, image: np.ndarray) -> CVMethodResult:
        """Copy-Move Detection — ORB features, brute-force self-matching."""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            orb = cv2.ORB_create(nfeatures=1000)
            kp, des = orb.detectAndCompute(gray, None)
            if des is None or len(des) < 10:
                return CVMethodResult(method="copy_move", score=0.0, details="Insufficient features for copy-move analysis.")

            bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
            matches = bf.match(des, des)
            suspicious = [
                m for m in matches
                if m.distance < 30 and m.queryIdx != m.trainIdx
                and np.linalg.norm(
                    np.array(kp[m.queryIdx].pt) - np.array(kp[m.trainIdx].pt)
                ) > 20
            ]

            # Cluster nearby match pairs
            clusters = 0
            used: set[int] = set()
            for i, m in enumerate(suspicious):
                if i in used:
                    continue
                cluster = [m]
                pt1 = np.array(kp[m.queryIdx].pt)
                for j, n in enumerate(suspicious):
                    if j != i and j not in used:
                        pt2 = np.array(kp[n.queryIdx].pt)
                        if np.linalg.norm(pt1 - pt2) < 50:
                            cluster.append(n)
                            used.add(j)
                if len(cluster) >= 3:
                    clusters += 1
                used.add(i)

            score = min(100.0, clusters * 15.0)
            return CVMethodResult(
                method="copy_move", score=round(score, 2),
                details=f"{clusters} copy-move cluster(s) detected from {len(suspicious)} suspicious feature matches.",
            )
        except Exception as exc:
            return CVMethodResult(method="copy_move", score=0.0, details=f"Copy-move failed: {exc}")

    def _noise_inconsistency(self, image: np.ndarray) -> CVMethodResult:
        """Noise Inconsistency — Laplacian high-pass, block-level MAD comparison."""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY).astype(np.float32)
            noise = cv2.Laplacian(gray, cv2.CV_32F)
            h, w = noise.shape
            block_size = 16
            mads: list[float] = []
            for y in range(0, h - block_size, block_size):
                for x in range(0, w - block_size, block_size):
                    block = noise[y:y+block_size, x:x+block_size]
                    med = float(np.median(block))
                    mad = float(np.median(np.abs(block - med)))
                    mads.append(mad)
            if not mads:
                return CVMethodResult(method="noise_inconsistency", score=0.0, details="Image too small for block analysis.")
            arr = np.array(mads)
            cv_score = float(np.std(arr) / (np.mean(arr) + 1e-6)) * 100
            score = min(100.0, cv_score)
            return CVMethodResult(
                method="noise_inconsistency", score=round(score, 2),
                details=f"Noise MAD coefficient of variation: {cv_score:.1f}%. {sum(1 for m in mads if m > 2*np.median(arr))} anomalous block(s).",
            )
        except Exception as exc:
            return CVMethodResult(method="noise_inconsistency", score=0.0, details=f"Noise analysis failed: {exc}")

    def _font_consistency(self, image: np.ndarray) -> CVMethodResult:
        """Font Consistency — stroke width variance across text blocks."""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            dist = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
            h, w = dist.shape
            block_size = 32
            variances: list[float] = []
            for y in range(0, h - block_size, block_size):
                for x in range(0, w - block_size, block_size):
                    block = dist[y:y+block_size, x:x+block_size]
                    nonzero = block[block > 0]
                    if len(nonzero) > 10:
                        variances.append(float(np.var(nonzero)))
            if not variances:
                return CVMethodResult(method="font_consistency", score=0.0, details="No text regions detected for font analysis.")
            arr = np.array(variances)
            score = min(100.0, float(np.std(arr) / (np.mean(arr) + 1e-6)) * 50)
            return CVMethodResult(
                method="font_consistency", score=round(score, 2),
                details=f"Stroke width variance coefficient: {score:.1f}. Analyzed {len(variances)} text block(s).",
            )
        except Exception as exc:
            return CVMethodResult(method="font_consistency", score=0.0, details=f"Font analysis failed: {exc}")

    def _metadata_forensics(self, image_bytes: bytes) -> CVMethodResult:
        """Metadata Forensics — EXIF parsing + binary header scan."""
        EDITING_SIGNATURES = [b"Photoshop", b"GIMP", b"Canva", b"Snapseed", b"Lightroom", b"Affinity"]
        try:
            score = 0.0
            findings: list[str] = []

            # Binary header scan
            for sig in EDITING_SIGNATURES:
                if sig in image_bytes[:8192]:
                    score += 25.0
                    findings.append(f"{sig.decode()} signature detected")

            # EXIF
            try:
                pil_img = Image.open(io.BytesIO(image_bytes))
                exif: Any = pil_img._getexif()  # type: ignore[attr-defined]
                if exif:
                    software = exif.get(305, "")
                    if software and any(s.decode() in software for s in EDITING_SIGNATURES):
                        score += 25.0
                        findings.append(f"EXIF Software: {software}")
            except Exception:
                pass

            score = min(100.0, score)
            detail = "; ".join(findings) if findings else "No editing tool signatures detected. Metadata appears clean."
            return CVMethodResult(method="metadata_forensics", score=round(score, 2), details=detail)
        except Exception as exc:
            return CVMethodResult(method="metadata_forensics", score=0.0, details=f"Metadata analysis failed: {exc}")

    def _edge_coherence(self, image: np.ndarray) -> CVMethodResult:
        """Edge Coherence — Sobel gradient, local direction histogram entropy."""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY).astype(np.float32)
            gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
            gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
            angle = np.arctan2(gy, gx)
            h, w = angle.shape
            block_size = 8
            entropies: list[float] = []
            for y in range(0, h - block_size, block_size):
                for x in range(0, w - block_size, block_size):
                    block = angle[y:y+block_size, x:x+block_size].flatten()
                    hist, _ = np.histogram(block, bins=8, range=(-np.pi, np.pi))
                    hist = hist.astype(float) + 1e-9
                    hist /= hist.sum()
                    entropy = float(-np.sum(hist * np.log2(hist)))
                    entropies.append(entropy)
            if not entropies:
                return CVMethodResult(method="edge_coherence", score=0.0, details="Image too small for edge analysis.")
            arr = np.array(entropies)
            score = min(100.0, float(np.std(arr) / (np.mean(arr) + 1e-6)) * 100)
            return CVMethodResult(
                method="edge_coherence", score=round(score, 2),
                details=f"Edge direction entropy variance: {score:.1f}. {sum(1 for e in entropies if e > np.mean(arr) + 2*np.std(arr))} anomalous block(s).",
            )
        except Exception as exc:
            return CVMethodResult(method="edge_coherence", score=0.0, details=f"Edge coherence failed: {exc}")
