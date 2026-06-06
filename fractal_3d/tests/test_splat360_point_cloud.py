"""Tests for 360 point-cloud fallback behaviour."""

from __future__ import annotations

import pytest
import trimesh

from fractal_3d.splat360.point_cloud import mesh_to_point_cloud_ply


def _flat_depth_mesh(path):
    mesh = trimesh.Trimesh(
        vertices=[
            [-1.0, -1.0, 0.0],
            [1.0, -1.0, 0.0],
            [1.0, 1.0, 0.0],
            [-1.0, 1.0, 0.0],
        ],
        faces=[[0, 1, 2], [0, 2, 3]],
        process=False,
    )
    mesh.export(path)


def test_flat_mesh_rejected_when_volume_is_required(tmp_path):
    mesh_path = tmp_path / "flat.obj"
    _flat_depth_mesh(mesh_path)

    with pytest.raises(RuntimeError, match="geometry flat"):
        mesh_to_point_cloud_ply(
            mesh_path,
            tmp_path / "strict.ply",
            n_points=512,
            require_volume=True,
            require_colors=False,
        )


def test_depth_mesh_can_export_point_cloud_without_volume_assert(tmp_path):
    mesh_path = tmp_path / "flat.obj"
    ply_path = tmp_path / "depth.ply"
    _flat_depth_mesh(mesh_path)

    n_points = mesh_to_point_cloud_ply(
        mesh_path,
        ply_path,
        n_points=512,
        require_volume=False,
        require_colors=True,
    )

    assert n_points == 512
    assert ply_path.exists()
