"""Standalone visualization functions for the fractal 2D→3D debug pipeline.

Each function returns either one image-dict or a list of image-dicts.

Image-dict contract (EXACTLY):
    {"id": str, "title": str, "description": str, "data": <data-uri>}
"""
from __future__ import annotations

import numpy as np

from .utils.image_utils import array_to_base64, plot_to_base64, dark_axes, colorize, DARK_BG
from .common import to_gray, binarize


def depth_comparison_grid(image, depth_unary, depth_crf, depth_da=None,
                          depth_make3d=None, da_available=True,
                          unary_source="pseudo", fractal_aware=False):
    """Method comparison panel à la Liu et al. CVPR (Fig. 4 / Table 1).

    Panels: Исходное · Unary · Make3D (plane baseline) · Full CRF · DA V2.
    Unary and CRF share the SAME weak pseudo-cue unary (isolates the CRF effect);
    Make3D (Saxena) is a piecewise-planar baseline; DA V2 is a neural
    reference (ceiling). Returns one image-dict (or None on failure).
    """
    try:
        import matplotlib.pyplot as plt
        img = np.asarray(image)
        if img.ndim == 2:
            img = np.stack([img] * 3, axis=2)
        if img.dtype != np.uint8:
            img = (np.clip(img, 0, 1) * 255).astype(np.uint8) if img.max() <= 1.0 else img.astype(np.uint8)

        # Black-and-white comparison: source as luminance, depth maps in grayscale.
        gray_src = (0.299 * img[..., 0] + 0.587 * img[..., 1]
                    + 0.114 * img[..., 2]).astype(np.uint8)
        panels = [("Исходное изображение", gray_src, "gray", "#111111", "")]
        if depth_make3d is not None:
            panels.append(("Make3D (плоскости)", np.asarray(depth_make3d), "gray",
                           "#111111", "Saxena · плоскостной бейзлайн"))
        if depth_da is not None:
            da_panel = np.asarray(depth_da)
            da_caption = "neural reference · quality ceiling"
        else:
            da_panel = np.zeros_like(np.asarray(depth_crf, dtype=np.float32))
            da_caption = "n/a - install requirements.txt"
        panels.append(("Depth Anything V2" if da_available else "DA V2 (n/a)",
                       da_panel, "gray", "#111111", da_caption))
        panels.append(("Unary only (y*=z)", np.asarray(depth_unary), "gray",
                       "#111111", f"{unary_source} · weak z · no pairwise"))
        crf_cap = ("same unary + fractal-aware CRF"
                   if fractal_aware else "same unary + Liu DCNF CRF")
        panels.append(("Full CRF", np.asarray(depth_crf), "gray",
                       "#111111", crf_cap))

        n = len(panels)
        fig, axes = plt.subplots(1, n, figsize=(3.6 * n, 3.8))
        fig.patch.set_facecolor("white")
        if n == 1:
            axes = [axes]
        for ax, (title, data, cmap, color, cap) in zip(axes, panels):
            ax.imshow(data) if cmap is None else ax.imshow(data, cmap=cmap)
            ax.set_title(title, color="#111111", fontsize=10)
            if title == "DA V2 (n/a)":
                ax.text(0.5, 0.5, "Depth Anything V2\nnot available",
                        transform=ax.transAxes, ha="center", va="center",
                        color="#444444", fontsize=10, fontweight="bold")
            if cap:
                ax.text(0.5, -0.08, cap, transform=ax.transAxes, ha="center",
                        color="#555555", fontsize=8)
            ax.axis("off")
        fig.tight_layout()
        return {
            "id": "depth_method_comparison",
            "title": "Сравнение методов (Liu et al. CVPR, Table 1)",
            "description": "Unary · Make3D (Saxena) · Full CRF · DA V2 (reference)",
            "data": plot_to_base64(fig, facecolor="white"),
        }
    except Exception:
        return None


def ablation_grid(image, ablation_results):
    """Incremental-similarity ablation panel (Liu et al. Table 2 style).

    One panel per config (Unary only → +color → +hist → +LBP → Full), each
    captioned with its edge-alignment. Returns a data-uri (or None on failure).
    """
    try:
        import matplotlib.pyplot as plt
        n = len(ablation_results)
        fig, axes = plt.subplots(1, n, figsize=(3.2 * n, 3.4))
        fig.patch.set_facecolor("white")
        if n == 1:
            axes = [axes]
        for ax, res in zip(axes, ablation_results):
            ax.imshow(np.asarray(res["depth"]), cmap="gray")
            ax.set_title(res["name"], color="#111111", fontsize=10)
            ea = float(res["metrics"].get("edge_alignment", 0.0))
            ax.text(0.5, -0.08, f"границы: {ea:.3f}", transform=ax.transAxes,
                    ha="center", color="#555555", fontsize=8)
            ax.axis("off")
        fig.tight_layout()
        return plot_to_base64(fig, facecolor="white")
    except Exception:
        return None


