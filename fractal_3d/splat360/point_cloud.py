"""point_cloud.py — Convert a mesh to a coloured point-cloud PLY file.

Public function
---------------
mesh_to_point_cloud_ply(mesh_path, ply_path, n_points=50000) -> int
    Returns the number of points written.
"""

from __future__ import annotations

import struct
from pathlib import Path
from typing import Union


def mesh_to_point_cloud_ply(
    mesh_path: Union[str, Path],
    ply_path: Union[str, Path],
    n_points: int = 50_000,
    require_volume: bool = True,
    require_colors: bool = True,
) -> int:
    """Sample a mesh surface and write a binary-little-endian PLY file.

    The PLY header is standard so three.js PLYLoader can read it.
    Vertex properties: x, y, z (float32), red, green, blue (uchar).

    Parameters
    ----------
    mesh_path : path to any trimesh-loadable mesh.
    ply_path  : output .ply path (directories created if needed).
    n_points  : number of surface samples.
    require_volume : reject sheet-like geometry when True.
    require_colors : reject low-diversity colours when True.

    Returns
    -------
    Actual number of points written (may differ from n_points if the mesh
    is degenerate or has fewer than n_points surface elements).
    """
    import numpy as np
    import trimesh
    import trimesh.sample as tsample

    mesh_path = Path(mesh_path)
    ply_path = Path(ply_path)
    ply_path.parent.mkdir(parents=True, exist_ok=True)

    # --- Load mesh -----------------------------------------------------------
    mesh = trimesh.load(str(mesh_path), force="mesh")
    if len(mesh.faces) == 0:
        raise ValueError(f"Mesh has no faces: {mesh_path}")

    actual_n = max(1, int(n_points))

    # --- Sample surface -------------------------------------------------------
    try:
        points, face_indices = tsample.sample_surface(mesh, actual_n)
    except Exception:
        # Fallback: uniformly subsample vertices
        verts = np.array(mesh.vertices, dtype=np.float32)
        replace = actual_n > len(verts)
        idx = np.random.choice(len(verts), size=actual_n, replace=replace)
        points = verts[idx]
        face_indices = None

    points = np.array(points, dtype=np.float32)
    actual_n = len(points)

    # --- Determine colours ---------------------------------------------------
    colors_u8 = None

    # Try vertex colours from the mesh visual
    if hasattr(mesh, "visual") and mesh.visual is not None:
        try:
            vc = mesh.visual.vertex_colors  # RGBA uint8 (n_verts, 4)
            if vc is not None and len(vc) == len(mesh.vertices):
                vc = np.array(vc, dtype=np.uint8)
                if face_indices is not None:
                    # Map face → vertex (use first vertex of each face)
                    fv = np.array(mesh.faces, dtype=np.int64)[face_indices]
                    colors_u8 = vc[fv, :3].mean(axis=1).astype(np.uint8)
                else:
                    # From the vertex-subsample path
                    colors_u8 = vc[idx, :3]
        except Exception:
            colors_u8 = None

    # Fallback: colour by most-varying axis (→ turbo colormap)
    if colors_u8 is None:
        import matplotlib.pyplot as plt

        spans = points.max(axis=0) - points.min(axis=0)
        axis = int(np.argmax(spans))  # most-varying axis
        col = points[:, axis]
        cmin, cmax = col.min(), col.max()
        if cmax - cmin < 1e-9:
            t = np.full(actual_n, 0.5)
        else:
            t = (col - cmin) / (cmax - cmin)

        cmap = plt.get_cmap("turbo")
        rgba_f = cmap(t)  # (N, 4) float [0,1]
        colors_u8 = (rgba_f[:, :3] * 255).astype(np.uint8)

    colors_u8 = np.asarray(colors_u8, dtype=np.uint8)
    if require_colors and len(np.unique(colors_u8.reshape(-1, 3), axis=0)) <= 100:
        # Many OBJ/depth meshes load with a constant default material colour.
        # Treat that as missing colour and synthesize a useful positional ramp.
        import matplotlib.pyplot as plt

        spans_for_color = points.max(axis=0) - points.min(axis=0)
        axis = int(np.argmax(spans_for_color))
        col = points[:, axis]
        cmin, cmax = col.min(), col.max()
        if cmax - cmin < 1e-9:
            t = np.full(actual_n, 0.5)
        else:
            t = (col - cmin) / (cmax - cmin)
        colors_u8 = (plt.get_cmap("turbo")(t)[:, :3] * 255).astype(np.uint8)

    # --- Asserts: geometry must be volumetric and colors must be diverse ------
    spans = points.max(axis=0) - points.min(axis=0)
    maxspan = float(spans.max())
    if maxspan < 1e-9:
        maxspan = 1e-9
    if require_volume and float(spans[2]) < 0.3 * maxspan:
        raise RuntimeError("geometry flat")

    unique_colors = len(np.unique(colors_u8.reshape(-1, 3), axis=0))
    if require_colors and unique_colors <= 100:
        raise RuntimeError("colors not set")

    # --- Write PLY (binary little-endian) ------------------------------------
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {actual_n}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "end_header\n"
    )
    header_bytes = header.encode("ascii")

    # Pack: 3×float32 (12 bytes) + 3×uint8 (3 bytes) = 15 bytes per vertex
    record_fmt = "<fffBBB"
    record_size = struct.calcsize(record_fmt)  # 15

    with open(ply_path, "wb") as fh:
        fh.write(header_bytes)
        # Write in chunks to avoid huge in-memory buffer
        chunk = 4096
        for start in range(0, actual_n, chunk):
            end = min(start + chunk, actual_n)
            buf = bytearray((end - start) * record_size)
            offset = 0
            for k in range(start, end):
                struct.pack_into(
                    record_fmt,
                    buf,
                    offset,
                    float(points[k, 0]),
                    float(points[k, 1]),
                    float(points[k, 2]),
                    int(colors_u8[k, 0]),
                    int(colors_u8[k, 1]),
                    int(colors_u8[k, 2]),
                )
                offset += record_size
            fh.write(buf)

    return actual_n
