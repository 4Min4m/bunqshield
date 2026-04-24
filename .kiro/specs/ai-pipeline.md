# BunqShield — AI Pipeline Spec

## Overview
Three-stage pipeline: Classical CV → DualStreamViT → BunqShieldAgent (ReAct)

## Stage 1: Classical CV Engine (fraud_engine.py)

### ClassicalFraudEngine
```python
class ClassicalFraudEngine:
    def analyze(self, image: np.ndarray) -> list[CVMethodResult]: ...
    def _ela(self, image: np.ndarray) -> CVMethodResult: ...
    def _copy_move(self, image: np.ndarray) -> CVMethodResult: ...
    def _noise_inconsistency(self, image: np.ndarray) -> CVMethodResult: ...
    def _font_consistency(self, image: np.ndarray) -> CVMethodResult: ...
    def _metadata_forensics(self, image_bytes: bytes) -> CVMethodResult: ...
    def _edge_coherence(self, image: np.ndarray) -> CVMethodResult: ...
```

### Method Implementations

**1. ELA (Error Level Analysis)**
- Save image as JPEG quality=90, reload, compute absolute difference
- Amplify difference ×15
- Score = mean of top 5% pixel values in amplified map
- Suspicious regions: connected components > 500px² above threshold

**2. Copy-Move Detection**
- Extract ORB features (max 1000 keypoints)
- Brute-force self-matching (BFMatcher, cross-check=True)
- Filter matches with distance < 30
- Cluster nearby match pairs (distance < 50px between source regions)
- Score = min(100, cluster_count × 15)

**3. Noise Inconsistency**
- Apply Laplacian high-pass filter to extract noise layer
- Divide image into 16×16 blocks
- Compute MAD (median absolute deviation) per block
- Score = coefficient of variation of block MADs × 100
- Flag blocks with MAD > 2× median as suspicious

**4. Font Consistency**
- Stroke width transform on binarized text regions
- Compute distance transform
- Divide into blocks, compute variance of stroke widths per block
- Score = normalized variance across blocks × 100

**5. Metadata Forensics**
- Parse EXIF data (Pillow)
- Scan binary header for editing tool signatures: Photoshop, GIMP, Canva, etc.
- Check for metadata inconsistencies (creation vs modification dates)
- Score: 0 if clean metadata, +25 per suspicious indicator, max 100

**6. Edge Coherence**
- Sobel gradient magnitude map
- Divide into 8×8 blocks, compute local gradient direction histogram
- Entropy of direction distribution per block
- Score = normalized variance of block entropies × 100
- Flag blocks with entropy outliers as suspicious

### classical_score
```python
weights = {"ela": 0.25, "copy_move": 0.20, "noise": 0.20,
           "font": 0.15, "metadata": 0.10, "edge": 0.10}
classical_score = sum(result.score * weights[result.method] for result in results)
```

---

## Stage 2: DualStreamViT (vit_fraud_model.py)

### DualStreamViTFraudDetector
```python
class DualStreamViTFraudDetector:
    def __init__(self) -> None:
        self.rgb_vit: timm.models.VisionTransformer   # ViT-B/16, ImageNet-21k
        self.ela_vit: timm.models.VisionTransformer   # ViT-B/16, ImageNet-21k
        self.cross_attention: nn.MultiheadAttention   # d_model=768, heads=12
        self.patch_scorer: nn.Linear                  # 768 → 1
        self.fusion_head: nn.Linear                   # 1536 → 2

    def forward(self, rgb: Tensor, ela: Tensor) -> ViTResult: ...
    def get_patch_scores(self, rgb: Tensor, ela: Tensor) -> Tensor: ...  # (196,)
```

### Forward Pass
1. Extract RGB patch embeddings via rgb_vit (196 patches + CLS token)
2. Compute ELA map from input image, extract ELA patch embeddings via ela_vit
3. Cross-attention: RGB patches (query) attend to ELA patches (key/value)
4. patch_scorer: per-patch suspicion score from fused embeddings
5. fusion_head: concatenate both CLS tokens → binary logit → sigmoid → vit_score
6. attention_map: reshape patch_scores to 14×14 grid

### Multi-Scale Analysis
```python
crops = [
    ("full", full_image),
    ("header", image[0:int(h*0.2), :]),
    ("amount", image[int(h*0.7):, int(w*0.5):]),
    ("center", image[int(h*0.3):int(h*0.7), int(w*0.2):int(w*0.8)]),
    ("right_column", image[:, int(w*0.6):]),
]
vit_score = max(crop_score for _, crop_score in crop_results)
```