def depth_step_images(depth_result: dict, image: np.ndarray) -> list:
    """Per-stage images for the neural DCNF-CRF depth pipeline.

    Shows: raw unary depth · SLIC superpixel boundaries · CRF-refined depth ·
    final colorized depth. Each stage is optional (only emitted if present in
    ``depth_result``). Never raises — returns whatever it could build.
    """
    images: list = []
    try:
        raw = depth_result.get("raw_depth")
        if raw is not None:
            params = (depth_result.get("neural_params", {}) or {})
            src = str(params.get("unary_source", "auto"))
            images.append({
                "id": "raw_depth",
                "title": "1. Raw depth (unary)",
                "description": f"Selected unary z from {src}",
                "data": array_to_base64(np.asarray(raw, dtype=np.float32)),
            })
    except Exception:
        pass

    try:
        labels = depth_result.get("superpixels")
        if labels is not None:
            from skimage.segmentation import mark_boundaries
            from skimage.transform import resize as sk_resize
            vis = np.asarray(image)
            if vis.ndim == 2:
                vis = np.stack([vis] * 3, axis=2)
            if vis.dtype != np.uint8:
                vis = (vis * 255).astype(np.uint8) if vis.max() <= 1.0 else vis.astype(np.uint8)
            if vis.shape[:2] != labels.shape:
                vis = (sk_resize(vis, (*labels.shape, 3), anti_aliasing=True) * 255).astype(np.uint8)
            bounds = mark_boundaries(vis, labels, color=(0, 1, 1), mode="inner")
            images.append({
                "id": "superpixels",
                "title": f"2. Superpixels SLIC ({depth_result.get('n_superpixels', '?')})",
                "description": "Сегментация на однородные регионы",
                "data": array_to_base64((bounds * 255).astype(np.uint8)),
            })
    except Exception:
        pass

    try:
        crf = depth_result.get("crf_depth")
        if crf is not None:
            params = (depth_result.get("neural_params", {}) or {})
            formula = str(params.get("crf_formula", "y* = (I + D - R)^-1 z"))
            images.append({
                "id": "crf_depth",
                "title": "3. CRF refined",
                "description": formula,
                "data": array_to_base64(np.asarray(crf, dtype=np.float32)),
            })
    except Exception:
        pass

    try:
        dm = depth_result.get("depth_map")
        if dm is not None:
            dm = np.asarray(dm, dtype=np.float32)
            # depth_map is stored square (target_size) for mesh building; resize it
            # back to the input aspect ratio for display so this panel matches the
            # original image and the other step panels (raw / CRF).
            img_arr = np.asarray(image)
            if img_arr.ndim >= 2 and tuple(img_arr.shape[:2]) != dm.shape:
                from skimage.transform import resize as sk_resize
                dm = sk_resize(dm, img_arr.shape[:2], order=1,
                               preserve_range=True, anti_aliasing=True).astype(np.float32)
            images.append({
                "id": "depth_colorized",
                "title": "4. Final depth (grayscale)",
                "description": "Edge-aware сглаживание → grayscale",
                "data": array_to_base64(colorize(dm, "gray")),
            })
    except Exception:
        pass

    return images


# ---------------------------------------------------------------------------
# 1. Preprocessing
# ---------------------------------------------------------------------------

def preprocessing_images(gray: np.ndarray, binary: np.ndarray) -> list:
    """Return 2 image-dicts for grayscale and binarized versions."""
    try:
        results = []
        results.append({
            "id": "pre_grayscale",
            "title": "Grayscale",
            "description": "После конвертации в оттенки серого",
            "data": array_to_base64(gray),
        })
        results.append({
            "id": "pre_binary",
            "title": "Бинаризация (Otsu)",
            "description": "Порог Otsu: фон/объект",
            "data": array_to_base64((np.asarray(binary) > 0).astype(float)),
        })
        return results
    except Exception:
        return []


