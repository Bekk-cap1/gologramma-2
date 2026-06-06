"""Tests for true volumetric fractal generation."""

from __future__ import annotations

import numpy as np

from fractal_3d.volumetric import (
    assert_mesh_volume_and_colors,
    mandelbulb_volume,
    menger_volume,
    sierpinski_tetrahedron_volume,
    volume_to_mesh,
)


def _assert_usable_mesh(mesh) -> None:
    bounds = np.asarray(mesh.bounds, dtype=np.float64)
    spans = bounds[1] - bounds[0]
    assert float(spans[2]) >= 0.3 * float(spans[:2].max())
    assert_mesh_volume_and_colors(mesh)


def test_mandelbulb_volume_to_colored_mesh():
    occupancy, field = mandelbulb_volume(N=32, power=8, max_iter=6)
    assert occupancy.shape == (32, 32, 32)
    assert occupancy.dtype == np.bool_
    assert occupancy.any()

    mesh = volume_to_mesh(
        occupancy,
        field,
        bounds=((-1.2, 1.2), (-1.2, 1.2), (-1.2, 1.2)),
    )
    _assert_usable_mesh(mesh)


def test_menger_volume_to_colored_mesh():
    occupancy, field = menger_volume(level=3)
    assert occupancy.shape == (27, 27, 27)
    assert occupancy.any()
    assert not occupancy.all()

    mesh = volume_to_mesh(occupancy, field)
    _assert_usable_mesh(mesh)


def test_sierpinski_ifs_volume_to_colored_mesh():
    occupancy, field = sierpinski_tetrahedron_volume(N=32, n_points=60_000)
    assert occupancy.shape == (32, 32, 32)
    assert occupancy.any()

    mesh = volume_to_mesh(occupancy, field)
    _assert_usable_mesh(mesh)
