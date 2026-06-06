"""Convert dense fractal volumes to closed vertex-colored meshes."""

from __future__ import annotations

from typing import Iterable

import numpy as np


Bounds = tuple[tuple[float, float], tuple[float, float], tuple[float, float]]


def _colormap_rgba(values: np.ndarray, colormap: str) -> np.ndarray:
    vals = np.asarray(values, dtype=np.float64)
    finite = np.isfinite(vals)
    if not bool(finite.any()):
        t = np.full(vals.shape, 0.5, dtype=np.float64)
    else:
        vmin = float(np.nanpercentile(vals[finite], 1.0))
        vmax = float(np.nanpercentile(vals[finite], 99.0))
        if vmax - vmin < 1e-12:
            vmin = float(vals[finite].min())
            vmax = float(vals[finite].max())
        if vmax - vmin < 1e-12:
            t = np.full(vals.shape, 0.5, dtype=np.float64)
        else:
            t = np.clip((vals - vmin) / (vmax - vmin), 0.0, 1.0)

    try:
        import matplotlib.pyplot as plt

        rgba = plt.get_cmap(colormap)(t)
        return (rgba * 255.0).astype(np.uint8)
    except Exception:
        r = np.clip(1.5 - np.abs(4.0 * t - 3.0), 0.0, 1.0)
        g = np.clip(1.5 - np.abs(4.0 * t - 2.0), 0.0, 1.0)
        b = np.clip(1.5 - np.abs(4.0 * t - 1.0), 0.0, 1.0)
        a = np.ones_like(t)
        return (np.stack([r, g, b, a], axis=1) * 255.0).astype(np.uint8)


def _scale_vertices(verts: np.ndarray, shape: Iterable[int], bounds: Bounds) -> np.ndarray:
    shape_arr = np.asarray(tuple(shape), dtype=np.float64)
    verts01 = (verts + 0.5) / shape_arr
    out = np.empty_like(verts01, dtype=np.float64)
    for axis in range(3):
        lo, hi = bounds[axis]
        out[:, axis] = lo + verts01[:, axis] * (hi - lo)
    return out.astype(np.float32)


def _sample_color_field(color_field: np.ndarray, verts_unpadded: np.ndarray) -> np.ndarray:
    from scipy.ndimage import map_coordinates

    coords = [verts_unpadded[:, axis] for axis in range(3)]
    return map_coordinates(
        np.asarray(color_field, dtype=np.float32),
        coords,
        order=1,
        mode="nearest",
    )


def assert_mesh_volume_and_colors(mesh: "trimesh.Trimesh", min_unique_colors: int = 100) -> None:
    """Raise RuntimeError when the mesh is flat or effectively uncolored."""
    import numpy as np

    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    if vertices.size == 0:
        raise RuntimeError("geometry flat")

    spans = vertices.max(axis=0) - vertices.min(axis=0)
    max_span = float(spans.max())
    if max_span < 1e-12 or float(spans[2]) < 0.3 * max_span:
        raise RuntimeError("geometry flat")

    colors = None
    if getattr(mesh, "visual", None) is not None:
        try:
            colors = np.asarray(mesh.visual.vertex_colors, dtype=np.uint8)[:, :3]
        except Exception:
            colors = None
    unique = 0 if colors is None else len(np.unique(colors.reshape(-1, 3), axis=0))
    if unique <= min_unique_colors:
        raise RuntimeError("colors not set")


def volume_to_mesh(
    occupancy: np.ndarray,
    color_field: np.ndarray,
    colormap: str = "turbo",
    level: float = 0.5,
    bounds: Bounds = ((-1.0, 1.0), (-1.0, 1.0), (-1.0, 1.0)),
    validate: bool = True,
) -> "trimesh.Trimesh":
    """Run marching cubes on an occupancy volume and return a colored mesh."""
    import trimesh
    from skimage.measure import marching_cubes

    occ = np.asarray(occupancy, dtype=bool)
    if occ.ndim != 3:
        raise ValueError("occupancy must be a 3D array")
    if occ.shape != np.asarray(color_field).shape:
        raise ValueError("color_field must have the same shape as occupancy")
    if not bool(occ.any()):
        raise ValueError("empty volume")

    padded = np.pad(occ.astype(np.float32), 1, mode="constant", constant_values=0.0)
    verts, faces, normals, _ = marching_cubes(
        padded,
        level=level,
        allow_degenerate=False,
    )
    if len(verts) == 0 or len(faces) == 0:
        raise ValueError("marching cubes produced an empty mesh")

    verts_unpadded = verts - 1.0
    verts_scaled = _scale_vertices(verts_unpadded, occ.shape, bounds)
    sampled_colors = _sample_color_field(np.asarray(color_field, dtype=np.float32), verts_unpadded)
    rgba = _colormap_rgba(sampled_colors, colormap)

    mesh = trimesh.Trimesh(
        vertices=verts_scaled,
        faces=faces,
        vertex_normals=normals,
        process=False,
    )
    mesh.visual.vertex_colors = rgba

    if validate:
        assert_mesh_volume_and_colors(mesh)
    return mesh
