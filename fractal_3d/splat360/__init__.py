"""fractal_3d.splat360 — 360° splatting pipeline.

Two branches:
  Branch A (synthetic): mesh → rendered orbit views → point-cloud PLY fallback
  Branch B (photo):     single image → Replicate 3D model → branch A or novel views

Public API
----------
build_synthetic(mesh_path, out_dir, ...) -> dict
build_photo(image_path, out_dir, ...) -> dict
"""

from .build import build_synthetic, build_photo

__all__ = ["build_synthetic", "build_photo"]
