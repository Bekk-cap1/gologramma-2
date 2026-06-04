"""Canonical IFS parameters for known fractals (Stage 4).

Once the classifier has identified the fractal *type*, we no longer rely on
blind IFS recovery (KMeans clustering + least-squares affine fit), which has no
knowledge of the fractal's structure and e.g. returns 4 maps for a Sierpinski
carpet that mathematically needs 8. Instead we use the EXACT affine maps from
the literature (Barnsley, Peitgen et al.), then fit only the global pose
(scale + rotation + translation) to the input image (see ``ifs_pose_fitting``).

These are not "baked 3D templates" — they are the mathematically exact 2D IFS
definitions of each fractal, parameterised in normalised [0,1]x[0,1] coords:

  T_i(x) = A_i @ x + t_i ,  A_i = [[a, b], [c, d]] ,  t_i = [e, f]
"""
from __future__ import annotations

import numpy as np


def get_canonical_ifs(fractal_type: str) -> dict | None:
    """Return the canonical IFS parameters for a known type, or None.

    Coordinates are normalised to [0, 1] x [0, 1]. Returns None for unknown
    types so the caller can fall back to blind full-affine recovery.
    """
    ft = (fractal_type or "").lower()

    if ft == "sierpinski_triangle":
        # 3 maps, each contracting by 1/2 toward a triangle vertex.
        return {
            "transforms": [
                {"matrix": [[0.5, 0.0], [0.0, 0.5]], "translation": [0.0, 0.0],
                 "probability": 1/3, "contraction": 0.5},
                {"matrix": [[0.5, 0.0], [0.0, 0.5]], "translation": [0.5, 0.0],
                 "probability": 1/3, "contraction": 0.5},
                {"matrix": [[0.5, 0.0], [0.0, 0.5]], "translation": [0.25, 0.5],
                 "probability": 1/3, "contraction": 0.5},
            ],
            "num_transforms": 3,
            "theoretical_dimension": 1.585,
        }

    if ft == "sierpinski_carpet":
        # 8 maps: a 3x3 grid of 1/3-contractions with the centre cell removed.
        transforms = []
        for i in range(3):
            for j in range(3):
                if i == 1 and j == 1:
                    continue  # centre square removed
                transforms.append({
                    "matrix": [[1/3, 0.0], [0.0, 1/3]],
                    "translation": [i/3, j/3],
                    "probability": 1/8,
                    "contraction": 1/3,
                })
        return {
            "transforms": transforms,
            "num_transforms": 8,
            "theoretical_dimension": 1.893,
        }

    if ft == "koch_snowflake":
        # Single Koch curve edge: 4 maps of contraction 1/3, the middle two
        # rotated by +/-60 deg. The full snowflake (3 edges) is built directly
        # via generate_koch_snowflake_points (recursive) — see note below.
        cos60 = np.cos(np.pi / 3)   # 0.5
        sin60 = np.sin(np.pi / 3)   # ~0.866
        s = 1 / 3
        return {
            "transforms": [
                {"matrix": [[s, 0.0], [0.0, s]], "translation": [0.0, 0.0],
                 "probability": 0.25, "contraction": s},
                {"matrix": [[s * cos60, -s * sin60], [s * sin60, s * cos60]],
                 "translation": [s, 0.0],
                 "probability": 0.25, "contraction": s},
                {"matrix": [[s * cos60, s * sin60], [-s * sin60, s * cos60]],
                 "translation": [0.5, sin60 * s],
                 "probability": 0.25, "contraction": s},
                {"matrix": [[s, 0.0], [0.0, s]], "translation": [2 * s, 0.0],
                 "probability": 0.25, "contraction": s},
            ],
            "num_transforms": 4,
            "theoretical_dimension": 1.262,
            "note": "Single Koch edge; full snowflake via recursive generation.",
            "generation_method": "recursive_preferred",
        }

    if ft == "barnsley_fern":
        # Classic Barnsley fern parameters.
        return {
            "transforms": [
                {"matrix": [[0.0, 0.0], [0.0, 0.16]], "translation": [0.0, 0.0],
                 "probability": 0.01, "contraction": 0.16},
                {"matrix": [[0.85, 0.04], [-0.04, 0.85]], "translation": [0.0, 1.6],
                 "probability": 0.85, "contraction": 0.85},
                {"matrix": [[0.20, -0.26], [0.23, 0.22]], "translation": [0.0, 1.6],
                 "probability": 0.07, "contraction": 0.34},
                {"matrix": [[-0.15, 0.28], [0.26, 0.24]], "translation": [0.0, 0.44],
                 "probability": 0.07, "contraction": 0.34},
            ],
            "num_transforms": 4,
            "theoretical_dimension": 1.7,
        }

    if ft == "dragon_curve":
        s = 1 / np.sqrt(2)
        return {
            "transforms": [
                {"matrix": [[s * np.cos(np.pi / 4), -s * np.sin(np.pi / 4)],
                            [s * np.sin(np.pi / 4), s * np.cos(np.pi / 4)]],
                 "translation": [0.0, 0.0],
                 "probability": 0.5, "contraction": s},
                {"matrix": [[s * np.cos(3 * np.pi / 4), -s * np.sin(3 * np.pi / 4)],
                            [s * np.sin(3 * np.pi / 4), s * np.cos(3 * np.pi / 4)]],
                 "translation": [1.0, 0.0],
                 "probability": 0.5, "contraction": s},
            ],
            "num_transforms": 2,
            "theoretical_dimension": 2.0,
        }

    if ft == "cantor_set":
        return {
            "transforms": [
                {"matrix": [[1/3, 0.0], [0.0, 1.0]], "translation": [0.0, 0.0],
                 "probability": 0.5, "contraction": 1/3},
                {"matrix": [[1/3, 0.0], [0.0, 1.0]], "translation": [2/3, 0.0],
                 "probability": 0.5, "contraction": 1/3},
            ],
            "num_transforms": 2,
            "theoretical_dimension": 0.631,
        }

    if ft in ("menger_sponge", "menger_sponge_2d", "menger"):
        # The 2D projection of a Menger sponge is a Sierpinski carpet
        # (front face: 3x3 grid minus the centre cell = 8 maps of 1/3).
        transforms = []
        for i in range(3):
            for j in range(3):
                if i == 1 and j == 1:
                    continue
                transforms.append({
                    "matrix": [[1/3, 0.0], [0.0, 1/3]],
                    "translation": [i/3, j/3],
                    "probability": 1/8,
                    "contraction": 1/3,
                })
        return {
            "transforms": transforms,
            "num_transforms": 8,
            "theoretical_dimension": 1.893,  # log(8)/log(3)
            "note": "2D projection of Menger sponge ≈ Sierpinski carpet",
        }

    if ft == "pythagoras_tree":
        s = 1 / np.sqrt(2)
        return {
            "transforms": [
                {"matrix": [[s * np.cos(np.pi / 4), -s * np.sin(np.pi / 4)],
                            [s * np.sin(np.pi / 4), s * np.cos(np.pi / 4)]],
                 "translation": [0.0, 1.0],
                 "probability": 0.5, "contraction": s},
                {"matrix": [[s * np.cos(-np.pi / 4), -s * np.sin(-np.pi / 4)],
                            [s * np.sin(-np.pi / 4), s * np.cos(-np.pi / 4)]],
                 "translation": [0.5, 1.0 + s * np.sin(np.pi / 4)],
                 "probability": 0.5, "contraction": s},
            ],
            "num_transforms": 2,
            "theoretical_dimension": 2.0,
        }

    return None  # unknown type -> caller falls back to blind recovery


