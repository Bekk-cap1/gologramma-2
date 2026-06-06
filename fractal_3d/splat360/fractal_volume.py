"""fractal_volume.py — Volumetric fractal mesh generation.

Public functions
----------------
mandelbulb_mesh(resolution, power, max_iter, bound) -> trimesh.Trimesh
menger_sponge_mesh(level, resolution) -> trimesh.Trimesh
build_fractal_mesh(fractal_type, **kw) -> trimesh.Trimesh
"""

from __future__ import annotations

from typing import Optional


def mandelbulb_mesh(
    resolution: int = 128,
    power: float = 8,
    max_iter: int = 10,
    bound: float = 1.25,
) -> "trimesh.Trimesh":
    """Generate a Mandelbulb mesh via marching cubes.

    Parameters
    ----------
    resolution : grid size per axis (NxNxN).
    power      : Mandelbulb exponent (8 gives canonical shape).
    max_iter   : escape iteration count.
    bound      : coordinate range [-bound, bound]^3.

    Returns
    -------
    trimesh.Trimesh with per-vertex turbo colors.
    """
    import numpy as np
    import trimesh
    from skimage.measure import marching_cubes
    import matplotlib.pyplot as plt

    N = resolution
    coords = np.linspace(-bound, bound, N, dtype=np.float32)
    cx, cy, cz = np.meshgrid(coords, coords, coords, indexing="ij")

    # Vectorized Mandelbulb escape iteration
    zx = np.zeros((N, N, N), dtype=np.float32)
    zy = np.zeros((N, N, N), dtype=np.float32)
    zz = np.zeros((N, N, N), dtype=np.float32)

    iters = np.full((N, N, N), max_iter, dtype=np.int32)
    escaped = np.zeros((N, N, N), dtype=bool)

    for it in range(max_iter):
        # Only iterate non-escaped points
        active = ~escaped

        # Spherical coordinates
        r = np.sqrt(zx * zx + zy * zy + zz * zz)
        theta = np.arccos(np.clip(zz / (r + 1e-9), -1.0, 1.0))
        phi = np.arctan2(zy, zx)

        zr = r ** power
        pt = power * theta
        pp = power * phi

        sin_pt = np.sin(pt)
        cos_pt = np.cos(pt)
        sin_pp = np.sin(pp)
        cos_pp = np.cos(pp)

        # New z = zr * (sin(pt)*cos(pp), sin(pt)*sin(pp), cos(pt)) + c
        zx_new = zr * sin_pt * cos_pp + cx
        zy_new = zr * sin_pt * sin_pp + cy
        zz_new = zr * cos_pt + cz

        # Apply only to active voxels
        zx = np.where(active, zx_new, zx)
        zy = np.where(active, zy_new, zy)
        zz = np.where(active, zz_new, zz)

        # Check escape: r > 2
        new_r = np.sqrt(zx * zx + zy * zy + zz * zz)
        newly_escaped = active & (new_r > 2.0)
        iters = np.where(newly_escaped, it, iters)
        escaped = escaped | newly_escaped

    # occupancy: points that never escaped = inside the set
    occupancy = (iters >= max_iter).astype(np.float32)

    # Marching cubes on occupancy field
    verts, faces, normals, _ = marching_cubes(occupancy, level=0.5)

    if len(verts) == 0:
        raise ValueError("mandelbulb: empty surface")

    # Scale vertices from voxel index space back to [-bound, bound]
    verts_scaled = verts * (2.0 * bound / (N - 1)) - bound

    # Build mesh
    mesh = trimesh.Trimesh(vertices=verts_scaled, faces=faces, process=False)

    # Per-vertex coloring: use independent spherical-harmonic-like functions per
    # R, G, B channel so that we get thousands of unique RGB combinations.
    vx = verts_scaled[:, 0].astype(np.float64)
    vy = verts_scaled[:, 1].astype(np.float64)
    vz = verts_scaled[:, 2].astype(np.float64)

    phi = np.arctan2(vy, vx)           # azimuthal angle: -pi to pi
    r_xy = np.sqrt(vx ** 2 + vy ** 2)
    theta = np.arctan2(r_xy, vz)       # polar angle: 0 to pi
    r3 = np.sqrt(vx ** 2 + vy ** 2 + vz ** 2)

    # Independent oscillations per channel → many thousands of unique RGB values
    ch_r = (np.sin(power * phi + 1.0) * np.cos(3.0 * theta) + 1.0) * 0.5
    ch_g = (np.sin(5.0 * theta + r3 * 2.0) * np.cos(2.0 * phi) + 1.0) * 0.5
    ch_b = (np.cos(4.0 * r3 * np.pi + phi) * np.sin(3.0 * theta + 0.5) + 1.0) * 0.5

    ch_r = np.clip(ch_r, 0.0, 1.0)
    ch_g = np.clip(ch_g, 0.0, 1.0)
    ch_b = np.clip(ch_b, 0.0, 1.0)

    rgb_f = np.stack([ch_r, ch_g, ch_b], axis=1).astype(np.float32)
    rgb_u8 = (rgb_f * 255).astype(np.uint8)
    alpha = np.full((len(verts_scaled), 1), 255, dtype=np.uint8)
    vertex_colors = np.concatenate([rgb_u8, alpha], axis=1)

    mesh.visual.vertex_colors = vertex_colors

    return mesh


