"""Layer 2 - CNN feature extractor / classifier.

Reuses the already-trained model at <repo>/model/best_model.pt produced by
scripts/train_cnn.py (FractalCNN, 17 classes). Returns a class prediction,
confidence, full probability vector and a 256-D embedding (backbone features).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

from ..common import get_logger

log = get_logger()

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
DEFAULT_WEIGHTS = REPO_ROOT / "model" / "best_model.pt"

_model = None
_torch = None
_transform = None
CLASSES: list[str] = []


def _import_torch():
    global _torch
    if _torch is None:
        import torch
        _torch = torch
    return _torch


def load_model(weights: Optional[str] = None):
    """Load the trained FractalCNN. Returns None if weights/torch unavailable."""
    global _model, _transform, CLASSES
    if _model is not None:
        return _model
    try:
        torch = _import_torch()
        import torchvision.transforms as T
        if str(SCRIPTS_DIR) not in sys.path:
            sys.path.insert(0, str(SCRIPTS_DIR))
        from train_cnn import FractalCNN, FRACTAL_CLASSES  # type: ignore

        CLASSES = list(FRACTAL_CLASSES)
        wpath = Path(weights) if weights else DEFAULT_WEIGHTS
        state = torch.load(wpath, map_location="cpu", weights_only=False)
        if isinstance(state, dict):
            if "state_dict" in state:
                if state.get("classes"):
                    CLASSES = list(state["classes"])
                state = state["state_dict"]
            elif "model" in state:
                state = state["model"]
        model = FractalCNN(num_classes=len(CLASSES)) if CLASSES else FractalCNN()
        model.load_state_dict(state)
        model.eval()
        _model = model
        _transform = T.Compose([
            T.Resize((128, 128)),
            T.ToTensor(),
            T.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
        ])
        log.info("[CNN] loaded weights from %s (%d classes)", wpath, len(CLASSES))
    except Exception as e:  # noqa: BLE001
        log.warning("[CNN] could not load model: %s", e)
        _model = None
    return _model


def classify(image, weights: Optional[str] = None) -> dict:
    """Classify a fractal image.

    Returns {class, confidence, all_probs, embedding, available}.
    """
    model = load_model(weights)
    if model is None:
        return {
            "class": "unknown",
            "confidence": 0.0,
            "all_probs": {},
            "embedding": [],
            "available": False,
        }
    torch = _import_torch()
    if isinstance(image, (str, os.PathLike)):
        img = Image.open(image).convert("RGB")
    elif isinstance(image, Image.Image):
        img = image.convert("RGB")
    else:
        arr = np.asarray(image)
        if arr.ndim == 2:
            arr = np.stack([arr] * 3, axis=-1)
        if arr.max() <= 1.0:
            arr = (arr * 255).astype(np.uint8)
        img = Image.fromarray(arr.astype(np.uint8)).convert("RGB")

    tensor = _transform(img).unsqueeze(0)
    with torch.no_grad():
        feat = model.backbone(tensor).flatten(1)
        logits = model.cls_head(feat)
        probs = torch.softmax(logits, dim=1)[0]
    top = int(probs.argmax())
    return {
        "class": CLASSES[top],
        "confidence": float(probs[top]),
        "all_probs": {c: float(p) for c, p in zip(CLASSES, probs)},
        "embedding": feat[0].tolist(),
        "available": True,
    }
