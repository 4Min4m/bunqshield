"""BunqShield — DualStreamViT fraud detector (ViT-B/16 + ELA stream)."""
from __future__ import annotations

import base64
import io
import logging

import numpy as np

from schemas import ViTResult

logger = logging.getLogger(__name__)

_vit_pipeline: "DualStreamViTFraudDetector | None" = None


def get_vit_pipeline() -> "DualStreamViTFraudDetector":
    global _vit_pipeline
    if _vit_pipeline is None:
        _vit_pipeline = DualStreamViTFraudDetector()
        _vit_pipeline.load_weights()
    return _vit_pipeline


class DualStreamViTFraudDetector:
    """
    Dual-stream ViT: RGB stream + ELA stream with cross-attention fusion.
    Falls back to lightweight heuristic if PyTorch/timm unavailable.
    """

    def __init__(self) -> None:
        self._loaded = False
        self._rgb_vit = None
        self._ela_vit = None
        self._cross_attn = None
        self._patch_scorer = None
        self._fusion_head = None

    def load_weights(self) -> None:
        try:
            import timm
            import torch
            import torch.nn as nn

            self._rgb_vit = timm.create_model("vit_base_patch16_224", pretrained=True, num_classes=0)
            self._ela_vit = timm.create_model("vit_base_patch16_224", pretrained=True, num_classes=0)
            self._cross_attn = nn.MultiheadAttention(embed_dim=768, num_heads=12, batch_first=True)
            self._patch_scorer = nn.Linear(768, 1)
            self._fusion_head = nn.Linear(1536, 2)

            for m in [self._rgb_vit, self._ela_vit, self._cross_attn, self._patch_scorer, self._fusion_head]:
                m.eval()  # type: ignore[union-attr]

            self._loaded = True
            logger.info("DualStreamViT weights loaded successfully")
        except Exception as exc:
            logger.warning("ViT load failed (%s) — using heuristic fallback", exc)
            self._loaded = False

    def analyze(self, image: np.ndarray) -> ViTResult:
        if self._loaded:
            return self._torch_analyze(image)
        return self._heuristic_analyze(image)

    def _torch_analyze(self, image: np.ndarray) -> ViTResult:
        import torch
        import torch.nn.functional as F
        from PIL import Image
        import torchvision.transforms as T

        transform = T.Compose([
            T.Resize((224, 224)),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

        crops = self._get_crops(image)
        max_score = 0.0
        best_patches: list[float] = [0.05] * 196

        with torch.no_grad():
            for _, crop in crops:
                pil = Image.fromarray(crop).convert("RGB")
                rgb_t = transform(pil).unsqueeze(0)

                ela_np = self._compute_ela(crop)
                ela_pil = Image.fromarray(ela_np).convert("RGB")
                ela_t = transform(ela_pil).unsqueeze(0)

                rgb_feats = self._rgb_vit.forward_features(rgb_t)  # type: ignore[union-attr]
                ela_feats = self._ela_vit.forward_features(ela_t)   # type: ignore[union-attr]

                # Patch tokens only (skip CLS at index 0)
                rgb_patches = rgb_feats[:, 1:, :]  # (1, 196, 768)
                ela_patches = ela_feats[:, 1:, :]

                fused, _ = self._cross_attn(rgb_patches, ela_patches, ela_patches)  # type: ignore[misc]
                patch_logits = self._patch_scorer(fused).squeeze(-1).squeeze(0)  # type: ignore[misc]
                patch_scores = torch.sigmoid(patch_logits).tolist()

                rgb_cls = rgb_feats[:, 0, :]
                ela_cls = ela_feats[:, 0, :]
                combined = torch.cat([rgb_cls, ela_cls], dim=-1)
                logits = self._fusion_head(combined)  # type: ignore[misc]
                score = float(torch.softmax(logits, dim=-1)[0, 1].item()) * 100

                if score > max_score:
                    max_score = score
                    best_patches = patch_scores

        return self._build_result(max_score, best_patches, image)

    def _heuristic_analyze(self, image: np.ndarray) -> ViTResult:
        """Lightweight heuristic when PyTorch unavailable."""
        ela = self._compute_ela(image)
        ela_mean = float(np.mean(ela))
        score = min(100.0, ela_mean * 2.5)
        patches: list[float] = []
        for i in range(196):
            row = i // 14
            col = i % 14
            r0 = int(row / 14 * ela.shape[0])
            r1 = int((row + 1) / 14 * ela.shape[0])
            c0 = int(col / 14 * ela.shape[1])
            c1 = int((col + 1) / 14 * ela.shape[1])
            block_mean = float(np.mean(ela[r0:r1, c0:c1]))
            patches.append(min(1.0, block_mean / 50.0))
        return self._build_result(score, patches, image)

    def _get_crops(self, image: np.ndarray) -> "list[tuple[str, np.ndarray]]":
        h, w = image.shape[:2]
        return [
            ("full", image),
            ("header", image[0:int(h * 0.2), :]),
            ("amount", image[int(h * 0.7):, int(w * 0.5):]),
            ("center", image[int(h * 0.3):int(h * 0.7), int(w * 0.2):int(w * 0.8)]),
            ("right_column", image[:, int(w * 0.6):]),
        ]

    def _compute_ela(self, image: np.ndarray) -> np.ndarray:
        from PIL import Image
        pil = Image.fromarray(image).convert("RGB")
        buf = io.BytesIO()
        pil.save(buf, format="JPEG", quality=90)
        buf.seek(0)
        recomp = np.array(Image.open(buf).convert("RGB"))
        diff = np.abs(image.astype(np.float32) - recomp.astype(np.float32))
        return np.clip(diff * 15, 0, 255).astype(np.uint8)

    def _build_result(self, score: float, patch_scores: list[float], image: np.ndarray) -> ViTResult:
        attention_map = [patch_scores[i * 14:(i + 1) * 14] for i in range(14)]
        heatmap_b64 = self._render_heatmap(patch_scores, image.shape[:2])
        return ViTResult(
            vit_score=round(score, 2),
            patch_scores=patch_scores,
            attention_map=attention_map,
            heatmap_base64=heatmap_b64,
        )

    def _render_heatmap(self, patch_scores: list[float], shape: tuple[int, int]) -> str:
        try:
            import cv2
            from PIL import Image

            h, w = shape
            grid = np.array(patch_scores, dtype=np.float32).reshape(14, 14)
            grid = (grid - grid.min()) / (grid.max() - grid.min() + 1e-8)
            upsampled = cv2.resize(grid, (w, h), interpolation=cv2.INTER_LINEAR)
            heatmap = cv2.applyColorMap((upsampled * 255).astype(np.uint8), cv2.COLORMAP_JET)
            heatmap_rgb = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
            buf = io.BytesIO()
            Image.fromarray(heatmap_rgb).save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode()
        except Exception:
            return ""
