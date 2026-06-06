"""Compatibility facade for true volumetric fractal mesh generation."""

from __future__ import annotations

from typing import Any, Optional

from fractal_3d.volumetric import (
    mandelbulb_volume,
    menger_volume,
    sierpinski_tetrahedron_volume,
    volume_to_mesh,
)


def mandelbulb_mesh(
    resolution: int = 192,
    power: float = 8,
    max_iter: int = 12,
    bailout: float = 2.0,
    **_: Any,
) -> "trimesh.Trimesh":
    """Generate a closed, vertex-colored Mandelbulb mesh."""
    occupancy, field = mandelbulb_volume(
        N=resolution,
        power=power,
        max_iter=max_iter,
        bailout=bailout,
    )
    return volume_to_mesh(
        occupancy,
        field,
        colormap="turbo",
        bounds=((-1.2, 1.2), (-1.2, 1.2), (-1.2, 1.2)),
    )


def menger_sponge_mesh(
    level: int = 4,
    resolution: Optional[int] = None,
    **_: Any,
) -> "trimesh.Trimesh":
    """Generate a closed, vertex-colored Menger sponge mesh."""
    occupancy, field = menger_volume(level=level, N=resolution)
    return volume_to_mesh(
        occupancy,
        field,
        colormap="turbo",
        bounds=((-1.0, 1.0), (-1.0, 1.0), (-1.0, 1.0)),
    )


def sierpinski_tetrahedron_mesh(
    resolution: int = 192,
    n_points: int = 2_000_000,
    warmup: int = 20,
    seed: int | None = 12345,
    **_: Any,
) -> "trimesh.Trimesh":
    """Generate a closed, vertex-colored Sierpinski tetrahedron mesh."""
    occupancy, field = sierpinski_tetrahedron_volume(
        N=resolution,
        n_points=n_points,
        warmup=warmup,
        seed=seed,
    )
    return volume_to_mesh(
        occupancy,
        field,
        colormap="turbo",
        bounds=((-1.0, 1.0), (-1.0, 1.0), (-1.0, 1.0)),
    )


def build_fractal_mesh(fractal_type: str = "mandelbulb", **kw: Any) -> "trimesh.Trimesh":
    """Dispatch to a true volumetric fractal mesh generator."""
    ftype = (fractal_type or "mandelbulb").lower().strip()
    if ftype in ("mandelbulb", "bulb"):
        return mandelbulb_mesh(**kw)
    if ftype in ("menger3d", "menger", "menger_sponge"):
        return menger_sponge_mesh(**kw)
    if ftype in ("ifs3d", "sierpinski3d", "sierpinski", "sierpinski_tetrahedron"):
        return sierpinski_tetrahedron_mesh(**kw)
    raise ValueError(f"unknown volumetric fractal type: {fractal_type}")
