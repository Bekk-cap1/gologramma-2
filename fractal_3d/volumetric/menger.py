"""Deterministic Menger sponge occupancy volume."""

from __future__ import annotations

import numpy as np


def menger_volume(level: int = 4, N: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Return ``(occupancy, color_field)`` for a Menger sponge.

    A voxel is empty when, at any base-3 recursion digit, at least two of its
    coordinates are in the central third.
    """
    level = int(level)
    if level < 1:
        raise ValueError("level must be at least 1")

    base_n = 3 ** level
    N = int(N) if N is not None else base_n
    if N < 3:
        raise ValueError("N must be at least 3")

    idx = np.arange(N, dtype=np.int32)
    if N == base_n:
        logical = idx
    else:
        logical = np.floor((idx.astype(np.float64) + 0.5) * base_n / N).astype(np.int32)
        logical = np.clip(logical, 0, base_n - 1)

    xi = logical[:, None, None]
    yi = logical[None, :, None]
    zi = logical[None, None, :]

    occupancy = np.ones((N, N, N), dtype=bool)
    first_cut_level = np.full((N, N, N), float(level), dtype=np.float32)

    for t in range(level):
        div = 3 ** t
        a = (xi // div) % 3
        b = (yi // div) % 3
        c = (zi // div) % 3
        center_count = (a == 1).astype(np.int8) + (b == 1).astype(np.int8) + (c == 1).astype(np.int8)
        cut = center_count >= 2
        newly_cut = occupancy & cut
        first_cut_level = np.where(newly_cut, float(t), first_cut_level)
        occupancy &= ~cut

    x = np.linspace(0.0, 1.0, N, dtype=np.float32)[:, None, None]
    y = np.linspace(0.0, 1.0, N, dtype=np.float32)[None, :, None]
    z = np.linspace(0.0, 1.0, N, dtype=np.float32)[None, None, :]
    positional = (0.52 * x + 0.31 * y + 0.17 * z).astype(np.float32)
    level_term = first_cut_level / max(float(level), 1.0)
    color_field = np.where(
        occupancy,
        positional,
        0.65 * positional + 0.35 * level_term,
    ).astype(np.float32)
    return occupancy, color_field
