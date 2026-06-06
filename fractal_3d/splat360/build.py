"""build.py — Orchestration for the 360° splatting pipeline.

Public functions
----------------
build_synthetic(mesh_path, out_dir, ...) -> dict
build_photo(image_path, out_dir, ...) -> dict
"""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any, Callable, Optional, Sequence, Union


def build_synthetic(
    mesh_path: Union[str, Path, None],
    out_dir: Union[str, Path],
    n_views: int = 60,
    elevations: Sequence[float] = (-20, 0, 20, 40),
    img_size: int = 256,
    progress: Optional[Callable[[float, str], None]] = None,
    fractal_type: str = "mandelbulb",
    resolution: Optional[int] = None,
    power: float = 8,
    max_iter: int = 12,
    menger_level: int = 4,
    ifs_points: int = 2_000_000,
    ifs_warmup: int = 20,
) -> dict:
    """Branch A — mesh → rendered orbit → point-cloud PLY fallback.

    Parameters
    ----------
    mesh_path    : source mesh (OBJ, STL, GLB, …). Pass None when using
                   fractal_type to generate a volumetric fractal.
    out_dir      : output directory.
    n_views      : total rendered views (distributed across elevations).
    elevations   : elevation angles in degrees.
    img_size     : square image size in pixels.
    progress     : optional callable(fraction: float, message: str) for updates.
    fractal_type : "mandelbulb", "menger3d", "ifs3d", or "mesh".

    Returns
    -------
    Manifest dict (also written to out_dir/splat360_manifest.json).
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    def _prog(frac: float, msg: str) -> None:
        if progress is not None:
            try:
                progress(frac, msg)
            except Exception:
                pass

    t0 = time.perf_counter()
    ftype = (fractal_type or "mandelbulb").lower().strip()

    def _mesh_stats(mesh: Any) -> dict[str, Any]:
        try:
            import numpy as np

            vertices = np.asarray(mesh.vertices, dtype=np.float64)
            colors = np.asarray(mesh.visual.vertex_colors, dtype=np.uint8)[:, :3]
            bounds = np.asarray(mesh.bounds, dtype=np.float64)
            spans = bounds[1] - bounds[0]
            return {
                "vertices": int(len(mesh.vertices)),
                "faces": int(len(mesh.faces)),
                "bbox_min": [round(float(v), 6) for v in bounds[0]],
                "bbox_max": [round(float(v), 6) for v in bounds[1]],
                "spans": [round(float(v), 6) for v in spans],
                "unique_vertex_colors": int(len(np.unique(colors, axis=0))),
            }
        except Exception:
            return {}

    fractal_params: dict[str, Any] = {}
    if ftype in ("mandelbulb", "bulb"):
        fractal_params = {
            "resolution": int(resolution or 192),
            "power": float(power),
            "max_iter": int(max_iter),
        }
    elif ftype in ("menger3d", "menger", "menger_sponge"):
        fractal_params = {
            "level": int(menger_level),
        }
        if resolution:
            fractal_params["resolution"] = int(resolution)
    elif ftype in ("ifs3d", "sierpinski3d", "sierpinski", "sierpinski_tetrahedron"):
        fractal_params = {
            "resolution": int(resolution or 192),
            "n_points": int(ifs_points),
            "warmup": int(ifs_warmup),
        }

    # -----------------------------------------------------------------------
    # Determine mesh_path: generate fractal volume or use supplied mesh
    # -----------------------------------------------------------------------
    mesh_file = ""
    source_mesh_stats: dict[str, Any] = {}
    use_fractal_volume = ftype not in ("mesh",)

    if use_fractal_volume:
        _prog(0.0, f"Generating volumetric fractal ({fractal_type}) …")
        try:
            from .fractal_volume import build_fractal_mesh

            frac_mesh = build_fractal_mesh(ftype, **fractal_params)
            source_mesh_stats = _mesh_stats(frac_mesh)
            # Export as PLY to preserve vertex colors
            generated_ply = out_dir / "source_mesh.ply"
            frac_mesh.export(str(generated_ply))
            mesh_path = generated_ply
            mesh_file = generated_ply.name
        except Exception as exc:
            elapsed = time.perf_counter() - t0
            manifest = {
                "branch": "synthetic",
                "method": "fractal_volume",
                "fractal_type": fractal_type,
                "fractal_params": fractal_params,
                "source_mesh_stats": source_mesh_stats,
                "error": f"fractal generation failed: {exc}",
                "time_sec": round(elapsed, 2),
            }
            manifest_path = out_dir / "splat360_manifest.json"
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            _prog(1.0, "Error.")
            return manifest
    else:
        # mesh_path was supplied
        mesh_path = Path(mesh_path)
        try:
            suffix = mesh_path.suffix.lower() if mesh_path.suffix else ".obj"
            if suffix in (".obj", ".glb", ".gltf", ".stl", ".ply"):
                dst = out_dir / f"source_mesh{suffix}"
                shutil.copy2(str(mesh_path), str(dst))
                mesh_file = dst.name
        except Exception:
            mesh_file = ""

    # 1. Render orbit views
    _prog(0.1, "Rendering orbit views …")
    from .render_views import render_mesh_orbit

    def _render_progress(done: int, total: int) -> None:
        if total <= 0:
            return
        _prog(0.1 + 0.5 * (done / total), f"Rendering orbit views ({done}/{total}) …")

    transforms_path = render_mesh_orbit(
        mesh_path=mesh_path,
        out_dir=out_dir,
        n_views=n_views,
        elevations=elevations,
        img_size=img_size,
        progress=_render_progress,
    )

    _prog(0.6, "Training / generating point cloud …")

    # 2. Train or fallback
    out_ply = out_dir / "splat_360.ply"
    from .train_3dgs import train_or_fallback

    try:
        train_result = train_or_fallback(
            views_dir=out_dir / "views",
            transforms_path=transforms_path,
            mesh_path=mesh_path,
            out_ply=out_ply,
        )
    except (ValueError, RuntimeError) as exc:
        # flat geometry or no-color assert fired
        elapsed = time.perf_counter() - t0
        manifest = {
            "branch": "synthetic",
            "method": "fractal_volume" if use_fractal_volume else "point_cloud_fallback",
            "fractal_type": fractal_type,
            "fractal_params": fractal_params,
            "source_mesh_stats": source_mesh_stats,
            "error": str(exc),
            "time_sec": round(elapsed, 2),
            "mesh_file": mesh_file,
        }
        manifest_path = out_dir / "splat360_manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        _prog(1.0, "Error.")
        return manifest

    _prog(0.85, "Copying orbit thumbnails …")

    # 3. Select 8 evenly-spaced rendered views → orbit_00..orbit_07.png
    views_dir = out_dir / "views"
    view_files = sorted(views_dir.glob("*.png"))
    n_orbit = 8
    if len(view_files) >= n_orbit:
        step = len(view_files) / n_orbit
        selected = [view_files[int(i * step)] for i in range(n_orbit)]
    else:
        # Fewer images than orbit slots — cycle
        selected = [view_files[i % len(view_files)] for i in range(n_orbit)]

    for i, src in enumerate(selected):
        dst = out_dir / f"orbit_{i:02d}.png"
        shutil.copy2(str(src), str(dst))

    # 4. Write manifest
    elapsed = time.perf_counter() - t0
    manifest = {
        "branch": "synthetic",
        "method": "fractal_volume" if use_fractal_volume else train_result.get("method", "unknown"),
        "fractal_type": fractal_type,
        "fractal_params": fractal_params,
        "source_mesh_stats": source_mesh_stats,
        "n_views": n_views,
        "n_gaussians": train_result.get("n_gaussians", 0),
        "img_size": img_size,
        "elevations": list(elevations),
        "time_sec": round(elapsed, 2),
        "api_cost": None,
        "note": train_result.get("note", ""),
        "mesh_file": mesh_file,
    }
    manifest_path = out_dir / "splat360_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    _prog(1.0, "Done.")
    return manifest


def build_photo(
    image_path: Union[str, Path],
    out_dir: Union[str, Path],
    provider: str = "auto",
    progress: Optional[Callable[[float, str], None]] = None,
) -> dict:
    """Branch B — photo → Replicate 3D → optional synthetic branch.

    Falls back to a manifest with an "error" key if Replicate is not
    configured or any network error occurs; never raises.

    Parameters
    ----------
    image_path : source image.
    out_dir    : output directory.
    provider   : Replicate provider key or "auto".
    progress   : optional callable(fraction, message).

    Returns
    -------
    Manifest dict (also written to out_dir/splat360_manifest.json when
    possible).
    """
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    def _prog(frac: float, msg: str) -> None:
        if progress is not None:
            try:
                progress(frac, msg)
            except Exception:
                pass

    _prog(0.0, "Calling Replicate for 3D generation …")

    try:
        from .generate_views import generate_from_photo

        gen = generate_from_photo(image_path, out_dir, provider=provider)
    except RuntimeError as e:
        # Replicate not configured — return graceful manifest
        manifest = {"branch": "photo", "error": str(e)}
        try:
            (out_dir / "splat360_manifest.json").write_text(
                json.dumps(manifest, indent=2), encoding="utf-8"
            )
        except Exception:
            pass
        return manifest
    except Exception as e:
        manifest = {"branch": "photo", "error": str(e)}
        try:
            (out_dir / "splat360_manifest.json").write_text(
                json.dumps(manifest, indent=2), encoding="utf-8"
            )
        except Exception:
            pass
        return manifest

    _prog(0.4, "Replicate generation done.")

    mesh_path = gen.get("mesh_path")
    api_cost = gen.get("api_cost")

    if mesh_path and Path(mesh_path).exists():
        # We have a mesh — run synthetic branch
        _prog(0.5, "Running synthetic pipeline on generated mesh …")
        manifest = build_synthetic(
            mesh_path=mesh_path,
            out_dir=out_dir,
            progress=progress,
        )
        manifest["branch"] = "photo"
        manifest["provider"] = gen.get("provider")
        manifest["api_cost"] = api_cost
    else:
        # Novel views only — copy available views to orbit_*.png
        views_dir_src = gen.get("views_dir")
        orbit_copies = []
        if views_dir_src and Path(views_dir_src).is_dir():
            view_files = sorted(Path(views_dir_src).glob("*.png"))
            for i, src in enumerate(view_files[:8]):
                dst = out_dir / f"orbit_{i:02d}.png"
                shutil.copy2(str(src), str(dst))
                orbit_copies.append(str(dst))

        manifest = {
            "branch": "photo",
            "provider": gen.get("provider"),
            "n_views": gen.get("n_views", 0),
            "api_cost": api_cost,
            "note": "novel views only; 3DGS training needs gsplat",
            "orbit_files": orbit_copies,
        }

    manifest_path = out_dir / "splat360_manifest.json"
    try:
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    except Exception:
        pass

    _prog(1.0, "Done.")
    return manifest
