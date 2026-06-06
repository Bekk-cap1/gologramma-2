"""render_views.py — Render orbit views of a mesh using matplotlib 3D.

Public function
---------------
render_mesh_orbit(mesh_path, out_dir, n_views, elevations, img_size, radius) -> str
    Returns the path to the written transforms.json.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Callable, Optional, Sequence, Union


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _look_at_c2w(azim_deg: float, elev_deg: float, radius: float) -> list[list[float]]:
    """Return a 4×4 camera-to-world matrix for a camera on a sphere.

    Convention: camera looks toward the origin; up = +Z (tilted if needed).
    """
    az = math.radians(azim_deg)
    el = math.radians(elev_deg)

    # Camera position on sphere
    cx = radius * math.cos(el) * math.cos(az)
    cy = radius * math.cos(el) * math.sin(az)
    cz = radius * math.sin(el)

    # Forward vector: origin - camera  (normalised)
    fx, fy, fz = -cx, -cy, -cz
    fn = math.sqrt(fx * fx + fy * fy + fz * fz) + 1e-12
    fx, fy, fz = fx / fn, fy / fn, fz / fn

    # Up hint = +Z; if camera is near the poles use +Y instead
    if abs(fz) > 0.99:
        ux, uy, uz = 0.0, 1.0, 0.0
    else:
        ux, uy, uz = 0.0, 0.0, 1.0

    # Right = forward × up
    rx = fy * uz - fz * uy
    ry = fz * ux - fx * uz
    rz = fx * uy - fy * ux
    rn = math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-12
    rx, ry, rz = rx / rn, ry / rn, rz / rn

    # Recompute up = right × forward (orthonormal)
    ux2 = ry * fz - rz * fy
    uy2 = rz * fx - rx * fz
    uz2 = rx * fy - ry * fx

    # c2w columns: right, up, -forward, position
    # (NeRF convention: camera +x=right, +y=up, -z=forward)
    c2w = [
        [rx,   ux2,  -fx,  cx],
        [ry,   uy2,  -fy,  cy],
        [rz,   uz2,  -fz,  cz],
        [0.0,  0.0,   0.0, 1.0],
    ]
    return c2w


def _lambertian_shade(normals, view_dir):
    """Compute per-face lambertian shading [0,1] given face normals and view direction."""
    import numpy as np
    vd = view_dir / (np.linalg.norm(view_dir) + 1e-12)
    dot = np.clip(normals @ vd, 0.0, 1.0)
    # ambient + diffuse
    return 0.25 + 0.75 * dot


def _face_normals(vertices, faces):
    """Compute per-face unit normals."""
    import numpy as np
    v0 = vertices[faces[:, 0]]
    v1 = vertices[faces[:, 1]]
    v2 = vertices[faces[:, 2]]
    e1 = v1 - v0
    e2 = v2 - v0
    n = np.cross(e1, e2)
    norms = np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    return n / norms


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

def render_mesh_orbit(
    mesh_path: Union[str, Path],
    out_dir: Union[str, Path],
    n_views: int = 60,
    elevations: Sequence[float] = (-20, 0, 20, 40),
    img_size: int = 800,
    radius: Union[str, float] = "auto",
    max_render_faces: int = 30_000,
    progress: Optional[Callable[[int, int], None]] = None,
) -> str:
    """Render orbit views of a mesh and write transforms.json.

    Parameters
    ----------
    mesh_path : path to any trimesh-loadable mesh file.
    out_dir   : output directory (created if absent).
    n_views   : total number of views (distributed evenly across elevations).
    elevations: elevation angles in degrees.
    img_size  : square image size in pixels.
    radius    : camera distance from origin.  "auto" = 2.6 × bounding radius.

    Returns
    -------
    Path (str) to out_dir/transforms.json.
    """
    import numpy as np
    import trimesh

    mesh_path = Path(mesh_path)
    out_dir = Path(out_dir)
    views_dir = out_dir / "views"
    views_dir.mkdir(parents=True, exist_ok=True)

    # --- Load mesh -----------------------------------------------------------
    mesh = trimesh.load(str(mesh_path), force="mesh")
    vertices = np.array(mesh.vertices, dtype=np.float64)
    faces = np.array(mesh.faces, dtype=np.int64)
    vertex_rgb = None
    if getattr(mesh, "visual", None) is not None:
        try:
            vc = np.asarray(mesh.visual.vertex_colors, dtype=np.uint8)
            if len(vc) == len(vertices):
                vertex_rgb = vc[:, :3].astype(np.float64) / 255.0
        except Exception:
            vertex_rgb = None

    # Center + scale
    centroid = vertices.mean(axis=0)
    vertices -= centroid
    br = np.linalg.norm(vertices, axis=1).max()
    if br < 1e-9:
        br = 1.0
    vertices /= br  # now fits roughly in unit sphere

    # Resolve radius
    if radius == "auto":
        cam_radius = 2.6
    else:
        cam_radius = float(radius)

    render_faces = faces
    if max_render_faces > 0 and len(faces) > max_render_faces:
        rng = np.random.default_rng(12345)
        keep = rng.choice(len(faces), size=int(max_render_faces), replace=False)
        keep.sort()
        render_faces = faces[keep]

    # Face normals (for shading)
    fnormals = _face_normals(vertices, render_faces)

    # Camera intrinsics (FOV ~ 45 deg in both axes)
    fov = math.radians(45.0)
    focal = (img_size / 2.0) / math.tan(fov / 2.0)
    cx_px = cy_px = img_size / 2.0

    # Build camera list
    elevations = list(elevations)
    n_el = len(elevations)
    views_per_el = max(1, n_views // n_el)

    cameras = []
    for el in elevations:
        for i in range(views_per_el):
            az = 360.0 * i / views_per_el
            cameras.append((az, el))

    # --- Matplotlib rendering ------------------------------------------------
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    frames = []
    idx = 0
    total_views = len(cameras)
    for az, el in cameras:
        fig = plt.figure(figsize=(img_size / 100, img_size / 100), dpi=100)
        ax = fig.add_subplot(111, projection="3d")

        # View direction from camera toward origin
        az_r = math.radians(az)
        el_r = math.radians(el)
        view_dir = np.array([
            -math.cos(el_r) * math.cos(az_r),
            -math.cos(el_r) * math.sin(az_r),
            -math.sin(el_r),
        ])

        # Per-face shading
        shade = _lambertian_shade(fnormals, view_dir)

        # Build face polygons
        tri_verts = vertices[render_faces]  # (F,3,3)

        # Face colors: average vertex colors when present, otherwise steel-blue.
        if vertex_rgb is not None:
            base_rgb = vertex_rgb[render_faces].mean(axis=1)
        else:
            base_rgb = np.tile(np.array([0.27, 0.51, 0.71]), (len(render_faces), 1))
        facecolors = np.clip(shade[:, None] * base_rgb, 0.0, 1.0)
        rgba = np.column_stack([facecolors, np.ones(len(render_faces))])

        poly = Poly3DCollection(
            tri_verts,
            facecolors=rgba,
            edgecolors="none",
            linewidths=0,
        )
        ax.add_collection3d(poly)

        # Axis limits — unit sphere, padded
        pad = 1.1
        ax.set_xlim(-pad, pad)
        ax.set_ylim(-pad, pad)
        ax.set_zlim(-pad, pad)
        try:
            ax.set_box_aspect([1, 1, 1])
        except Exception:
            pass

        ax.set_axis_off()
        ax.set_facecolor("white")
        fig.patch.set_facecolor("white")

        # ax.view_init: elev (degrees above XY) and azim (degrees around Z)
        ax.view_init(elev=el, azim=az)

        img_path = views_dir / f"{idx:03d}.png"
        fig.savefig(str(img_path), dpi=100, bbox_inches="tight",
                    facecolor="white", pad_inches=0)
        plt.close(fig)

        # Camera-to-world matrix
        c2w = _look_at_c2w(az, el, cam_radius)
        rel_path = f"views/{idx:03d}.png"
        frames.append({"file_path": rel_path, "transform_matrix": c2w})
        idx += 1
        if progress is not None:
            try:
                progress(idx, total_views)
            except Exception:
                pass

    # --- Write transforms.json -----------------------------------------------
    transforms = {
        "fl_x": focal,
        "fl_y": focal,
        "cx": cx_px,
        "cy": cy_px,
        "w": img_size,
        "h": img_size,
        "frames": frames,
    }
    tf_path = out_dir / "transforms.json"
    tf_path.write_text(json.dumps(transforms, indent=2), encoding="utf-8")

    return str(tf_path)