# ---------------------------------------------------------------------------
# 2. IFS / chaos game
# ---------------------------------------------------------------------------

def ifs_images(gray: np.ndarray, transforms, n_points: int = 25000) -> list:
    """Return one image-dict for the IFS chaos-game attractor."""
    try:
        if not transforms:
            return []

        # Parse and validate transforms
        matrices = []
        translations = []
        probs = []
        for t in transforms:
            matrices.append(np.array(t["matrix"], dtype=np.float64))
            translations.append(np.array(t["translation"], dtype=np.float64))
            probs.append(float(t.get("probability", 1.0)))

        probs = np.array(probs, dtype=np.float64)
        total = probs.sum()
        if total <= 0:
            probs = np.ones(len(probs)) / len(probs)
        else:
            probs = probs / total

        cumprobs = np.cumsum(probs)

        # Chaos game
        point = np.array([0.5, 0.5], dtype=np.float64)
        img = np.zeros((256, 256), dtype=np.uint8)

        rng = np.random.default_rng(42)
        rand_vals = rng.random(n_points + 100)

        for i in range(n_points + 100):
            r = rand_vals[i]
            idx = int(np.searchsorted(cumprobs, r))
            idx = min(idx, len(matrices) - 1)
            point = matrices[idx] @ point + translations[idx]
            point = np.clip(point, 0.0, 0.9999)
            if i >= 100:
                px = int(point[0] * 256)
                py = int(point[1] * 256)
                img[py, px] = 255

        return [{
            "id": "ifs_chaos_game",
            "title": "Chaos game (восстановленная IFS)",
            "description": "Аттрактор из найденных преобразований",
            "data": array_to_base64(img),
        }]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# 3. Depth map
# ---------------------------------------------------------------------------

def depth_images(depth_map: np.ndarray) -> list:
    """Return 2 image-dicts for raw and colorized depth maps."""
    try:
        results = []
        results.append({
            "id": "depth_gray",
            "title": "Карта глубины (raw)",
            "description": "Глубина по яркости/escape/IFS",
            "data": array_to_base64(depth_map),
        })
        results.append({
            "id": "depth_colorized",
            "title": "Карта глубины (grayscale)",
            "description": "grayscale",
            "data": array_to_base64(colorize(depth_map, "gray")),
        })
        return results
    except Exception:
        return []


# ---------------------------------------------------------------------------
# 4. Ensemble voting
# ---------------------------------------------------------------------------

