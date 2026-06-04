"""Layer 1.2 - Recover IFS affine transforms via the collage theorem (inverse).

Full-affine recovery: contour points of the binarised fractal are clustered
(KMeans) into N self-similar pieces; for each cluster a full affine map
(rotation + shear + scale + translation) is estimated by least squares on
nearest-neighbour correspondences between the whole point set and the cluster.
Candidate IFS are scored by a quick chaos-game IoU verification (collage
theorem) and the best N is kept.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_dilation
from scipy.spatial import cKDTree
from skimage.feature import canny
from sklearn.cluster import KMeans

from ..common import to_gray, binarize


def verify_ifs_quick(transforms, binary_mask, h, w, n_points: int = 6000) -> float:
    """Render the IFS with a deterministic chaos game and return IoU vs the target mask."""
    if not transforms:
        return 0.0
    mats = [np.asarray(t["matrix"], dtype=float) for t in transforms]
    offs = [np.asarray(t["translation"], dtype=float) for t in transforms]
    probs = np.array([t.get("probability", 1.0 / len(transforms)) for t in transforms], dtype=float)
    s = probs.sum()
    probs = probs / s if s > 0 else np.full(len(transforms), 1.0 / len(transforms))

    rng = np.random.default_rng(0)
    choices = rng.choice(len(mats), size=n_points + 100, p=probs)
    p = np.array([0.5, 0.5])
    rendered = np.zeros((h, w), dtype=bool)
    for i, k in enumerate(choices):
        p = mats[k] @ p + offs[k]
        p = np.clip(p, 0.0, 1.0)
        if i >= 100:
            yy = min(int(p[0] * (h - 1)), h - 1)
            xx = min(int(p[1] * (w - 1)), w - 1)
            rendered[yy, xx] = True

    rendered = binary_dilation(rendered, iterations=2)
    target = binary_dilation(binary_mask.astype(bool), iterations=2)
    inter = float(np.logical_and(rendered, target).sum())
    union = float(np.logical_or(rendered, target).sum())
    return inter / union if union > 0 else 0.0


def _estimate_affine(src_pts, dst_pts):
    """Least-squares solve dst = A @ src + t for the stacked 2n x 6 system."""
    n = len(src_pts)
    M = np.zeros((2 * n, 6))
    rhs = np.zeros(2 * n)
    # rows for the destination row-coord (index 0) and col-coord (index 1)
    M[0::2, 0] = src_pts[:, 0]
    M[0::2, 1] = src_pts[:, 1]
    M[0::2, 4] = 1.0
    M[1::2, 2] = src_pts[:, 0]
    M[1::2, 3] = src_pts[:, 1]
    M[1::2, 5] = 1.0
    rhs[0::2] = dst_pts[:, 0]
    rhs[1::2] = dst_pts[:, 1]
    sol, *_ = np.linalg.lstsq(M, rhs, rcond=None)
    A = np.array([[sol[0], sol[1]], [sol[2], sol[3]]])
    t = np.array([sol[4], sol[5]])
    return A, t


def recover_ifs_full_affine(image, fast: bool = False) -> dict:
    """Recover a full-affine IFS via clustering + collage-theorem verification.

    ``fast=True`` searches a single cluster count with a cheaper verification —
    used on the latency-sensitive /predict path; the full search is used for
    /reconstruct (where mesh quality matters and the time budget is larger).
    """
    gray = to_gray(image)
    mask = binarize(gray)
    h, w = mask.shape

    edges = canny(mask.astype(float), sigma=1)
    pts = np.column_stack(np.where(edges)).astype(float)
    if len(pts) < 50:
        pts = np.column_stack(np.where(mask)).astype(float)
    if len(pts) < 6:
        return {
            "transforms": [],
            "num_transforms": 0,
            "confidence": 0.0,
            "ifs_type": "unknown",
            "recovery_method": "full_affine",
            "verification_score": 0.0,
        }

    # normalise to [0,1] (row/h, col/w)
    points = pts / np.array([h, w], dtype=float)

    n_set = (4,) if fast else (3, 4, 5)
    verify_pts = 2500 if fast else 6000
    n_init = 1 if fast else 5

    # fast path: subsample the point set so KMeans / KDTree stay cheap (<~300ms)
    if fast and len(points) > 800:
        rng = np.random.default_rng(0)
        points = points[rng.choice(len(points), 800, replace=False)]

    full_centroid = points.mean(0)
    full_std = points.std(0) + 1e-9

    best = None  # (score, transforms)
    for n_transforms in n_set:
        if n_transforms > len(points):
            continue
        km = KMeans(n_clusters=n_transforms, n_init=n_init, random_state=42).fit(points)
        transforms = []
        for c in range(n_transforms):
            cluster = points[km.labels_ == c]
            if len(cluster) < 3:
                continue
            # Build correspondences: the cluster is a contracted copy of the whole.
            # Coarsely align the whole set onto the cluster (match centroid+spread),
            # then for each cluster point find the nearest aligned whole-point.
            cl_centroid = cluster.mean(0)
            cl_std = cluster.std(0) + 1e-9
            aligned = (points - full_centroid) / full_std * cl_std + cl_centroid
            tree = cKDTree(aligned)
            dist, idx = tree.query(cluster, k=1)
            med = np.median(dist)
            keep = dist < 1.5 * med if med > 0 else np.ones(len(dist), dtype=bool)
            if keep.sum() < 3:
                keep = np.ones(len(dist), dtype=bool)
            src = points[idx[keep]]   # source = corresponding points in the FULL set
            dst = cluster[keep]       # destination = the cluster (contracted copy)
            try:
                A, t = _estimate_affine(src, dst)
            except np.linalg.LinAlgError:
                continue
            if not (np.all(np.isfinite(A)) and np.all(np.isfinite(t))):
                continue
            sv = np.linalg.svd(A, compute_uv=False)
            contraction = float(sv[0])
            if contraction >= 1.0:
                A = A * (0.9 / contraction)
                contraction = 0.9
            pred = src @ A.T + t
            residual = float(np.mean(np.linalg.norm(pred - dst, axis=1)))
            transforms.append({
                "matrix": [[float(A[0, 0]), float(A[0, 1])],
                           [float(A[1, 0]), float(A[1, 1])]],
                "translation": [float(t[0]), float(t[1])],
                "probability": float(len(cluster) / len(points)),
                "contraction": float(contraction),
                "_residual": residual,
            })

        if len(transforms) < 2:
            continue

        # normalise probabilities
        tot = sum(tr["probability"] for tr in transforms) or 1.0
        for tr in transforms:
            tr["probability"] = tr["probability"] / tot

        if fast:
            # cheap proxy: confidence from the collage residual (no chaos-game render)
            mean_res = float(np.mean([tr.get("_residual", 1.0) for tr in transforms]))
            score = float(np.clip(1.0 - mean_res * 6.0, 0.0, 1.0))
        else:
            score = verify_ifs_quick(transforms, mask, h, w, n_points=verify_pts)
        if best is None or score > best[0]:
            best = (score, transforms)

    if best is None:
        return {
            "transforms": [],
            "num_transforms": 0,
            "confidence": 0.0,
            "ifs_type": "unknown",
            "recovery_method": "full_affine",
            "verification_score": 0.0,
        }

    best_score, transforms = best
    for tr in transforms:
        tr.pop("_residual", None)
        tr["probability"] = round(tr["probability"], 4)

    confidence = float(min(best_score, 1.0))
    ifs_type = "geometric" if best_score > 0.5 else "approximate"
    return {
        "transforms": transforms,
        "num_transforms": len(transforms),
        "confidence": confidence,
        "ifs_type": ifs_type,
        "recovery_method": "full_affine",
        "verification_score": float(best_score),
    }


def recover_ifs(image, range_size: int = 8, domain_size: int = 16,
                max_clusters: int = 8, escape_time_hint: bool = False,
                fast: bool = False, classified_type: str | None = None) -> dict:
    """Recover an IFS, preferring canonical parameters for known types.

    Priority:
      1. escape-time hint  -> skip (IFS recovery is garbage for escape fractals)
      2. ``classified_type`` is a known IFS type -> canonical IFS + pose fitting
         (exact maps, e.g. 8 for the Sierpinski carpet instead of the 4 that
         blind clustering returns)
      3. otherwise -> blind full-affine recovery (clustering + collage theorem)
    """
    # Early exit: IFS recovery is meaningless (and slow) for escape-time fractals.
    if escape_time_hint:
        return {
            "transforms": [],
            "num_transforms": 0,
            "confidence": 0.0,
            "ifs_type": "not_applicable",
            "note": "skipped: escape-time fractal detected",
        }

    # Canonical path: use exact literature IFS maps when the type is known.
    if classified_type:
        from .canonical_ifs import get_canonical_ifs
        canonical = get_canonical_ifs(classified_type)
        if canonical is not None:
            from .ifs_pose_fitting import fit_canonical_to_image
            try:
                fitted = fit_canonical_to_image(
                    canonical, image, fractal_type=classified_type)
            except Exception:
                fitted = {"fit_score": 0.0}
            if fitted.get("fit_score", 0.0) > 0.2:
                return {
                    "transforms": fitted["fitted_transforms"],
                    "num_transforms": len(fitted["fitted_transforms"]),
                    "confidence": float(min(fitted["fit_score"] + 0.3, 0.99)),
                    "ifs_type": "canonical",
                    "recovery_method": "canonical_fitted",
                    "pose": fitted.get("pose"),
                    "global_transform": fitted.get("global_transform"),
                    "theoretical_dimension": canonical.get("theoretical_dimension"),
                    "fit_score": fitted["fit_score"],
                }

    return recover_ifs_full_affine(image, fast=fast)


def extend_to_3d(transform: dict, depth_factor: float = 0.8) -> dict:
    """Extend a 2D affine IFS transform to 3D via symmetry (TZ section 1.2)."""
    m = transform["matrix"]
    a, b = m[0]
    c, d = m[1]
    e, f = transform["translation"]
    s = float(np.sqrt(abs(a * d - b * c)) * depth_factor)
    matrix3d = [
        [a, b, 0.0, e],
        [c, d, 0.0, f],
        [0.0, 0.0, s, 0.0],
    ]
    return {
        "matrix3d": matrix3d,
        "probability": transform.get("probability", 1.0),
        "contraction": transform.get("contraction", s),
    }
