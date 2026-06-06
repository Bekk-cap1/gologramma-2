"""Vectorized Mandelbulb occupancy volume."""

from __future__ import annotations

import numpy as np


def mandelbulb_volume(
    N: int = 192,
    power: float = 8,
    max_iter: int = 12,
    bailout: float = 2.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Return ``(occupancy, escape_field)`` for the classic Mandelbulb.

    The coordinate grid is the cube ``[-1.2, 1.2]^3``. A voxel is occupied when
    its orbit does not escape by ``max_iter``. The color field stores smooth
    escape iterations so downstream colormaps produce many unique colors.
    """
    N = int(N)
    if N < 8:
        raise ValueError("N must be at least 8")
    if power <= 0:
        raise ValueError("power must be positive")
    if max_iter < 1:
        raise ValueError("max_iter must be at least 1")
    if bailout <= 0:
        raise ValueError("bailout must be positive")

    coords = np.linspace(-1.2, 1.2, N, dtype=np.float32)
    cx = coords[:, None, None]
    cy = coords[None, :, None]
    cz = coords[None, None, :]

    zx = np.zeros((N, N, N), dtype=np.float32)
    zy = np.zeros_like(zx)
    zz = np.zeros_like(zx)

    escaped = np.zeros((N, N, N), dtype=bool)
    escape = np.full((N, N, N), float(max_iter), dtype=np.float32)
    last_r = np.zeros((N, N, N), dtype=np.float32)

    eps = np.float32(1e-9)
    log_power = float(np.log(power)) if power != 1 else 1.0

    for it in range(max_iter):
        active = ~escaped
        if not bool(active.any()):
            break

        r = np.sqrt(zx * zx + zy * zy + zz * zz, dtype=np.float32)
        last_r = r
        newly_escaped = active & (r > bailout)
        if bool(newly_escaped.any()):
            smooth = np.full_like(r, float(it), dtype=np.float32)
            if power != 1:
                safe_r = np.maximum(r, np.float32(1.000001))
                smooth = it + 1.0 - (
                    np.log(np.maximum(np.log(safe_r), eps)) / log_power
                )
            escape = np.where(newly_escaped, smooth.astype(np.float32), escape)
            escaped |= newly_escaped
            active = ~escaped
            if not bool(active.any()):
                break

        r_active = np.where(active, r, 0.0).astype(np.float32, copy=False)
        inv_r = np.zeros_like(r_active, dtype=np.float32)
        np.divide(1.0, r_active, out=inv_r, where=r_active > eps)
        theta = np.arccos(np.clip(zz * inv_r, -1.0, 1.0))
        phi = np.arctan2(zy, zx)

        rp = np.power(r_active, power, dtype=np.float32)
        ptheta = power * theta
        pphi = power * phi
        sin_theta = np.sin(ptheta)

        nx = rp * sin_theta * np.cos(pphi) + cx
        ny = rp * sin_theta * np.sin(pphi) + cy
        nz = rp * np.cos(ptheta) + cz

        zx = np.where(active, nx, zx).astype(np.float32, copy=False)
        zy = np.where(active, ny, zy).astype(np.float32, copy=False)
        zz = np.where(active, nz, zz).astype(np.float32, copy=False)

    active = ~escaped
    final_r = np.sqrt(zx * zx + zy * zy + zz * zz, dtype=np.float32)
    last_r = np.where(active, final_r, last_r)
    newly_escaped = active & (final_r > bailout)
    if bool(newly_escaped.any()):
        if power == 1:
            smooth = np.full_like(final_r, float(max_iter), dtype=np.float32)
        else:
            safe_r = np.maximum(final_r, np.float32(1.000001))
            smooth = max_iter + 1.0 - (
                np.log(np.maximum(np.log(safe_r), eps)) / log_power
            )
        escape = np.where(newly_escaped, smooth.astype(np.float32), escape)
        escaped |= newly_escaped

    occupancy = ~escaped
    escape = np.where(occupancy, float(max_iter), escape).astype(np.float32)
    return occupancy.astype(bool, copy=False), escape
