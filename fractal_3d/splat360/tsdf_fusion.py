"""tsdf_fusion.py — Optional TSDF fusion using Open3D.

This module attempts to render depth images from a source mesh using
Open3D's OffscreenRenderer and integrate them into a TSDF volume to
produce a watertight mesh. The function is optional and falls back
gracefully if Open3D is not available.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional


def fuse_views_to_mesh(mesh_path: str | Path, transforms_path: str | Path, out_mesh: str | Path,
                       voxel_size: float = 0.01, sdf_trunc: float = 0.03) -> bool:
    """Fuse rendered views into a mesh using Open3D TSDF integration.

    Returns True on success and writes `out_mesh` (PLY). Returns False if
    Open3D is unavailable or an error occurred.
    """
    try:
        import numpy as np
        import open3d as o3d
    except Exception:
        return False

    mesh_path = Path(mesh_path)
    transforms_path = Path(transforms_path)
    out_mesh = Path(out_mesh)
    out_mesh.parent.mkdir(parents=True, exist_ok=True)

    try:
        transforms = json.loads(transforms_path.read_text(encoding="utf-8"))
        w = int(transforms.get("w", 256))
        h = int(transforms.get("h", 256))
        fl_x = float(transforms.get("fl_x", transforms.get("fl", 1.0)))
        fl_y = float(transforms.get("fl_y", fl_x))
        cx = float(transforms.get("cx", w / 2.0))
        cy = float(transforms.get("cy", h / 2.0))
        frames = transforms.get("frames", [])

        mesh = o3d.io.read_triangle_mesh(str(mesh_path))
        if mesh.is_empty():
            return False
        mesh.compute_vertex_normals()

        # Offscreen renderer
        try:
            renderer = o3d.visualization.rendering.OffscreenRenderer(w, h)
        except Exception:
            # Older Open3D may not provide OffscreenRenderer on this platform
            return False

        mat = o3d.visualization.rendering.MaterialRecord()
        mat.shader = "defaultLit"

        scene = renderer.scene
        scene.clear_geometry()
        scene.add_geometry("mesh", mesh, mat)

        # TSDF volume
        volume = o3d.pipelines.integration.ScalableTSDFVolume(
            voxel_length=voxel_size,
            sdf_trunc=sdf_trunc,
            color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8,
        )

        intrinsic = o3d.camera.PinholeCameraIntrinsic(w, h, fl_x, fl_y, cx, cy)

        for f in frames:
            # c2w is camera-to-world; Open3D expects extrinsic = world-to-camera
            c2w = np.array(f.get("transform_matrix", f.get("transform", f.get("c2w"))), dtype=np.float64)
            if c2w.shape != (4, 4):
                # support nested lists
                c2w = np.array(c2w, dtype=np.float64)
            extrinsic = np.linalg.inv(c2w)

            # Render color + depth
            try:
                renderer.setup_camera(intrinsic, extrinsic)
                color = np.asarray(renderer.render_to_image())
                depth = np.asarray(renderer.render_to_depth_image(z_in_view_space=True))
            except Exception:
                # Some renderers expose different methods — try alternatives
                color = np.asarray(renderer.render_to_image())
                depth = np.asarray(renderer.render_to_depth_image())

            # Convert to Open3D images
            color_o3d = o3d.geometry.Image((color[:, :, :3]).astype(np.uint8))
            # Depth is float32 in meters (may be zero where no geometry)
            depth_o3d = o3d.geometry.Image(depth.astype(np.float32))

            rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
                color_o3d, depth_o3d, convert_rgb_to_intensity=False, depth_trunc=3.0, depth_scale=1.0
            )

            extr = extrinsic
            volume.integrate(rgbd, intrinsic, extr)

        mesh_fused = volume.extract_triangle_mesh()
        mesh_fused.compute_vertex_normals()
        o3d.io.write_triangle_mesh(str(out_mesh), mesh_fused)
        return True
    except Exception:
        return False
