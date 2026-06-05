"""Make3D-style depth baseline (Saxena et al. 2008), simplified — no training.

A handcrafted piecewise-planar baseline for CONTRAST with the DCNF-CRF: each
superpixel is modelled as a plane z = a·x + b·y + c fitted to the unary depth,
then neighbouring planes are reconciled with a few MRF (Gauss-Seidel) sweeps.
This is the direct predecessor baseline Liu et al. compare against (Table 1).

NOTE: this is a *Make3D-style* approximation (no learned linear model on patch
features); only numpy/scipy/skimage are used.
"""
from __future__ import annotations

import numpy as np


def _smooth_planes(planes, pairs, lambda_coplanar=1.0, iterations=5):
    """MRF co-planarity smoothing: pull adjacent planes toward each other."""
    n = planes.shape[0]
    smoothed = planes.copy()
    w_smooth = lambda_coplanar / (1.0 + lambda_coplanar)
    a_idx, b_idx = pairs[:, 0], pairs[:, 1]
    for _ in range(max(1, iterations)):
        nbr = np.zeros_like(smoothed)
        cnt = np.zeros(n, dtype=np.float64)
        np.add.at(nbr, a_idx, smoothed[b_idx])
        np.add.at(nbr, b_idx, smoothed[a_idx])
        np.add.at(cnt, a_idx, 1.0)
        np.add.at(cnt, b_idx, 1.0)
        has = cnt > 0
        avg = nbr[has] / cnt[has, None]
        smoothed[has] = (1.0 - w_smooth) * smoothed[has] + w_smooth * avg
    return smoothed


def make3d_style_depth(image, unary_depth, labels, n,
                       lambda_coplanar=1.0, mrf_iterations=5):
    """Make3D-style piecewise-planar depth (simplified, no training).

    Fits z = a·x + b·y + c per superpixel to ``unary_depth``, reconciles planes
    via MRF co-planarity, then renders depth. Returns HxW float32 in [0,1].
    """
    labels = np.asarray(labels, dtype=np.int64)
    unary_depth = np.asarray(unary_depth, dtype=np.float64)
    h, w = labels.shape

    yy, xx = np.indices((h, w))
    flat_x = (xx / max(w - 1, 1)).ravel()
    flat_y = (yy / max(h - 1, 1)).ravel()
    flat_d = unary_depth.ravel()
    flat_l = labels.ravel()

    # Group pixels by superpixel once (avoids O(n·HW) boolean masks).
    order = np.argsort(flat_l, kind="stable")
    sorted_l = flat_l[order]
    bounds = np.searchsorted(sorted_l, np.arange(n + 1))

    planes = np.zeros((n, 3), dtype=np.float64)
    for p in range(n):
        idx = order[bounds[p]:bounds[p + 1]]
        if idx.size < 3:
            planes[p] = [0.0, 0.0, float(flat_d[idx].mean()) if idx.size else 0.5]
            continue
        X = np.column_stack([flat_x[idx], flat_y[idx], np.ones(idx.size)])
        coef, *_ = np.linalg.lstsq(X, flat_d[idx], rcond=None)
        planes[p] = coef

    from .dcnf_crf import _adjacency_pairs_fast
    pairs = _adjacency_pairs_fast(labels.astype(np.int32))
    if pairs.shape[0] > 0:
        planes = _smooth_planes(planes, pairs, lambda_coplanar, mrf_iterations)

    # Render depth from per-pixel plane evaluation.
    a = planes[flat_l, 0]
    b = planes[flat_l, 1]
    c = planes[flat_l, 2]
    depth = (a * flat_x + b * flat_y + c).reshape(h, w)

    dmin, dmax = float(depth.min()), float(depth.max())
    if dmax - dmin > 1e-9:
        depth = (depth - dmin) / (dmax - dmin)
    return depth.astype(np.float32)
