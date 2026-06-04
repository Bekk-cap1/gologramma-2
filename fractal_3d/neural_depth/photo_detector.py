"""Fast "is this a photo / natural image vs a math-fractal render?" detector,
plus the auto depth-routing decision used by the pipeline.

Natural photos (Romanesco, faces, real objects) and photorealistic 3D renders
have no meaningful escape-time/IFS parameters, so the mathematical depth is
garbage for them — they must be routed to neural depth. Pure math renders
(reference Sierpinski/Julia) stay on the mathematical path.

numpy + scipy.fft only (< ~50ms on 256x256).
"""
from __future__ import annotations

import numpy as np


def is_likely_photo(image: np.ndarray) -> dict:
    """Heuristic photo-vs-render classifier.

    Returns ``{"is_photo", "confidence", "evidence", "scores"}``.
    """
    image = np.asarray(image)
    if image.ndim == 3:
        gray = np.mean(image.astype(np.float32), axis=2)
    else:
        gray = image.astype(np.float32)
    if gray.max() > 1.0:
        gray = gray / 255.0

    evidence: list[str] = []
    photo_score = 0.0
    render_score = 0.0

    # 1. High-frequency sensor/JPEG noise.
    diff_h = np.abs(np.diff(gray, axis=1))
    diff_v = np.abs(np.diff(gray, axis=0))
    noise = (float(np.median(diff_h)) + float(np.median(diff_v))) / 2.0
    if noise > 0.02:
        photo_score += 2
        evidence.append(f"sensor_noise: {noise:.3f}")
    elif noise < 0.005:
        render_score += 1
        evidence.append(f"no_noise: {noise:.3f}")

    # 2. Colour diversity (RGB only).
    if image.ndim == 3 and image.shape[2] >= 3:
        h, w = image.shape[:2]
        step = max(1, min(h, w) // 64)
        sampled = image[::step, ::step, :3].reshape(-1, 3).astype(np.uint16)
        quant = (sampled // 8).astype(np.uint16)
        keys = (quant[:, 0].astype(np.int64) << 16) | (quant[:, 1] << 8) | quant[:, 2]
        unique_colors = int(np.unique(keys).size)
        if unique_colors > 500:
            photo_score += 2
            evidence.append(f"color_diversity: {unique_colors}")
        elif unique_colors < 50:
            render_score += 2
            evidence.append(f"limited_palette: {unique_colors}")

    # 3. Histogram shape: photos smooth & full; renders sparse/peaky.
    hist, _ = np.histogram(gray.ravel(), bins=64, range=(0, 1))
    hist_zeros = int(np.sum(hist == 0))
    hist_smoothness = float(np.std(np.diff(hist.astype(float))))
    if hist_zeros > 20:
        render_score += 1
        evidence.append(f"sparse_histogram: {hist_zeros} empty bins")
    if hist_smoothness < float(np.mean(hist)) * 0.5:
        photo_score += 1
        evidence.append("smooth_histogram")

    # 4. JPEG 8x8 block artifacts (spectral peaks at multiples of 1/8).
    try:
        from scipy.fft import fft2
        F = np.abs(fft2(gray))
        h, w = gray.shape
        if h > 64 and w > 64:
            avg = float(F.mean())
            if float(F[h // 8, :].mean()) > avg * 3 or float(F[:, w // 8].mean()) > avg * 3:
                photo_score += 1
                evidence.append("jpeg_artifacts_detected")
    except Exception:
        pass

    # 5. Large images are usually photos.
    if min(image.shape[:2]) > 400:
        photo_score += 0.5
        evidence.append(f"large_image: {tuple(image.shape[:2])}")

    total = photo_score + render_score
    if total == 0:
        return {"is_photo": False, "confidence": 0.0, "evidence": evidence,
                "scores": {"photo": 0.0, "render": 0.0}}

    is_photo = photo_score > render_score
    confidence = float(np.clip(abs(photo_score - render_score) / (total + 1), 0.0, 0.95))
    return {
        "is_photo": bool(is_photo),
        "confidence": confidence,
        "evidence": evidence,
        "scores": {"photo": float(photo_score), "render": float(render_score)},
    }


def resolve_neural_mode(use_neural: str, decision: dict, image) -> tuple[str, dict, str | None]:
    """Decide the effective ``build_depth_map`` ``use_neural`` mode in auto mode.

    Forces neural depth when the input is clearly not a clean math fractal:
      - detected as a photo/natural image (conf > 0.3),
      - low classification confidence (< 0.60),
      - low ensemble agreement (< 0.50).
    The escape-time low-SSIM check stays inside ``build_depth_map`` ("auto").

    Returns ``(effective_use_neural, photo_check, reason_or_None)``.
    """
    photo = is_likely_photo(image)
    use_neural = (use_neural or "auto").lower()
    if use_neural in ("always", "never"):
        return use_neural, photo, None

    reason = None
    if photo["is_photo"] and photo["confidence"] > 0.3:
        reason = f"photo detected ({', '.join(photo['evidence'][:3])})"
    elif float(decision.get("final_confidence", 1.0)) < 0.60:
        reason = f"low classification confidence ({decision.get('final_confidence')})"
    elif float(decision.get("agreement_score", 1.0)) < 0.50:
        reason = f"low ensemble agreement ({decision.get('agreement_score')})"

    return ("always" if reason else "auto"), photo, reason
