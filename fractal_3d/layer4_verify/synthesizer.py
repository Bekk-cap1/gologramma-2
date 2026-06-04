"""Layer 4.1 - Build a 3D representation from voter result (analysis by synthesis)."""
from __future__ import annotations

import numpy as np

from ..depth_map.escape_depth import build_escape_depth, smooth_escape_field
from ..mesh.point_cloud import generate_3d_points


def synthesize(voter_result: dict, n_points: int = 50000) -> dict:
    """Return a dict with either a 3D point cloud (IFS) or an escape field."""
    if voter_result.get("is_escape_time"):
        ftype = str(voter_result.get("final_type", "")).lower()
        if ftype == "mandelbrot":
            # Render the actual Mandelbrot set (Z0=0, C=pixel) over its canonical
            # window (centre -0.7, extent 1.5 => x in [-2.2, 0.8], y in [-1.5, 1.5]),
            # NOT a Julia field. Use build_escape_depth so the *interior is the floor
            # (0)* — matching how Mandelbrot inputs are coloured. smooth_escape_field
            # sets the interior to max_iter (bright), inverting the set body and
            # collapsing SSIM/overlap vs the input.
            field = build_escape_depth(
                {"fractal_type": "mandelbrot", "center_x": -0.7, "center_y": 0.0,
                 "zoom": 1.0, "max_iterations": 100}, size=256)
        else:
            field = smooth_escape_field(
                c_real=voter_result.get("c_real", -0.7),
                c_imag=voter_result.get("c_imag", 0.27015),
                size=256,
            )
        return {"mode": "escape_time", "field": field, "points": None}

    ftype = str(voter_result.get("final_type", "")).lower()
    transforms = voter_result.get("ifs_transforms", [])
    points = generate_3d_points(
        fractal_type=ftype,
        ifs_transforms=transforms,
        n_points=n_points,
        global_transform=voter_result.get("global_transform"),
    )
    return {"mode": "ifs", "field": None, "points": points}