def menger_sponge_mesh(
    level: int = 3,
    resolution: Optional[int] = None,
) -> "trimesh.Trimesh":
    """Generate a Menger sponge mesh via marching cubes.

    Parameters
    ----------
    level      : recursion depth (3 gives 3^3=27 sub-cubes per axis).
    resolution : grid size; defaults to 3**level.

    Returns
    -------
    trimesh.Trimesh with per-vertex turbo colors.
    """
    import numpy as np
    import trimesh
    from skimage.measure import marching_cubes

    N = resolution if resolution is not None else 3 ** level

    # Build occupancy by testing each voxel's base-3 coordinate digits
    # A cell is REMOVED (not solid) if >= 2 of its base-3 digits == 1 at any level
    idx = np.arange(N, dtype=np.int32)
    xi, yi, zi = np.meshgrid(idx, idx, idx, indexing="ij")

    occupancy = np.ones((N, N, N), dtype=bool)

    for lv in range(1, level + 1):
        scale = 3 ** lv
        # digit in base-3 at this level = (coord * 3^lv // N) % 3
        dx = (xi * scale // N) % 3
        dy = (yi * scale // N) % 3
        dz = (zi * scale // N) % 3
        center_count = (dx == 1).astype(np.int32) + (dy == 1).astype(np.int32) + (dz == 1).astype(np.int32)
        # Remove voxels where >= 2 digits are the center value
        occupancy &= (center_count < 2)

    occ_float = occupancy.astype(np.float32)

    verts, faces, normals, _ = marching_cubes(occ_float, level=0.5)

    if len(verts) == 0:
        raise ValueError("menger_sponge: empty surface")

    # Scale verts from [0, N-1] voxel space to [-1, 1]
    verts_scaled = verts * (2.0 / (N - 1)) - 1.0

    mesh = trimesh.Trimesh(vertices=verts_scaled, faces=faces, process=False)

    # Color by independent functions of (x, y, z) per channel for rich colors
    vx = verts_scaled[:, 0].astype(np.float64)
    vy = verts_scaled[:, 1].astype(np.float64)
    vz = verts_scaled[:, 2].astype(np.float64)

    phi = np.arctan2(vy, vx)
    r3 = np.sqrt(vx ** 2 + vy ** 2 + vz ** 2)
    r_xy = np.sqrt(vx ** 2 + vy ** 2)
    theta = np.arctan2(r_xy, vz)

    ch_r = (np.sin(6.0 * phi + 1.0) * np.cos(4.0 * theta) + 1.0) * 0.5
    ch_g = (np.sin(5.0 * theta + r3 * 3.0) + 1.0) * 0.5
    ch_b = (np.cos(4.0 * r3 * np.pi + phi + 0.7) + 1.0) * 0.5

    ch_r = np.clip(ch_r, 0.0, 1.0)
    ch_g = np.clip(ch_g, 0.0, 1.0)
    ch_b = np.clip(ch_b, 0.0, 1.0)

    rgb_f = np.stack([ch_r, ch_g, ch_b], axis=1).astype(np.float32)
    rgb_u8 = (rgb_f * 255).astype(np.uint8)
    alpha = np.full((len(verts_scaled), 1), 255, dtype=np.uint8)
    vertex_colors = np.concatenate([rgb_u8, alpha], axis=1)

    mesh.visual.vertex_colors = vertex_colors

    return mesh


def build_fractal_mesh(fractal_type: str = "mandelbulb", **kw) -> "trimesh.Trimesh":
    """Dispatch to the appropriate fractal mesh generator.

    Parameters
    ----------
    fractal_type : "mandelbulb", "menger3d", "menger", or "sierpinski3d".
    **kw         : keyword arguments forwarded to the generator.

    Returns
    -------
    trimesh.Trimesh with vertex colors.
    """
    ftype = fractal_type.lower().strip()
    if ftype == "mandelbulb":
        return mandelbulb_mesh(**kw)
    elif ftype in ("menger3d", "menger", "sierpinski3d"):
        return menger_sponge_mesh(**kw)
    else:
        # Default to mandelbulb
        return mandelbulb_mesh(**kw)
