"""Layer 1.4 - Lacunarity via the gliding-box algorithm."""
from __future__ import annotations

import numpy as np

from ..common import binarize


def _lacunarity_at(mask: np.ndarray, r: int) -> float:
    """L(r) = <S^2>/<S>^2 over all r x r gliding boxes (via integral image)."""
    ii = np.zeros((mask.shape[0] + 1, mask.shape[1] + 1), dtype=np.float64)
    ii[1:, 1:] = np.cumsum(np.cumsum(mask.astype(np.float64), axis=0), axis=1)
    H, W = mask.shape
    if r > H or r > W:
        return float("nan")
    # box sums for all top-left positions
    S = (ii[r:, r:] - ii[:-r, r:] - ii[r:, :-r] + ii[:-r, :-r])
    s = S.ravel()
    m1 = s.mean()
    m2 = (s ** 2).mean()
    if m1 <= 1e-9:
        return float("nan")
    return float(m2 / (m1 ** 2))


def compute_lacunarity(image, generate_images: bool = False) -> dict:
    mask = binarize(image)
    radii = [r for r in (4, 8, 16, 32, 64) if r < min(mask.shape)]
    curve = []
    rs = []
    for r in radii:
        L = _lacunarity_at(mask, r)
        if np.isfinite(L):
            curve.append(L)
            rs.append(r)

    if len(curve) < 2:
        result = {
            "lacunarity_curve": curve,
            "mean_lacunarity": 0.0,
            "lacunarity_slope": 0.0,
            "confidence": 0.0,
            "fractal_hint": "random",
        }
        if generate_images:
            result["images"] = []
        return result

    x = np.log(np.array(rs, dtype=float))
    y = np.log(np.array(curve, dtype=float))
    A = np.vstack([x, np.ones_like(x)]).T
    (slope, intercept), *_ = np.linalg.lstsq(A, y, rcond=None)
    y_pred = slope * x + intercept
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - y.mean()) ** 2)
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0

    mean_lac = float(np.mean(curve))
    # decreasing curve => true fractal; flat => noise
    if slope < -0.05:
        hint = "IFS" if mean_lac > 1.5 else "escape_time"
    else:
        hint = "random"

    result = {
        "lacunarity_curve": [round(c, 4) for c in curve],
        "mean_lacunarity": round(mean_lac, 4),
        "lacunarity_slope": round(float(slope), 4),
        "confidence": float(np.clip(abs(slope), 0.0, 1.0) * np.clip(r2, 0, 1)),
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

            # --- Image A: lacunarity_heatmap ---
            b = mask.astype(float)
            s_mean = uniform_filter(b, size=16)
            s_sq = uniform_filter(b ** 2, size=16)
            lac_map = s_sq / (s_mean ** 2 + 1e-10)
            mn, mx = lac_map.min(), lac_map.max()
            lac_norm = (lac_map - mn) / (mx - mn + 1e-10)
            rgb = colorize(lac_norm, cmap="hot")
            images.append({
                "id": "lacunarity_heatmap",
                "title": "Карта лакунарности",
                "description": "Локальная лакунарность (скользящий бокс 16×16, colormap hot)",
                "data": array_to_base64(rgb),
            })

            # --- Image B: lacunarity_curve ---
            fig, ax = plt.subplots(figsize=(5, 4), facecolor=DARK_BG)
            ax.plot(rs, curve, "o-", color="#f97316", linewidth=1.5,
                    markersize=6, markerfacecolor="#f97316")
            dark_axes(ax, title="Кривая Λ(r)")
            ax.set_xlabel("r (радиус бокса)", color=TEXT, fontsize=9)
            ax.set_ylabel("Λ(r)", color=TEXT, fontsize=9)
            fig.tight_layout()
            images.append({
                "id": "lacunarity_curve",
                "title": "Кривая Λ(r)",
                "description": "Лакунарность как функция размера бокса r",
                "data": plot_to_base64(fig),
            })

            result["images"] = images
        except Exception:
            result["images"] = []

    return result
