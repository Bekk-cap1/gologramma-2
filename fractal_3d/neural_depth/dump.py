"""Save the intermediate depth-pipeline stages as PNGs (for a step-by-step demo).

Called by estimate_depth(..., dump_dir=...). Pure visualization — does not change
any pipeline result. matplotlib (Agg) + skimage only.
"""
from __future__ import annotations

import os

import numpy as np

_CMAP = "turbo"  # single colormap so depth colours are comparable across stages


def _save_depth(path, arr, size=512, colorbar=False, cmap=_CMAP):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from skimage.transform import resize as sk_resize

    a = np.asarray(arr, dtype=np.float32)
    a = sk_resize(a, (size, size), order=1, preserve_range=True, anti_aliasing=True)
    mn, mx = float(a.min()), float(a.max())
    if mx - mn > 1e-9:
        a = (a - mn) / (mx - mn)
    fig, ax = plt.subplots(figsize=(5.2, 5.2))
    im = ax.imshow(a, cmap=cmap, vmin=0, vmax=1)
    ax.axis("off")
    if colorbar:
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.savefig(path, dpi=110, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def _rpq_strength_map(image, labels):
    """Per-pixel pairwise connectivity = Σ R_pq incident to each superpixel."""
    from .dcnf_crf import _compute_pairwise_weights
    n = int(labels.max()) + 1
    pairs, weights = _compute_pairwise_weights(image, labels, n)
    strength = np.zeros(n, dtype=np.float64)
    if pairs.shape[0] > 0:
        np.add.at(strength, pairs[:, 0], weights)
        np.add.at(strength, pairs[:, 1], weights)
    mx = float(strength.max())
    if mx > 1e-9:
        strength = strength / mx
    return strength[labels]


def _fractal_prior_map(image, labels):
    """Per-pixel fractal prior h = 0.5·fractalDim + 0.25·texture + 0.25·gradient."""
    from .dcnf_crf import _fractal_prior
    from .postprocess import compute_gradient
    n = int(labels.max()) + 1
    flat = labels.ravel()
    cnt = np.maximum(np.bincount(flat, minlength=n).astype(np.float64), 1.0)
    gray = (image.astype(np.float32).mean(axis=2) / 255.0
            if image.ndim == 3 else image.astype(np.float32))
    grad = compute_gradient(image).ravel()
    gradient_desc = np.bincount(flat, weights=grad, minlength=n) / cnt
    gf = gray.ravel()
    mg = np.bincount(flat, weights=gf, minlength=n) / cnt
    mg2 = np.bincount(flat, weights=gf ** 2, minlength=n) / cnt
    texture_desc = np.sqrt(np.maximum(mg2 - mg ** 2, 0.0))
    h_norm, _fd = _fractal_prior(gray, labels, n, texture_desc, gradient_desc)
    return h_norm[labels]


def _save_rgb(path, img, size=512):
    from PIL import Image as PILImage
    a = np.asarray(img)
    if a.ndim == 2:
        a = np.stack([a] * 3, axis=2)
    if a.dtype != np.uint8:
        a = (np.clip(a, 0, 1) * 255).astype(np.uint8) if a.max() <= 1.0 else a.astype(np.uint8)
    PILImage.fromarray(a[:, :, :3]).resize((size, size)).save(path)


def _save_slic(path, image, labels, size=512):
    import matplotlib
    matplotlib.use("Agg")
    from skimage.segmentation import mark_boundaries
    from skimage.transform import resize as sk_resize
    from PIL import Image as PILImage

    img = np.asarray(image)
    if img.dtype != np.uint8:
        img = (np.clip(img, 0, 1) * 255).astype(np.uint8) if img.max() <= 1.0 else img.astype(np.uint8)
    if labels is None:
        _save_rgb(path, img, size)
        return
    vis = mark_boundaries(img, labels, color=(1, 1, 0), mode="thick")
    out = (np.clip(vis, 0, 1) * 255).astype(np.uint8)
    PILImage.fromarray(out).resize((size, size)).save(path)


def _save_mesh_preview(path, depth_map, size=512):
    """Render the final depth as a 3D surface (one view) — pipeline endpoint."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from skimage.transform import resize as sk_resize

    d = sk_resize(np.asarray(depth_map, dtype=np.float32), (96, 96),
                  order=1, preserve_range=True, anti_aliasing=True)
    yy, xx = np.mgrid[0:d.shape[0], 0:d.shape[1]]
    fig = plt.figure(figsize=(5.2, 5.2))
    ax = fig.add_subplot(111, projection="3d")
    ax.plot_surface(xx, yy, d, cmap=_CMAP, linewidth=0, antialiased=True)
    ax.set_axis_off()
    ax.view_init(elev=55, azim=-60)
    fig.savefig(path, dpi=110, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def dump_pipeline_stages(dump_dir, *, image, raw_depth, unary_depth, crf_solve,
                         guided, depth_map, labels):
    """Save the 8 ordered pipeline-stage PNGs into ``dump_dir``."""
    os.makedirs(dump_dir, exist_ok=True)
    _save_rgb(os.path.join(dump_dir, "01_input.png"), image)
    _save_slic(os.path.join(dump_dir, "02_slic.png"), image, labels)
    _save_depth(os.path.join(dump_dir, "03_raw_depth.png"), raw_depth)
    _save_depth(os.path.join(dump_dir, "04_unary_z.png"), unary_depth)
    _save_depth(os.path.join(dump_dir, "05_crf_depth.png"), crf_solve)
    _save_depth(os.path.join(dump_dir, "06_guided.png"), guided)
    _save_depth(os.path.join(dump_dir, "07_final_depth.png"), depth_map, colorbar=True)
    _save_mesh_preview(os.path.join(dump_dir, "08_mesh_preview.png"), depth_map)

    # Optional diagnostics (need superpixels): pairwise weights + fractal prior.
    if labels is not None:
        try:
            _save_depth(os.path.join(dump_dir, "09_rpq_weights.png"),
                        _rpq_strength_map(image, labels), cmap="inferno")
        except Exception as e:  # noqa: BLE001
            print(f"[dump] 09_rpq failed: {e}")
        try:
            _save_depth(os.path.join(dump_dir, "10_fractal_prior.png"),
                        _fractal_prior_map(image, labels), cmap="cividis")
        except Exception as e:  # noqa: BLE001
            print(f"[dump] 10_fractal_prior failed: {e}")
