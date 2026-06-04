"""Voxelise point cloud (+ optional depth map) and run Marching Cubes."""
from __future__ import annotations

import numpy as np


def voxelize(points: np.ndarray, resolution: int = 64) -> np.ndarray:
    """Map an (N,3) cloud into a dense occupancy/density grid."""
    grid = np.zeros((resolution, resolution, resolution), dtype=np.float32)
    if len(points) == 0:
        return grid
    mn = points.min(0)
    mx = points.max(0)
    span = np.where((mx - mn) > 1e-9, mx - mn, 1.0)
    norm = (points - mn) / span
    idx = np.clip((norm * (resolution - 1)).astype(int), 0, resolution - 1)
    np.add.at(grid, (idx[:, 0], idx[:, 1], idx[:, 2]), 1.0)
    return grid


def build_mesh(points: np.ndarray | None = None, depth_map: np.ndarray | None = None,
               resolution: int = 64, smooth_iter: int = 3) -> dict:
    """Build a triangle mesh via Marching Cubes from a voxel density grid."""
    from scipy.ndimage import gaussian_filter
    from skimage import measure

    depth_path = False
    if points is not None and len(points) > 0:
        grid = voxelize(points, resolution)
    elif depth_map is not None:
        depth_path = True
        resolution = int(min(max(resolution, 8), 128))
        # resize + smooth the depth map before extrusion
        from skimage.transform import resize
        d = resize(np.asarray(depth_map, dtype=np.float32),
                   (resolution, resolution), preserve_range=True,
                   anti_aliasing=True).astype(np.float32)
        d = gaussian_filter(d, sigma=1.5)
        d = np.clip(d, 0.0, 1.0)
        # vectorised height-field extrusion: volume[x,y,z] = 1 where z < height
        heights = (d * (resolution - 1)).astype(int)
        z_idx = np.arange(resolution)[None, None, :]
        volume = (z_idx < heights[..., None]).astype(np.float32)
        grid = volume
    else:
        raise ValueError("build_mesh requires points or depth_map")

    if depth_path:
        grid = gaussian_filter(grid, sigma=1.0)
        level = 0.5
    else:
        grid = gaussian_filter(grid, sigma=1.0)
        level = max(grid.mean() + 1e-3, grid.max() * 0.15)
        if grid.max() <= level:
            level = grid.max() * 0.5

    try:
        verts, faces, normals, _ = measure.marching_cubes(grid, level=level)
    except (ValueError, RuntimeError):
        # degenerate volume -> emit a tiny cube so downstream never crashes
        verts = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                          [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], float)
        faces = np.array([[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7],
                          [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6],
                          [1, 2, 6], [1, 6, 5], [0, 3, 7], [0, 7, 4]])
        normals = np.zeros_like(verts)

    verts, faces = _laplacian_smooth(verts, faces, smooth_iter)

    # decimate if huge
    if len(faces) > 100000:
        verts, faces = _decimate(verts, faces, target=100000)

    # normalise vertices into a reasonable, centered range
    if len(verts) > 0:
        verts = np.asarray(verts, dtype=np.float32)
        mn = verts.min(0)
        mx = verts.max(0)
        span = float(np.max(mx - mn))
        if span > 1e-9:
            verts = (verts - (mn + mx) / 2.0) / span

    return {
        "vertices": verts.astype(np.float32),
        "faces": faces.astype(np.int64),
        "n_vertices": int(len(verts)),
        "n_faces": int(len(faces)),
    }


def _laplacian_smooth(verts: np.ndarray, faces: np.ndarray, iters: int) -> tuple:
    if iters <= 0 or len(verts) == 0:
        return verts, faces
    # build adjacency
    from collections import defaultdict
    adj = defaultdict(set)
    for tri in faces:
        a, b, c = tri
        adj[a].update((b, c))
        adj[b].update((a, c))
        adj[c].update((a, b))
    v = verts.copy()
    for _ in range(iters):
        new = v.copy()
        for i, nb in adj.items():
            if nb:
                new[i] = v[list(nb)].mean(0)
        v = new
    return v, faces


def _decimate(verts: np.ndarray, faces: np.ndarray, target: int) -> tuple:
    try:
        import trimesh
        m = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
        m = m.simplify_quadric_decimation(target)
        return np.asarray(m.vertices), np.asarray(m.faces)
    except Exception:
        return verts, faces
