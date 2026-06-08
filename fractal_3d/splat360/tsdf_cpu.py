"""tsdf_cpu.py — CPU fallback voxelization / TSDF-like fusion.

This module provides a robust fallback when Open3D is unavailable.
It voxelizes the input mesh (using trimesh) and converts the voxel
grid to a watertight mesh via marching cubes. The method is simpler
than true TSDF fusion but does not require Open3D.
"""
from __future__ import annotations

from pathlib import Path
from typing import Union


def voxelize_mesh_to_mesh(mesh_path: Union[str, Path], out_mesh: Union[str, Path],
                         pitch: float = 0.01) -> bool:
    """Voxelize `mesh_path` and write a watertight mesh to `out_mesh`.

    Returns True on success, False on failure.
    """
    try:
        import trimesh
    except Exception:
        return False

    mesh_path = Path(mesh_path)
    out_mesh = Path(out_mesh)
    out_mesh.parent.mkdir(parents=True, exist_ok=True)

    try:
        mesh = trimesh.load(str(mesh_path), force="mesh")
        if mesh.is_empty:
            return False

        # Attempt several voxelization APIs depending on trimesh version
        vg = None
        try:
            # Preferred: voxelize convenience
            vg = trimesh.voxel.creation.voxelize(mesh, pitch=pitch)
        except Exception:
            try:
                vg = trimesh.voxel.VoxelGrid.from_mesh(mesh, pitch=pitch)
            except Exception:
                # Last resort: try the legacy 'voxelized' attribute
                try:
                    vg = mesh.voxelized(pitch)
                except Exception:
                    vg = None

        if vg is None:
            return False

        # Convert voxel grid to mesh. Different trimesh versions expose
        # different helpers; try common paths.
        try:
            # If vg has marching_cubes method
            if hasattr(vg, "marching_cubes"):
                mesh_out = vg.marching_cubes
            else:
                matrix = getattr(vg, "matrix", None) or getattr(vg, "encoding", None)
                origin = getattr(vg, "origin", None) or getattr(vg, "translate", None) or [0, 0, 0]
                if matrix is None:
                    # some voxel objects hold filled matrix under 'filled'
                    matrix = getattr(vg, "filled", None)
                if matrix is None:
                    return False
                mesh_out = trimesh.voxel.ops.matrix_to_marching_cubes(matrix, pitch, origin=origin)

        except Exception:
            # As a final fallback, try to convert voxels to points and estimate surface
            try:
                points = vg.points if hasattr(vg, "points") else None
                if points is None:
                    points = vg.sparse_indices if hasattr(vg, "sparse_indices") else None
                if points is None:
                    return False
                pc = trimesh.points.PointCloud(points * pitch)
                # Create convex hull as a fallback surface
                mesh_out = pc.convex_hull
            except Exception:
                return False

        # Export
        mesh_out.export(str(out_mesh))
        return True
    except Exception:
        return False
