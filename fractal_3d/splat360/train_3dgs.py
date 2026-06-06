"""train_3dgs.py — 3D Gaussian Splatting training with point-cloud fallback.

Public function
---------------
train_or_fallback(views_dir, transforms_path, mesh_path, out_ply, **kw) -> dict
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Union


def train_or_fallback(
    views_dir: Union[str, Path],
    transforms_path: Union[str, Path],
    mesh_path: Union[str, Path],
    out_ply: Union[str, Path],
    **kw: Any,
) -> dict:
    """Try real 3DGS training (gsplat); fall back to a point-cloud PLY.

    Parameters
    ----------
    views_dir       : directory containing rendered view images.
    transforms_path : path to transforms.json.
    mesh_path       : source mesh (used for fallback PLY generation).
    out_ply         : destination PLY path.
    **kw            : forwarded to gsplat trainer (if available).

    Returns
    -------
    dict with keys:
        method        – "gsplat" or "point_cloud_fallback"
        n_gaussians   – number of Gaussians / points
        trained       – bool
        note          – human-readable description
    """
    # Lazy import of gsplat — it requires a CUDA toolkit which is typically
    # absent.  The import is intentionally deferred so the rest of the module
    # can always be imported without error.
    gsplat = None
    try:
        import gsplat as _gsplat  # type: ignore[import]
        gsplat = _gsplat
    except Exception:
        pass

    if gsplat is not None:
        # TODO: implement full 3DGS training once gsplat + CUDA toolkit are
        # available.  For now just acknowledge the import succeeded.
        return {
            "method": "gsplat",
            "n_gaussians": 0,
            "trained": False,
            "note": "gsplat found — full training not yet implemented (TODO)",
        }

    # --- Fallback: coloured point-cloud PLY ----------------------------------
    from .point_cloud import mesh_to_point_cloud_ply

    n_points = mesh_to_point_cloud_ply(
        mesh_path,
        out_ply,
        require_volume=bool(kw.get("require_volume", True)),
        require_colors=bool(kw.get("require_colors", True)),
    )

    return {
        "method": "point_cloud_fallback",
        "n_gaussians": n_points,
        "trained": False,
        "note": (
            "gsplat unavailable (CUDA toolkit) — point-cloud fallback"
        ),
    }
