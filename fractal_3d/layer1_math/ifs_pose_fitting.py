"""Fit a canonical IFS attractor to an input image (Stage 4).

The canonical IFS generates its attractor in its own coordinate frame; the
input image may be rotated / scaled / translated relative to it. We find the
global similarity transform

    image_points ~= scale * R(angle) @ canonical_points + [ty, tx]

that best overlaps (IoU) the canonical attractor with the binarised image,
using a multi-start Nelder-Mead search over the pose. The internal IFS maps are
returned unchanged (the global pose is reported separately) — verification
downstream is pose-tolerant, and the win is using the *correct* set of maps.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize
from scipy.ndimage import binary_dilation
from skimage.filters import threshold_otsu
from skimage.transform import resize

from .canonical_ifs import generate_canonical_points, generate_koch_snowflake_points


def fit_canonical_to_image(canonical_ifs: dict, image: np.ndarray,
                           n_points: int = 8000,
                           fractal_type: str = "") -> dict:
    """Fit the canonical IFS pose to ``image``; return fitted maps + pose."""
    transforms = canonical_ifs["transforms"]

    # --- Step 1: canonical attractor points (normalised to [0,1]) ---
    if (fractal_type or "").lower() == "koch_snowflake":
        # The full snowflake is built by recursion, not the single-edge IFS.
        canonical_points = generate_koch_snowflake_points(depth=5, n_samples=n_points)
    else:
        canonical_points = generate_canonical_points(canonical_ifs, n_points=n_points)

    # --- Step 2: target points from the binarised image (small grid) ---
    grid = 128
    img = resize(image, (grid, grid), anti_aliasing=True)
    if img.max() > 0:
        img = img / img.max()
    try:
        thresh = threshold_otsu(img)
    except ValueError:
        thresh = 0.5
    binary = (img > thresh)

    if int(binary.sum()) < 10:
        return {"fitted_transforms": transforms, "pose": {}, "fit_score": 0.0,
                "method": "canonical_unfitted"}

    binary_d = binary_dilation(binary, iterations=2)

    # --- Step 3: optimise the similarity pose, maximising IoU ---
    cp = canonical_points  # (N, 2) in [0,1], columns are (y, x)

    def neg_iou(params):
        scale, angle, tx, ty = params
        ca, sa = np.cos(angle), np.sin(angle)
        R = np.array([[ca, -sa], [sa, ca]])
        transformed = scale * (cp @ R.T) + np.array([ty, tx])
        coords = (transformed * grid).astype(int)
        valid = ((coords[:, 0] >= 0) & (coords[:, 0] < grid) &
                 (coords[:, 1] >= 0) & (coords[:, 1] < grid))
        if not valid.any():
            return 0.0
        render = np.zeros((grid, grid), dtype=bool)
        render[coords[valid, 0], coords[valid, 1]] = True
        render_d = binary_dilation(render, iterations=2)
        inter = float(np.logical_and(render_d, binary_d).sum())
        union = float(np.logical_or(render_d, binary_d).sum())
        return -(inter / union) if union > 0 else 0.0

    best_result = None
    best_score = -1.0
    for angle_init in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        for scale_init in (0.8, 1.0):
            x0 = [scale_init, angle_init, 0.5, 0.5]
            result = minimize(neg_iou, x0, method="Nelder-Mead",
                              options={"maxiter": 120, "xatol": 0.01,
                                       "fatol": 0.002})
            if -result.fun > best_score:
                best_score = -result.fun
                best_result = result

    scale, angle, tx, ty = best_result.x
    ca, sa = np.cos(angle), np.sin(angle)
    R = np.array([[ca, -sa], [sa, ca]])

    # Keep the canonical maps unchanged; report the global pose separately.
    fitted_transforms = [{
        "matrix": [[float(t["matrix"][0][0]), float(t["matrix"][0][1])],
                   [float(t["matrix"][1][0]), float(t["matrix"][1][1])]],
        "translation": [float(t["translation"][0]), float(t["translation"][1])],
        "probability": float(t.get("probability", 1.0 / len(transforms))),
        "contraction": float(t.get("contraction", 0.5)),
    } for t in transforms]

    return {
        "fitted_transforms": fitted_transforms,
        "pose": {
            "scale": float(scale),
            "angle": float(angle),
            "tx": float(tx),
            "ty": float(ty),
        },
        "fit_score": float(best_score),
        "method": "canonical_fitted",
        "global_transform": {
            "rotation": R.tolist(),
            "scale": float(scale),
            "translation": [float(ty), float(tx)],
        },
    }
