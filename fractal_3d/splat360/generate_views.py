"""generate_views.py — single photo → 3D via Replicate or local displacement.

This module is intentionally import-safe and degrades gracefully when
`replicate` is not installed or REPLICATE_API_TOKEN is not set.

Public function
---------------
generate_from_photo(image_path, out_dir, provider="auto") -> dict
    Provider "displacement" works without any API key.
    Other providers require Replicate configured.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Union

# ---------------------------------------------------------------------------
# Provider registry
# NOTE: verify slugs before use — Replicate model slugs change over time.
# ---------------------------------------------------------------------------
PROVIDERS: dict[str, str] = {
    "hunyuan3d": "tencent/hunyuan-3d-3.1",       # image → GLB mesh (Replicate)
    "zero123pp": "stability-ai/zero-1-to-3",      # image → novel views (Replicate)
    "trellis": "microsoft/trellis",               # image → 3D asset (Replicate)
    "instantmesh": "camenduru/instantmesh",       # image → mesh (Replicate)
}

_LOCAL_PROVIDERS: set[str] = {"displacement"}    # no API key needed

_MESH_PROVIDERS = {"hunyuan3d", "trellis", "instantmesh", "displacement"}
_VIEW_PROVIDERS = {"zero123pp"}

_ALL_PROVIDERS = set(PROVIDERS.keys()) | _LOCAL_PROVIDERS


def _require_replicate():
    """Lazy import replicate; raise a helpful RuntimeError on failure."""
    try:
        import replicate as _r  # type: ignore[import]
        return _r
    except ImportError:
        raise RuntimeError(
            "Replicate not configured: set REPLICATE_API_TOKEN and pip install replicate"
        )


def _pick_provider(provider: str) -> str:
    """Resolve 'auto' to the first available provider."""
    if provider != "auto":
        if provider not in _ALL_PROVIDERS:
            raise ValueError(
                f"Unknown provider {provider!r}. Choose from: {sorted(_ALL_PROVIDERS)}"
            )
        return provider
    # Without a Replicate token, always use the local depth-displacement method
    if not os.environ.get("REPLICATE_API_TOKEN", ""):
        return "displacement"
    order = ["hunyuan3d", "trellis", "instantmesh", "zero123pp"]
    for p in order:
        if p in PROVIDERS:
            return p
    return next(iter(_ALL_PROVIDERS))


def generate_from_photo(
    image_path: Union[str, Path],
    out_dir: Union[str, Path],
    provider: str = "auto",
) -> dict:
    """Generate 3D from a single photo.

    Parameters
    ----------
    image_path : path to the source image.
    out_dir    : output directory (created if absent).
    provider   : one of ``_ALL_PROVIDERS`` or "auto".

    Returns
    -------
    dict with keys:
        provider   – provider name used
        mesh_path  – path to downloaded GLB/PLY, or None
        views_dir  – path to novel-views directory, or None
        n_views    – number of views produced (0 if mesh only)
        api_cost   – estimated cost in USD, or None

    Notes
    -----
    Provider ``"displacement"`` works locally without any API key.
    All other providers require ``REPLICATE_API_TOKEN`` and ``pip install replicate``.
    """
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    chosen = _pick_provider(provider)

    # ── Local displacement (no AI, no API) ─────────────────────────────────
    if chosen == "displacement":
        result = _generate_displacement(image_path, out_dir)
        return {
            "provider": chosen,
            "mesh_path": result["mesh_path"],
            "views_dir": None,
            "n_views": 0,
            "api_cost": 0.0,
        }

    # ── Replicate-backed providers ─────────────────────────────────────────
    token = os.environ.get("REPLICATE_API_TOKEN", "")
    if not token:
        raise RuntimeError(
            "Replicate not configured: set REPLICATE_API_TOKEN and pip install replicate"
        )

    replicate = _require_replicate()

    model_slug = PROVIDERS[chosen]

    # Build input payload (provider-specific)
    with open(image_path, "rb") as fh:
        image_data = fh.read()

    if chosen == "hunyuan3d":
        output = replicate.run(
            model_slug,
            input={
                "image": image_data,
                "enable_pbr": False,
                "face_count": 500000,
                "generate_type": "Normal",
            },
        )
    elif chosen == "zero123pp":
        output = replicate.run(model_slug, input={"image": image_data})
    elif chosen == "trellis":
        output = replicate.run(model_slug, input={"image": image_data})
    elif chosen == "instantmesh":
        output = replicate.run(model_slug, input={"image": image_data})
    else:
        output = replicate.run(model_slug, input={"image": image_data})

    # --- Download output -----------------------------------------------------
    mesh_path = None
    views_dir_out = None
    n_views = 0

    if chosen in _MESH_PROVIDERS:
        # Expect a GLB URL or file-like object
        glb_path = out_dir / "generated.glb"
        _download_replicate_output(output, glb_path)
        mesh_path = str(glb_path)
    else:
        # Novel views: output is typically a list of image URLs
        views_sub = out_dir / "novel_views"
        views_sub.mkdir(parents=True, exist_ok=True)
        views_list = output if isinstance(output, (list, tuple)) else [output]
        for i, item in enumerate(views_list):
            vpath = views_sub / f"view_{i:03d}.png"
            _download_replicate_output(item, vpath)
            n_views += 1
        views_dir_out = str(views_sub)

    return {
        "provider": chosen,
        "mesh_path": mesh_path,
        "views_dir": views_dir_out,
        "n_views": n_views,
        "api_cost": None,  # Replicate charges per-second; cost unknown upfront
    }


def _generate_displacement(image_path: Path, out_dir: Path) -> dict:
    """Build a 3D mesh from depth map (height-map displacement).

    Uses our neural depth estimator when available, falls back to luminance.
    The mesh is saved as ``displacement.ply`` with vertex colors from the
    original image.  No AI API needed — works fully offline.
    """
    from PIL import Image
    import numpy as np
    import trimesh

    TARGET = 128  # downsample for speed; 128×128 = 16k vertices

    img_rgb = Image.open(image_path).convert("RGB")
    img_rgb = img_rgb.resize((TARGET, TARGET), Image.LANCZOS)
    W, H = img_rgb.size

    # --- depth map: try neural estimator first, fall back to luminance -------
    depth_arr = None
    try:
        import base64, io
        from fractal_3d.neural_depth.estimator import estimate_depth
        result = estimate_depth(str(image_path))
        d_b64 = result.get("depth_image") or result.get("depth")
        if d_b64:
            data = base64.b64decode(d_b64.split(",")[-1])
            d_img = Image.open(io.BytesIO(data)).convert("L").resize((W, H), Image.LANCZOS)
            depth_arr = np.asarray(d_img, dtype=np.float64) / 255.0
    except Exception:
        pass

    if depth_arr is None:
        # Luminance fallback
        gray = img_rgb.convert("L")
        depth_arr = np.asarray(gray, dtype=np.float64) / 255.0

    # Scale: XY spans [-2, 2], Z spans [0, 1.5]
    zs = depth_arr * 1.5
    xs, ys = np.meshgrid(
        np.linspace(-2, 2, W),
        np.linspace(-2, 2, H),
    )

    vertices = np.stack([xs, -ys, zs], axis=-1).reshape(-1, 3)

    # Triangles (2 per grid cell) — vectorised
    idx = np.arange((H - 1) * (W - 1))
    row = (idx // (W - 1)) * W + (idx % (W - 1))
    nxt = row + W
    x_off = idx % (W - 1)
    _ = x_off  # used via row offset already
    f1 = np.stack([row, row + 1, nxt], axis=1)
    f2 = np.stack([nxt, row + 1, nxt + 1], axis=1)
    faces = np.concatenate([f1, f2], axis=0)

    colors = np.asarray(img_rgb, dtype=np.uint8).reshape(-1, 3)

    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, vertex_colors=colors)
    mesh_path = out_dir / "displacement.ply"
    mesh.export(str(mesh_path))
    return {"mesh_path": str(mesh_path)}


def _download_replicate_output(output, dest: Path) -> None:
    """Download a Replicate output (URL string or file-like) to dest."""
    import urllib.request

    if hasattr(output, "read"):
        data = output.read()
        dest.write_bytes(data)
    elif isinstance(output, str) and output.startswith("http"):
        urllib.request.urlretrieve(output, str(dest))
    elif isinstance(output, bytes):
        dest.write_bytes(output)
    else:
        # Best-effort: convert to string and try as URL
        s = str(output)
        if s.startswith("http"):
            urllib.request.urlretrieve(s, str(dest))
        else:
            dest.write_text(s, encoding="utf-8")
