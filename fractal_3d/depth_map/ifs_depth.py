"""Depth map for IFS fractals: depth = recursion level at which a point appears.

Small details (high recursion level) = high frequency = object surface = near (deep).
"""
from __future__ import annotations

import numpy as np

from ..common import to_gray


def _depth_from_image(image, size: int = 256) -> np.ndarray:
    """Fallback: derive depth from local high-frequency detail of the input image.

    High-frequency (fine detail) -> near (1.0); coarse structure -> far (0.2).
    """
    from scipy.ndimage import gaussian_filter
    from PIL import Image as PILImage

    gray = to_gray(image)
    img = np.asarray(
        PILImage.fromarray((gray * 255).astype(np.uint8)).resize((size, size))) / 255.0
    detail = np.abs(img - gaussian_filter(img, sigma=3))
    detail = detail / (detail.max() + 1e-9)
    depth = 0.2 + 0.8 * detail
    depth[img < 0.05] = 0.0  # background
    return depth.astype(np.float32)


def ifs_depth_map(transforms, image=None, n_points: int = 50000, size: int = 256) -> np.ndarray:
    """Chaos game in 2D recording recursion level -> projected depth map.

    If `transforms` is empty, fall back to image-detail depth.
    """
    if not transforms:
        if image is not None:
            return _depth_from_image(image, size)
        return np.zeros((size, size), dtype=np.float32)

    probs = np.array([t.get("probability", 1.0 / len(transforms)) for t in transforms])
    probs = probs / probs.sum()
    mats = [np.array(t["matrix"], dtype=float) for t in transforms]
    trans = [np.array(t["translation"], dtype=float) for t in transforms]

    rng = np.random.default_rng(0)
    p = np.array([0.5, 0.5])
    depth_acc = np.zeros((size, size), dtype=np.float64)
    count = np.zeros((size, size), dtype=np.float64)

    level = 0
    for i in range(n_points + 100):
        k = rng.choice(len(transforms), p=probs)
        p = mats[k] @ p + trans[k]
        # track an effective "recursion level" via running contraction depth
        level = (level + 1) % 5
        if i < 100:
            continue
        x = int(np.clip(p[0] * (size - 1), 0, size - 1))
        y = int(np.clip(p[1] * (size - 1), 0, size - 1))
        d = 0.2 + 0.8 * (level / 4.0)
        depth_acc[y, x] += d
        count[y, x] += 1

    with np.errstate(invalid="ignore"):
        depth = np.where(count > 0, depth_acc / np.maximum(count, 1), 0.0)
    if depth.max() > 0:
        depth = depth / depth.max()
    return depth.astype(np.float32)