def generate_canonical_points(canonical_ifs: dict, n_points: int = 10000,
                              seed: int = 0) -> np.ndarray:
    """Run the chaos game on a canonical IFS and return normalised [0,1] points."""
    transforms = canonical_ifs["transforms"]
    probs = np.array([t.get("probability", 1.0 / len(transforms))
                      for t in transforms], dtype=float)
    probs = probs / probs.sum()
    mats = [np.asarray(t["matrix"], dtype=float) for t in transforms]
    offs = [np.asarray(t["translation"], dtype=float) for t in transforms]

    rng = np.random.default_rng(seed)
    warmup = 100
    choices = rng.choice(len(mats), size=n_points + warmup, p=probs)
    p = np.array([0.5, 0.5])
    pts = np.empty((n_points, 2), dtype=float)
    for i, k in enumerate(choices):
        p = mats[k] @ p + offs[k]
        if i >= warmup:
            pts[i - warmup] = p

    # normalise each axis to [0, 1]
    for dim in range(2):
        mn, mx = pts[:, dim].min(), pts[:, dim].max()
        if mx > mn:
            pts[:, dim] = (pts[:, dim] - mn) / (mx - mn)
    return pts


def generate_koch_snowflake_points(depth: int = 6, n_samples: int = 50000,
                                   seed: int = 0) -> np.ndarray:
    """Recursively build the Koch snowflake boundary and return [0,1] points.

    depth=6 gives 3 * 4^6 = 12288 segments — ample detail. A chaos-game IFS in
    global coordinates is awkward for the full snowflake (3 edges), so we build
    the boundary by direct recursion, which is exact and fast (<1s).
    """
    def koch_curve(p0, p1, d):
        if d == 0:
            return [p0]
        delta = (p1 - p0) / 3.0
        a = p0 + delta
        c = p0 + 2.0 * delta
        # -60 deg so the bump points OUTWARD for this (apex-up, clockwise) vertex
        # ordering — a +60 deg rotation here yields the inward "anti-snowflake".
        angle = -np.pi / 3.0
        b = a + np.array([delta[0] * np.cos(angle) - delta[1] * np.sin(angle),
                          delta[0] * np.sin(angle) + delta[1] * np.cos(angle)])
        return (koch_curve(p0, a, d - 1) +
                koch_curve(a, b, d - 1) +
                koch_curve(b, c, d - 1) +
                koch_curve(c, p1, d - 1))

    # Equilateral triangle inscribed in [0,1]^2, apex up.
    v0 = np.array([0.5, 0.067])
    v1 = np.array([0.933, 0.933])
    v2 = np.array([0.067, 0.933])

    points: list = []
    points.extend(koch_curve(v0, v1, depth))
    points.extend(koch_curve(v1, v2, depth))
    points.extend(koch_curve(v2, v0, depth))
    pts = np.array(points, dtype=float)

    if len(pts) > n_samples:
        rng = np.random.default_rng(seed)
        pts = pts[rng.choice(len(pts), n_samples, replace=False)]

    # normalise to [0, 1] (defensive — vertices already span ~[0.067, 0.933])
    for dim in range(2):
        mn, mx = pts[:, dim].min(), pts[:, dim].max()
        if mx > mn:
            pts[:, dim] = (pts[:, dim] - mn) / (mx - mn)
    return pts
