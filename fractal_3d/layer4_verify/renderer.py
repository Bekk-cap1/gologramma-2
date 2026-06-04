"""Layer 4.2 - Render a synthesized 3D object back to a 2D top-down projection."""
from __future__ import annotations

import numpy as np


def render_topdown(synth: dict, size: int = 128) -> np.ndarray:
    """Orthographic top (XY) projection -> 128x128 grayscale [0,1]."""
    if synth.get("mode") == "escape_time" and synth.get("field") is not None:
        from PIL import Image
        f = synth["field"]
        f = f / (f.max() + 1e-9)
        img = np.asarray(Image.fromarray((f * 255).astype(np.uint8)).resize((size, size))) / 255.0
        return img.astype(np.float32)

    points = synth.get("points")
    if points is None or len(points) == 0:
        return np.zeros((size, size), dtype=np.float32)

    xy = points[:, :2]
    mn = xy.min(0)
    mx = xy.max(0)
    span = np.where((mx - mn) > 1e-9, mx - mn, 1.0)
    norm = (xy - mn) / span
    idx = np.clip((norm * (size - 1)).astype(int), 0, size - 1)
    img = np.zeros((size, size), dtype=np.float32)
    np.add.at(img, (idx[:, 1], idx[:, 0]), 1.0)
    img = np.log1p(img)
    img = img / (img.max() + 1e-9)
    return img