### Singleton Loader
```python
_vit_pipeline: DualStreamViTFraudDetector | None = None

def get_vit_pipeline() -> DualStreamViTFraudDetector:
    global _vit_pipeline
    if _vit_pipeline is None:
        _vit_pipeline = DualStreamViTFraudDetector()
        _vit_pipeline.load_weights()  # from S3 or HuggingFace
    return _vit_pipeline
```
Do NOT call at module import time. Only call when first inference request arrives.

### Heatmap Generation
- Normalize patch_scores (196,) to 0–1
- Reshape to 14×14
- Upsample to original image size (bilinear)
- Apply colormap (blue→red, matplotlib "hot" or custom)
- Return as base64-encoded PNG

---

## Stage 3: BunqShieldAgent (agent.py)

### AgentConfig
```python
@dataclass
class AgentConfig:
    auto_approve_threshold: float = 15.0
    flag_threshold: float = 30.0
    auto_block_threshold: float = 50.0
    max_auto_approve_amount: float = 500.0  # EUR
    model: str = "claude-sonnet-4-20250514"
    max_iterations: int = 10
```

### Tools
```python
TOOLS = [
    "analyze_invoice",      # run CV+ViT on image bytes
    "get_payment_details",  # fetch payment from bunq
    "block_payment",        # call bunq block API
    "approve_payment",      # call bunq approve API
    "get_recent_payments",  # list recent bunq payments
    "notify_user",          # publish to SNS
]
```

### ReAct Loop
```
for i in range(max_iterations):
    Thought: LLM reasons about current state
    Action: LLM selects tool + args
    Observation: tool result appended to context
    if action == "approve_payment" or "block_payment": break
```

### Decision Logic
```python
if fused_score < auto_approve_threshold and amount < max_auto_approve_amount:
    decision = "approve"
elif fused_score >= auto_block_threshold:
    decision = "block"
else:
    decision = "flag"
```

### Demo Fallback
```python
def run_demo_without_llm(self, report: FraudReport) -> AgentResult:
    """Deterministic fallback — no API key needed."""
    # Returns pre-written reasoning based on risk_level
    # Never calls Anthropic API
```

### ContinuousMonitorAgent
```python
class ContinuousMonitorAgent:
    processed_payments: set[str]  # deduplication

    async def run(self) -> None:
        while True:
            payments = await bunq_client.get_recent_payments()
            new = [p for p in payments if p.id not in self.processed_payments]
            for payment in new:
                await self.analyze_and_act(payment)
                self.processed_payments.add(payment.id)
            await asyncio.sleep(30)
```

---

## Demo Mode Data

### Scenario: clean (fused_score=8)
- CV scores: ela=5, copy_move=0, noise=8, font=6, metadata=0, edge=12
- vit_score=9, classical_score=6
- agent_reasoning: "Invoice metadata is consistent with authentic AWS billing. No pixel-level anomalies detected across all six forensic methods. ELA analysis shows uniform compression artifacts consistent with original document generation. Payment approved automatically."
- agent_decision: approve

### Scenario: tampered_amount (fused_score=78)
- CV scores: ela=85, copy_move=45, noise=72, font=68, metadata=90, edge=55
- vit_score=82, classical_score=71
- suspicious_patches: bottom-right quadrant (amount field region)
- agent_reasoning: "Critical fraud indicators detected. ELA analysis reveals severe JPEG re-compression artifacts localized to the invoice total field, strongly suggesting pixel-level editing. Metadata forensics detected Adobe Photoshop signature inconsistent with the claimed document origin. The ViT model assigns maximum suspicion scores to patches covering the amount region. Payment blocked immediately."
- agent_decision: block

### Scenario: logo_replacement (fused_score=62)
- CV scores: ela=55, copy_move=70, noise=48, font=35, metadata=75, edge=60
- vit_score=65, classical_score=57
- suspicious_patches: top header region (logo area)
- agent_reasoning: "High-confidence fraud indicators in the document header. Copy-move detection identified self-similar regions consistent with logo splicing. Metadata forensics detected GIMP editing signatures. The ViT cross-attention mechanism highlights the header region as the primary anomaly. Payment blocked pending manual review."
- agent_decision: block
