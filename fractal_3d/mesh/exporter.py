"""Export meshes to OBJ / STL / PLY with fractal metadata in the header."""
from __future__ import annotations

from pathlib import Path

import numpy as np


def _meta_lines(metadata: dict, comment: str = "#") -> list[str]:
    lines = [f"{comment} Fractal 3D reconstruction"]
    for k in ("fractal_type", "fractal_dimension", "confidence", "is_escape_time"):
        if k in metadata:
            lines.append(f"{comment} {k}: {metadata[k]}")
    if metadata.get("ifs_transforms"):
        lines.append(f"{comment} num_ifs_transforms: {len(metadata['ifs_transforms'])}")
    return lines


def export_obj(vertices, faces, output_path: str, metadata: dict | None = None) -> str:
    metadata = metadata or {}
    verts = np.asarray(vertices)
    faces = np.asarray(faces)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        for line in _meta_lines(metadata, "#"):
            f.write(line + "\n")
        for v in verts:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        for tri in faces:
            f.write(f"f {tri[0]+1} {tri[1]+1} {tri[2]+1}\n")
    return str(out)


def export_stl(vertices, faces, output_path: str, metadata: dict | None = None) -> str:
    verts = np.asarray(vertices)
    faces = np.asarray(faces)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        f.write("solid fractal\n")
        for tri in faces:
            a, b, c = verts[tri[0]], verts[tri[1]], verts[tri[2]]
            n = np.cross(b - a, c - a)
            nn = np.linalg.norm(n)
            n = n / nn if nn > 1e-9 else n
            f.write(f"  facet normal {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n")
            f.write("    outer loop\n")
            for vv in (a, b, c):
                f.write(f"      vertex {vv[0]:.6f} {vv[1]:.6f} {vv[2]:.6f}\n")
            f.write("    endloop\n  endfacet\n")
        f.write("endsolid fractal\n")
    return str(out)


def export_ply(vertices, faces, output_path: str, metadata: dict | None = None) -> str:
    metadata = metadata or {}
    verts = np.asarray(vertices)
    faces = np.asarray(faces)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    # depth attribute = normalised z
    if len(verts):
        z = verts[:, 2]
        zr = (z - z.min()) / (np.ptp(z) + 1e-9)
    else:
        zr = np.zeros(len(verts))
    with open(out, "w") as f:
        f.write("ply\nformat ascii 1.0\n")
        for line in _meta_lines(metadata, "comment"):
            f.write(line + "\n")
        f.write(f"element vertex {len(verts)}\n")
        f.write("property float x\nproperty float y\nproperty float z\nproperty float depth\n")
        f.write(f"element face {len(faces)}\n")
        f.write("property list uchar int vertex_indices\nend_header\n")
        for v, d in zip(verts, zr):
            f.write(f"{v[0]:.6f} {v[1]:.6f} {v[2]:.6f} {d:.6f}\n")
        for tri in faces:
            f.write(f"3 {tri[0]} {tri[1]} {tri[2]}\n")
    return str(out)


def export_mesh(mesh: dict, output_dir: str, basename: str = "fractal",
                metadata: dict | None = None, formats=("obj", "stl", "ply")) -> dict:
    verts = mesh["vertices"]
    faces = mesh["faces"]
    out = {}
    for fmt in formats:
        path = str(Path(output_dir) / f"{basename}.{fmt}")
        if fmt == "obj":
            out["obj"] = export_obj(verts, faces, path, metadata)
        elif fmt == "stl":
            out["stl"] = export_stl(verts, faces, path, metadata)
        elif fmt == "ply":
            out["ply"] = export_ply(verts, faces, path, metadata)
    return out
