"""True volumetric 3D fractal generators.

The functions in this package produce dense occupancy volumes and scalar color
fields first, then convert them to closed, vertex-colored meshes via marching
cubes. They are used by the 360-degree synthetic branch.
"""

from .ifs3d import (
    ifs3d_volume,
    sierpinski_tetrahedron_maps,
    sierpinski_tetrahedron_volume,
)
from .mandelbulb import mandelbulb_volume
from .menger import menger_volume
from .to_mesh import assert_mesh_volume_and_colors, volume_to_mesh

__all__ = [
    "assert_mesh_volume_and_colors",
    "ifs3d_volume",
    "mandelbulb_volume",
    "menger_volume",
    "sierpinski_tetrahedron_maps",
    "sierpinski_tetrahedron_volume",
    "volume_to_mesh",
]
