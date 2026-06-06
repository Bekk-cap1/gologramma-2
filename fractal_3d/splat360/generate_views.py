"""generate_views.py — Branch B: single photo → 3D via Replicate API.

This module is intentionally import-safe and degrades gracefully when
`replicate` is not installed or REPLICATE_API_TOKEN is not set.

Public function
---------------
generate_from_photo(image_path, out_dir, provider="auto") -> dict
    Raises RuntimeError when Replicate is not configured.
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
    "hunyuan3d": "tencent/hunyuan3d-2",        # image → GLB mesh
    "zero123pp": "stability-ai/zero-1-to-3",    # image → novel views
    "trellis": "microsoft/trellis",             # image → 3D asset
    "instantmesh": "camenduru/instantmesh",     # image → mesh
}

_MESH_PROVIDERS = {"hunyuan3d", "trellis", "instantmesh"}
_VIEW_PROVIDERS = {"zero123pp"}


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
    """Resolve 'auto' to the first available provider slug."""
    if provider != "auto":
        if provider not in PROVIDERS:
            raise ValueError(
                f"Unknown provider {provider!r}. Choose from: {list(PROVIDERS)}"
            )
        return provider
    # 'auto': prefer mesh providers over view-only providers
    order = ["hunyuan3d", "trellis", "instantmesh", "zero123pp"]
    for p in order:
        if p in PROVIDERS:
            return p
    return next(iter(PROVIDERS))


def generate_from_photo(
    image_path: Union[str, Path],
    out_dir: Union[str, Path],
    provider: str = "auto",
) -> dict:
    """Generate 3D from a single photo via Replicate.

    Parameters
    ----------
    image_path : path to the source image.
    out_dir    : output directory (created if absent).
    provider   : one of the PROVIDERS keys or "auto".

    Returns
    -------
    dict with keys:
        provider   – provider name used
        mesh_path  – path to downloaded GLB, or None
        views_dir  – path to novel-views directory, or None
        n_views    – number of views produced (0 if mesh only)
        api_cost   – estimated cost in USD, or None

    Raises
    ------
    RuntimeError if Replicate is not configured (no lib / no token).
    """
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Check token before doing anything else
    token = os.environ.get("REPLICATE_API_TOKEN", "")
    if not token:
        raise RuntimeError(
            "Replicate not configured: set REPLICATE_API_TOKEN and pip install replicate"
        )

    replicate = _require_replicate()

    chosen = _pick_provider(provider)
    model_slug = PROVIDERS[chosen]

    # Build input payload (provider-specific)
    with open(image_path, "rb") as fh:
        image_data = fh.read()

    if chosen == "hunyuan3d":
        output = replicate.run(model_slug, input={"image": image_data})
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