def ensemble_image(category_scores: dict) -> dict | None:
    """Horizontal bar chart of ensemble votes. Returns single image-dict or None."""
    try:
        if not category_scores:
            return None

        import matplotlib.pyplot as plt

        # Sort descending, take top 8
        sorted_items = sorted(category_scores.items(), key=lambda x: x[1], reverse=True)[:8]
        labels = [item[0] for item in sorted_items]
        values = [item[1] for item in sorted_items]

        # Normalize by max
        max_val = max(values) if max(values) > 0 else 1.0
        norm_values = [v / max_val for v in values]

        fig, ax = plt.subplots(figsize=(5, 4))
        fig.patch.set_facecolor("#0a0e1a")

        colors = ["#06b6d4"] * len(labels)
        colors[0] = "#10b981"  # top bar

        # Plot horizontally (index 0 = highest, so reverse for display top-to-bottom)
        y_pos = list(range(len(labels)))
        ax.barh(y_pos[::-1], norm_values, color=colors, height=0.6)

        ax.set_yticks(y_pos[::-1])
        ax.set_yticklabels(labels)
        ax.set_xlim(0, 1.05)

        dark_axes(ax, title="Голоса ансамбля")
        ax.set_xlabel("Нормированный вклад", color="#94a3b8", fontsize=8)
        ax.tick_params(axis='y', colors="#e2e8f0", labelsize=8)
        ax.tick_params(axis='x', colors="#94a3b8", labelsize=7)
        for spine in ax.spines.values():
            spine.set_color("#334155")

        fig.tight_layout()

        return {
            "id": "ensemble_votes",
            "title": "Ансамблевое голосование",
            "description": "Вклад каждого типа",
            "data": plot_to_base64(fig),
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 5. Escape / Julia render
# ---------------------------------------------------------------------------

def escape_render_image(gray: np.ndarray, c_real: float, c_imag: float,
                         size: int = 160) -> dict | None:
    """Side-by-side figure: target gray vs rendered Julia set."""
    try:
        import matplotlib.pyplot as plt
        from skimage.transform import resize

        c = complex(c_real, c_imag)

        # Render Julia set (vectorized)
        x = np.linspace(-1.5, 1.5, size)
        y = np.linspace(-1.5, 1.5, size)
        X, Y = np.meshgrid(x, y)
        Z = X + 1j * Y

        max_iter = 160
        escape = np.full(Z.shape, max_iter, dtype=np.float64)
        mask = np.ones(Z.shape, dtype=bool)

        for i in range(max_iter):
            Z[mask] = Z[mask] ** 2 + c
            esc = (np.abs(Z) > 2) & mask
            escape[esc] = i
            mask &= ~esc

        # Normalize: interior (never escaped) -> 1.0
        julia_render = escape / float(max_iter)

        # Resize original gray to match size
        gray_resized = resize(np.asarray(gray, dtype=np.float32),
                              (size, size), anti_aliasing=True)

        fig, axes = plt.subplots(1, 2, figsize=(7, 3.5))
        fig.patch.set_facecolor("#0a0e1a")
        fig.suptitle(f"c = ({c_real:.4f}, {c_imag:.4f}i)",
                     color="#e2e8f0", fontsize=10)

        axes[0].imshow(gray_resized, cmap="gray", vmin=0, vmax=1)
        axes[0].axis("off")
        dark_axes(axes[0], title="Оригинал")

        axes[1].imshow(julia_render, cmap="gray", vmin=0, vmax=1)
        axes[1].axis("off")
        dark_axes(axes[1], title=f"Julia c=({c_real:.3f}+{c_imag:.3f}i)")

        fig.tight_layout()

        return {
            "id": "escape_julia_render",
            "title": "Рендер Julia с найденным c",
            "description": "z→z²+c, сравнение с оригиналом",
            "data": plot_to_base64(fig),
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 6. Verification comparison
# ---------------------------------------------------------------------------

def verification_image(original: np.ndarray, rendered: np.ndarray) -> dict | None:
    """1x4 comparison: original, rendered, diff, edge overlay."""
    try:
        import matplotlib.pyplot as plt
        from skimage.transform import resize
        from skimage.feature import canny

        orig = np.asarray(original, dtype=np.float64)
        rend = np.asarray(rendered, dtype=np.float64)

        # Normalize to [0, 1]
        def _norm(arr):
            mn, mx = arr.min(), arr.max()
            if mx - mn < 1e-10:
                return np.zeros_like(arr)
            return (arr - mn) / (mx - mn)

        orig = _norm(orig)
        rend = _norm(rend)

        # Resize rendered to match original if needed
        if rend.shape != orig.shape:
            rend = resize(rend, orig.shape, anti_aliasing=True)

        # Absolute difference
        diff = np.abs(orig - rend)

        # Edge overlay
        edges_orig = canny(orig.astype(np.float64), sigma=2)
        edges_rend = canny(rend.astype(np.float64), sigma=2)

        h, w = orig.shape
        overlay = np.zeros((h, w, 3), dtype=np.uint8)
        both = edges_orig & edges_rend
        orig_only = edges_orig & ~edges_rend
        rend_only = edges_rend & ~edges_orig

        overlay[both] = [0, 255, 0]        # green = both
        overlay[orig_only] = [255, 0, 0]   # red = original only
        overlay[rend_only] = [0, 100, 255] # blue = rendered only

        fig, axes = plt.subplots(1, 4, figsize=(14, 4))
        fig.patch.set_facecolor("#0a0e1a")

        axes[0].imshow(orig, cmap="gray", vmin=0, vmax=1)
        axes[0].axis("off")
        dark_axes(axes[0], title="Оригинал")

        axes[1].imshow(rend, cmap="gray", vmin=0, vmax=1)
        axes[1].axis("off")
        dark_axes(axes[1], title="Рендер 3D")

        axes[2].imshow(diff, cmap="Reds", vmin=0, vmax=1)
        axes[2].axis("off")
        dark_axes(axes[2], title="Разница")

        axes[3].imshow(overlay)
        axes[3].axis("off")
        dark_axes(axes[3], title="Контуры 🟢=✓ 🔴=orig 🔵=3D")

        fig.tight_layout()

        return {
            "id": "verify_comparison",
            "title": "Верификация: сравнение",
            "description": "Оригинал · рендер · разница · контуры",
            "data": plot_to_base64(fig),
        }
    except Exception:
        return None
