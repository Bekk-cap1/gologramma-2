"""3D chaos game -> point cloud from (3D-extended) IFS transforms."""
from __future__ import annotations

import numpy as np

from ..layer1_math.ifs_recovery import extend_to_3d


def _default_sierpinski_3d():
    """Tetrahedron IFS (4 maps, contraction 0.5) as a sensible fallback."""
    verts = np.array([
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 1.0, 0.0],
        [0.5, 0.5, 1.0],
    ])
    return verts


def chaos_game_3d(transforms=None, n_points: int = 100000, warmup: int = 100,
                  seed: int = 0) -> np.ndarray:
    """Run the chaos game in 3D and return an (N,3) point cloud."""
    rng = np.random.default_rng(seed)

    if transforms:
        mats = []
        offs = []
        probs = []
        for t in transforms:
            if "matrix3d" in t:
                M = np.array(t["matrix3d"], dtype=float)
                A = M[:, :3]
                b = M[:, 3]
            else:
                ext = extend_to_3d(t)
                M = np.array(ext["matrix3d"], dtype=float)
                A = M[:, :3]
                b = M[:, 3]
            mats.append(A)
            offs.append(b)
            probs.append(t.get("probability", 1.0 / len(transforms)))
        probs = np.array(probs)
        probs = probs / probs.sum()

        p = np.array([0.5, 0.5, 0.5])
        pts = np.empty((n_points, 3), dtype=np.float32)
        for i in range(n_points + warmup):
            k = rng.choice(len(mats), p=probs)
            p = mats[k] @ p + offs[k]
            if i >= warmup:
                pts[i - warmup] = p
        return pts

    # fallback: Sierpinski tetrahedron via vertex chaos game
    verts = _default_sierpinski_3d()
    p = verts.mean(0)
    pts = np.empty((n_points, 3), dtype=np.float32)
    for i in range(n_points + warmup):
        v = verts[rng.integers(len(verts))]
        p = (p + v) / 2.0
        if i >= warmup:
            pts[i - warmup] = p
    return pts


def _koch_points_3d(n_points: int, seed: int = 0) -> np.ndarray:
    """Koch snowflake boundary extruded into a thin 3D tube.

    The snowflake is a curve, not an area, so a flat point cloud meshes into a
    degenerate slab. We "extrude" the boundary into a shallow tube by jittering
    the curve in Z (and slightly in XY) so marching cubes recovers a surface.
    """
    from ..layer1_math.canonical_ifs import generate_koch_snowflake_points

    half = max(n_points // 2, 1)
    # depth 5 matches the measured fractal dimension of typical Koch inputs best
    # (depth 6 over-fills a finite raster and inflates the box-counting dimension).
    pts2d = generate_koch_snowflake_points(depth=5, n_samples=half, seed=seed)
    rng = np.random.default_rng(seed)

    # Z-only extrusion: the XY projection stays a sharp curve (better verification
    # match), while the Z spread gives marching cubes a tube/wall to mesh.
    z0 = np.zeros(len(pts2d))
    flat = np.column_stack([pts2d, z0])
    noise_z = rng.uniform(-0.05, 0.05, len(pts2d))
    thick = np.column_stack([pts2d, noise_z])
    return np.vstack([flat, thick]).astype(np.float32)


def generate_3d_points(fractal_type: str = "", ifs_transforms=None,
                       n_points: int = 100000, global_transform=None,
                       seed: int = 0) -> np.ndarray:
    """Dispatch 3D point-cloud generation by fractal type.

    Koch snowflakes use the recursive boundary + extrusion; every other IFS
    uses the 3D chaos game on the (canonical or recovered) transforms.
    """
    if (fractal_type or "").lower() == "koch_snowflake":
        return _koch_points_3d(n_points, seed=seed)
    return chaos_game_3d(ifs_transforms, n_points=n_points, seed=seed)
