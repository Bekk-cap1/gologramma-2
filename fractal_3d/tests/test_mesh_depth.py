"""Tests for depth-map building, chaos-game point cloud, meshing and export."""
import os

import numpy as np
import pytest

from fractal_3d.reference_fractals import sierpinski_triangle
from fractal_3d.layer1_math import recover_ifs
from fractal_3d.depth_map import build_depth_map
from fractal_3d.mesh import chaos_game_3d, build_mesh, export_mesh


@pytest.fixture(scope="module")
def ifs_transforms():
    """Real IFS transforms recovered from a Sierpinski triangle."""
    return recover_ifs(sierpinski_triangle())["transforms"]


def test_build_depth_map_ifs(ifs_transforms):
    res = build_depth_map(
        fractal_type="sierpinski_triangle",
        is_escape_time=False,
        ifs_transforms=ifs_transforms,
        image=sierpinski_triangle(),
    )
    dm = res["depth_map"]
    assert isinstance(dm, np.ndarray)
    assert dm.shape == (256, 256)
    assert np.isfinite(dm).all()
    assert dm.min() >= 0.0 and dm.max() <= 1.0


def test_chaos_game_3d(ifs_transforms):
    n = 2000
    pts = chaos_game_3d(ifs_transforms, n_points=n)
    assert isinstance(pts, np.ndarray)
    assert pts.ndim == 2 and pts.shape[1] == 3
    assert pts.shape[0] == n
    assert np.isfinite(pts).all()


def test_build_mesh_from_points(ifs_transforms):
    pts = chaos_game_3d(ifs_transforms, n_points=2000)
    mesh = build_mesh(points=pts, resolution=24)
    assert mesh["n_faces"] > 0
    assert mesh["vertices"].ndim == 2
    assert mesh["vertices"].shape[1] == 3
    assert mesh["n_vertices"] == mesh["vertices"].shape[0]


def test_export_mesh_writes_files(ifs_transforms, tmp_path):
    pts = chaos_game_3d(ifs_transforms, n_points=2000)
    mesh = build_mesh(points=pts, resolution=24)
    out = export_mesh(
        mesh,
        str(tmp_path),
        basename="unit_test_fractal",
        metadata={"fractal_type": "sierpinski_triangle"},
        formats=("obj", "stl", "ply"),
    )
    for fmt in ("obj", "stl", "ply"):
        assert fmt in out
        path = out[fmt]
        assert os.path.exists(path), f"{fmt} file not written: {path}"
        assert os.path.getsize(path) > 0, f"{fmt} file is empty"
