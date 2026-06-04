"""Layer 1.1 - Fractal (Hausdorff) dimension via box-counting."""
from __future__ import annotations

import numpy as np

from ..common import binarize


def _box_count(mask: np.ndarray, size: int) -> int:
    """Count boxes of side `size` containing at least one foreground pixel."""
    h, w = mask.shape
    nh = -(-h // size)  # ceil
    nw = -(-w // size)
    padded = np.zeros((nh * size, nw * size), dtype=bool)
    padded[:h, :w] = mask
    reshaped = padded.reshape(nh, size, nw, size)
    occupied = reshaped.any(axis=(1, 3))
    return int(occupied.sum())


def _dimension_to_hint(d: float) -> str:
    if d < 1.3:
        return "IFS"            # Cantor / sparse
    if d < 1.7:
        return "IFS"            # Koch (1.26) / Sierpinski triangle (1.58)
    if d < 1.9:
        return "IFS"            # Sierpinski carpet / Menger (1.89)
    return "escape_time"        # Mandelbrot boundary, complex fractals


def compute_box_counting(image, generate_images: bool = False) -> dict:
    """Box-counting fractal dimension.

    Returns dict with dimension, confidence (R^2), type hint and raw curves.
    When generate_images=True an 'images' key is added with debug visualizations.
    """
    mask = binarize(image)
    box_sizes = [2, 4, 8, 16, 32, 64, 128]
    box_sizes = [s for s in box_sizes if s < min(mask.shape)]
    counts = []
    sizes = []
    for s in box_sizes:
        c = _box_count(mask, s)
        if c > 0:
            counts.append(c)
            sizes.append(s)

    if len(sizes) < 3 or mask.sum() == 0:
        result = {
            "dimension": 0.0,
            "confidence": 0.0,
            "fractal_type_hint": "random",
            "box_sizes": sizes,
            "box_counts": counts,
        }
        if generate_images:
            result["images"] = []
        return result

    x = np.log(1.0 / np.array(sizes, dtype=float))
    y = np.log(np.array(counts, dtype=float))
    # linear regression slope = dimension
    A = np.vstack([x, np.ones_like(x)]).T
    (slope, intercept), residuals, *_ = np.linalg.lstsq(A, y, rcond=None)
    y_pred = slope * x + intercept
    ss_res = float(np.sum((y - y_pred) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0

    dimension = float(np.clip(slope, 0.0, 2.0))
    result = {
        "dimension": dimension,
        "confidence": float(np.clip(r2, 0.0, 1.0)),
        "fractal_type_hint": _dimension_to_hint(dimension),
        "box_sizes": sizes,
        "box_counts": counts,
    }

    if generate_images:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from ..utils.image_utils import plot_to_base64, dark_axes, DARK_BG, TEXT

            images = []

            # --- Image A: box_grid_overlay ---
            # pick up to 3 box sizes spread across small/medium/large
            viz_sizes = []
            if len(sizes) >= 1:
                viz_sizes.append(sizes[0])
            if len(sizes) >= 3:
                viz_sizes.append(sizes[len(sizes) // 2])
            if len(sizes) >= 2:
                viz_sizes.append(sizes[-1])
            # deduplicate while preserving order
            seen = set()
            viz_sizes_dedup = []
            for s in viz_sizes:
                if s not in seen:
                    seen.add(s)
                    viz_sizes_dedup.append(s)
            viz_sizes = viz_sizes_dedup

            n_sub = len(viz_sizes)
            fig, axes = plt.subplots(1, n_sub, figsize=(4 * n_sub, 4),
                                     facecolor=DARK_BG)
            if n_sub == 1:
                axes = [axes]

            h_m, w_m = mask.shape
            yellow = np.array([234, 179, 8]) / 255.0
            slate = np.array([30, 41, 59]) / 255.0
            for ax, bsize in zip(axes, viz_sizes):
                # vectorised box occupancy (no per-box matplotlib patches — that
                # is O(H·W/bsize²) artists and was the dominant cost).
                nh = -(-h_m // bsize)
                nw = -(-w_m // bsize)
                padded = np.zeros((nh * bsize, nw * bsize), dtype=bool)
                padded[:h_m, :w_m] = mask
                occ = padded.reshape(nh, bsize, nw, bsize).any(axis=(1, 3))
                occ_full = np.kron(occ, np.ones((bsize, bsize), dtype=bool))[:h_m, :w_m]
                # base colour per box (dim) + bright foreground where mask is set
                rgb = np.where(occ_full[..., None], yellow, slate) * 0.5
                rgb[mask] = np.clip(rgb[mask] + 0.5, 0.0, 1.0)
                ax.imshow(rgb, origin="upper")
                dark_axes(ax, title=f"box={bsize}px")
                # thin grid lines (cheap; skip when there would be too many)
                if max(nh, nw) <= 48:
                    for k in range(0, h_m + 1, bsize):
                        ax.axhline(k - 0.5, color="#334155", linewidth=0.3)
                    for k in range(0, w_m + 1, bsize):
                        ax.axvline(k - 0.5, color="#334155", linewidth=0.3)
                ax.set_xlim(-0.5, w_m - 0.5)
                ax.set_ylim(h_m - 0.5, -0.5)

            fig.tight_layout()
            images.append({
                "id": "box_grid_overlay",
                "title": "Сетка боксов",
                "description": "Бинаризованная маска с наложенной сеткой боксов (заполненные — жёлтые, пустые — тёмные)",
                "data": plot_to_base64(fig),
            })

            # --- Image B: box_regression ---
            fig2, ax2 = plt.subplots(figsize=(5, 4), facecolor=DARK_BG)
            ax2.scatter(x, y, color="#06b6d4", s=60, zorder=5, label="данные")
            x_line = np.linspace(x.min(), x.max(), 100)
            ax2.plot(x_line, slope * x_line + intercept, "--",
                     color="#f43f5e", linewidth=1.5,
                     label=f"D={dimension:.3f}, R²={r2:.3f}")
            dark_axes(ax2, title="Регрессия log N(ε) vs log(1/ε)")
            ax2.set_xlabel("log(1/ε)", color=TEXT, fontsize=9)
            ax2.set_ylabel("log N(ε)", color=TEXT, fontsize=9)
            ax2.legend(fontsize=8, facecolor="#1e293b", labelcolor=TEXT,
                       edgecolor="#334155")
            fig2.tight_layout()
            images.append({
                "id": "box_regression",
                "title": "Регрессия log N(ε) vs log(1/ε)",
                "description": f"Линейная регрессия размерности D={dimension:.3f}, R²={r2:.3f}",
                "data": plot_to_base64(fig2),
            })

            result["images"] = images
        except Exception:
            result["images"] = []

    return result
