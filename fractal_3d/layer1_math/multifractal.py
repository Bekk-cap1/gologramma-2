"""Layer 1.5 - Multifractal singularity spectrum f(alpha) via box-counting moments."""
from __future__ import annotations

import numpy as np

from ..common import to_gray


def _measure_boxes(measure: np.ndarray, size: int) -> np.ndarray:
    h, w = measure.shape
    nh = -(-h // size)
    nw = -(-w // size)
    padded = np.zeros((nh * size, nw * size), dtype=measure.dtype)
    padded[:h, :w] = measure
    box = padded.reshape(nh, size, nw, size).sum(axis=(1, 3))
    p = box.ravel()
    p = p[p > 0]
    total = p.sum()
    return p / total if total > 0 else p


def compute_multifractal(image, generate_images: bool = False) -> dict:
    gray = to_gray(image)
    measure = gray.copy()
    if measure.sum() <= 0:
        measure = 1.0 - gray  # invert if ink is dark
    if measure.sum() <= 0:
        result = _empty()
        if generate_images:
            result["images"] = []
        return result

    sizes = [s for s in (2, 4, 8, 16, 32, 64) if s < min(gray.shape)]
    log_r = np.log(np.array(sizes, dtype=float))

    qs = np.arange(-5.0, 5.01, 0.5)
    # tau(q) = slope of log(partition function Z(q,r)) vs log(r)
    tau = []
    for q in qs:
        logZ = []
        for s in sizes:
            p = _measure_boxes(measure, s)
            if len(p) == 0:
                logZ.append(0.0)
            else:
                Z = np.sum(p ** q)
                logZ.append(np.log(Z + 1e-12))
        A = np.vstack([log_r, np.ones_like(log_r)]).T
        slope = np.linalg.lstsq(A, np.array(logZ), rcond=None)[0][0]
        tau.append(slope)
    tau = np.array(tau)

    # alpha = d tau / d q  (note tau slope vs log r where small r -> negative; use gradient)
    alpha = np.gradient(tau, qs)
    f_alpha = qs * alpha - tau

    alpha_min, alpha_max = float(np.min(alpha)), float(np.max(alpha))
    width = alpha_max - alpha_min
    idx_max = int(np.argmax(f_alpha))
    alpha_at_max = float(alpha[idx_max])
    f_max = float(f_alpha[idx_max])

    # skewness of spectrum
    left = alpha_at_max - alpha_min
    right = alpha_max - alpha_at_max
    if abs(left - right) < 0.1 * max(width, 1e-6):
        shape = "symmetric"
    elif left > right:
        shape = "left_skewed"
    else:
        shape = "right_skewed"

    if width < 0.5:
        hint = "IFS"             # narrow -> monofractal (Sierpinski/Koch)
    elif width < 1.5:
        hint = "escape_time"
    else:
        hint = "escape_time"     # wide asymmetric -> Mandelbrot class

    spectrum = [[round(float(a), 4), round(float(fv), 4)] for a, fv in zip(alpha, f_alpha)]
    confidence = float(np.clip(width / 2.0, 0.0, 1.0)) if np.isfinite(width) else 0.0

    result = {
        "alpha_range": [round(alpha_min, 4), round(alpha_max, 4)],
        "alpha_width": round(width, 4),
        "f_alpha_max": round(f_max, 4),
        "alpha_at_max": round(alpha_at_max, 4),
        "spectrum_shape": shape,
        "singularity_spectrum": spectrum,
        "confidence": confidence,
        "fractal_hint": hint,
    }

    if generate_images:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from scipy.ndimage import uniform_filter
            from ..utils.image_utils import (
                array_to_base64, plot_to_base64, dark_axes,
                colorize, DARK_BG, TEXT,
            )

            images = []

            # --- Image A: falpha_spectrum ---
            fig, ax = plt.subplots(figsize=(5, 4), facecolor=DARK_BG)
            ax.plot(alpha, f_alpha, color="#10b981", linewidth=1.5)
            ax.fill_between(alpha, f_alpha, alpha=0.15, color="#10b981")
            dark_axes(ax, title="Спектр f(α)")
            ax.set_xlabel("α", color=TEXT, fontsize=9)
            ax.set_ylabel("f(α)", color=TEXT, fontsize=9)
            fig.tight_layout()
            images.append({
                "id": "falpha_spectrum",
                "title": "Спектр f(α)",
                "description": "Мультифрактальный спектр сингулярности f(α)",
                "data": plot_to_base64(fig),
            })

            # --- Image B: local_alpha ---
            img_norm = to_gray(image)
            mn, mx = img_norm.min(), img_norm.max()
            img_norm = (img_norm - mn) / (mx - mn + 1e-10)
            local_alpha_acc = np.zeros_like(img_norm, dtype=np.float64)
            count = 0
            for r in (4, 8, 16):
                smoothed = uniform_filter(img_norm, size=r)
                clipped = np.clip(smoothed, 1e-10, None)
                with np.errstate(divide="ignore", invalid="ignore"):
                    la = np.log(clipped) / np.log(1.0 / r)
                local_alpha_acc += la
                count += 1
            local_alpha_map = local_alpha_acc / count
            la_mn, la_mx = local_alpha_map.min(), local_alpha_map.max()
            la_norm = (local_alpha_map - la_mn) / (la_mx - la_mn + 1e-10)
            rgb = colorize(la_norm, cmap="plasma")
            images.append({
                "id": "local_alpha",
                "title": "Локальная размерность α(x,y)",
                "description": "Карта локальных показателей Гёльдера, усреднённая по масштабам r=4,8,16",
                "data": array_to_base64(rgb),
            })

            result["images"] = images
        except Exception:
            result["images"] = []

    return result


def _empty() -> dict:
    return {
        "alpha_range": [0.0, 0.0],
        "alpha_width": 0.0,
        "f_alpha_max": 0.0,
        "alpha_at_max": 0.0,
        "spectrum_shape": "symmetric",
        "singularity_spectrum": [],
        "confidence": 0.0,
        "fractal_hint": "random",
    }
