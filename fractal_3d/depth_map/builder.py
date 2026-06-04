"""Depth map dispatcher: chooses IFS-recursion, escape-time, or neural depth.

``use_neural`` controls the routing:
  - "never"  : only the mathematical path (legacy behaviour).
  - "always" : neural DCNF-CRF depth for any image.
  - "auto"   : neural when the input is clearly not a (well-matched) fractal —
               i.e. no fractal_type given, or an escape-time image whose best
               Julia-c SSIM is < 0.3 (the math depth would be garbage there).
"""
from __future__ import annotations

import numpy as np

from .escape_depth import (
    build_escape_depth,
    escape_depth_map,
    estimate_escape_params,
)
from .ifs_depth import ifs_depth_map

# Below this Julia-c match the escape-time depth is meaningless (e.g. a photo
# mis-classified as escape-time) → prefer neural depth in "auto" mode.
_ESCAPE_SSIM_NEURAL_THRESHOLD = 0.3


def _package(depth, method: str, fractal_type: str, escape_params=None,
             confidence=None, extra: dict | None = None) -> dict:
    """Assemble the standard depth-map dict (+ optional neural extras)."""
    depth = np.asarray(depth, dtype=np.float32)
    occupied = float((depth > 0.01).mean())
    conf = float(min(1.0, occupied * 4.0)) if confidence is None else float(confidence)
    out = {
        "depth_map": depth,          # np.ndarray (size, size) float32 [0,1]
        "method": method,
        "fractal_type": fractal_type,
        "occupancy": round(occupied, 4),
        "confidence": round(conf, 4),
        "escape_params": escape_params,
    }
    if extra:
        out.update(extra)
    return out


def _neural_depth(image, fractal_type: str, size: int, crf_strength: str = "auto") -> dict:
    """Neural depth via the DCNF-CRF estimator (DA V2 / pseudo-cue unary + CRF)."""
    from ..neural_depth import estimate_depth

    rgb = np.asarray(image)
    if rgb.ndim == 2:
        rgb = np.stack([rgb] * 3, axis=2)
    if rgb.dtype != np.uint8:
        rgb = (rgb * 255).astype(np.uint8) if rgb.max() <= 1.0 else rgb.astype(np.uint8)

    res = estimate_depth(rgb, method="auto", target_size=size, crf_strength=crf_strength)
    extra = {
        "raw_depth": res.get("raw_depth"),
        "crf_depth": res.get("crf_depth"),
        "unary_depth": res.get("unary_depth"),
        "superpixels": res.get("superpixels"),
        "n_superpixels": res.get("n_superpixels"),
        "neural_params": res.get("params", {}),
        "crf_strength": res.get("params", {}).get("crf_strength"),
    }
    return _package(res["depth_map"], f"neural_{res['method_used']}", fractal_type,
                    escape_params=None, confidence=res.get("confidence"), extra=extra)


def _math_depth(fractal_type, is_escape_time, ifs_transforms, image, size,
                c_real, c_imag):
    """Legacy mathematical depth. Returns (depth, method, escape_params)."""
    escape_params = None
    if is_escape_time:
        method = "escape_time"
        if image is not None:
            try:
                escape_params = estimate_escape_params(
                    image, fractal_subtype=fractal_type or "julia")
                depth = build_escape_depth(escape_params, size=size)
            except Exception:
                escape_params = None
                depth = escape_depth_map(image=image, c_real=c_real,
                                         c_imag=c_imag, size=size)
        else:
            depth = escape_depth_map(image=image, c_real=c_real,
                                     c_imag=c_imag, size=size)
    else:
        depth = ifs_depth_map(ifs_transforms, image=image, size=size)
        method = "ifs_recursion"
    return depth, method, escape_params


def build_depth_map(fractal_type: str = "", is_escape_time: bool = False,
                    ifs_transforms=None, image=None, size: int = 256,
                    c_real: float = -0.7, c_imag: float = 0.27015,
                    use_neural: str = "auto", crf_strength: str = "auto") -> dict:
    ifs_transforms = ifs_transforms or []
    use_neural = (use_neural or "auto").lower()

    # ── neural-only ──────────────────────────────────────────────────────────
    if use_neural == "always" and image is not None:
        try:
            return _neural_depth(image, fractal_type, size, crf_strength)
        except Exception:
            pass  # fall back to math below

    # ── auto: route non-fractals straight to neural (cheap decision) ──────────
    if use_neural == "auto" and image is not None:
        no_type = not (fractal_type and str(fractal_type).strip())
        if no_type and not is_escape_time and not ifs_transforms:
            try:
                return _neural_depth(image, fractal_type, size, crf_strength)
            except Exception:
                pass

    # ── mathematical path ─────────────────────────────────────────────────────
    depth, method, escape_params = _math_depth(
        fractal_type, is_escape_time, ifs_transforms, image, size, c_real, c_imag)

    # auto + escape-time with a poor Julia-c match → the math depth is garbage;
    # swap in neural depth instead.
    if (use_neural in ("auto", "always") and is_escape_time and image is not None):
        ssim = float((escape_params or {}).get("similarity_to_known", 1.0))
        if ssim < _ESCAPE_SSIM_NEURAL_THRESHOLD:
            try:
                return _neural_depth(image, fractal_type, size, crf_strength)
            except Exception:
                pass

    return _package(depth, method, fractal_type, escape_params=escape_params)
