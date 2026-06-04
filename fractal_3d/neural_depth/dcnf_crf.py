"""DCNF-CRF superpixel depth refinement (numpy/scipy/skimage only, no cv2)."""
import numpy as np
from skimage.color import rgb2lab

from .postprocess import compute_gradient, normalize_depth


def _slic_adaptive(image, target_segments=500, compactness=10.0, iterations=8):
    """Content-adaptive SLIC superpixels (ported from the matlab/ project).

    Unlike a plain grid, cluster centres are seeded at local gradient minima
    (so they avoid edges) and refined with an adaptive spatial weight, yielding
    superpixels that follow object contours instead of a regular tile grid.

    Returns an int32 HxW label map (contiguous 0..n-1).
    """
    h, w = image.shape[:2]
    area = max(1, h * w)
    step = max(4.0, float(np.sqrt(area / float(max(1, target_segments)))))

    # LAB in REAL units (L:0-100, a/b:-128..127). Do NOT renormalise to [0,1] —
    # that crushes the colour distance so the spatial term dominates and the
    # result degenerates into a regular Voronoi grid. The standard SLIC distance
    #   D² = d_lab² + (d_xy/S)²·m²   (below) keeps colour and space comparable.
    if image.ndim == 3:
        rgb01 = image if image.max() <= 1.0 else image.astype(np.float32) / 255.0
    else:
        g = image.astype(np.float32)
        g = g / 255.0 if g.max() > 1.0 else g
        rgb01 = np.stack([g, g, g], axis=2)
    lab = rgb2lab(rgb01).astype(np.float32)

    gradient = compute_gradient(image)

    # --- Seed centres on a grid, nudged to the local (3x3) gradient minimum ---
    ys = np.arange(step * 0.5, h, step, dtype=np.float32)
    xs = np.arange(step * 0.5, w, step, dtype=np.float32)
    if ys.size == 0:
        ys = np.array([h * 0.5], dtype=np.float32)
    if xs.size == 0:
        xs = np.array([w * 0.5], dtype=np.float32)

    centers = []
    for y in ys:
        for x in xs:
            cy = int(np.clip(round(float(y)), 0, h - 1))
            cx = int(np.clip(round(float(x)), 0, w - 1))
            y0, y1 = max(0, cy - 1), min(h, cy + 2)
            x0, x1 = max(0, cx - 1), min(w, cx + 2)
            local = gradient[y0:y1, x0:x1]
            oy, ox = np.unravel_index(int(np.argmin(local)), local.shape)
            cy, cx = y0 + int(oy), x0 + int(ox)
            centers.append([float(cy), float(cx), *lab[cy, cx].tolist()])

    centers_arr = np.asarray(centers, dtype=np.float32)
    n = centers_arr.shape[0]
    labels = np.full((h, w), -1, dtype=np.int32)
    distances = np.full((h, w), np.inf, dtype=np.float32)

    # Standard SLIC balance: spatial term scaled by m² (compactness²) so that,
    # with d_xy normalised by the step S, colour and space are commensurate.
    spatial_weight = float(compactness) ** 2
    search_radius = max(4, int(round(step * 1.35)))
    step_sq = max(step * step, 1e-6)

    yy_all, xx_all = np.mgrid[0:h, 0:w]
    yy_flat = yy_all.ravel().astype(np.float64)
    xx_flat = xx_all.ravel().astype(np.float64)
    lab_flat = lab.reshape(-1, 3).astype(np.float64)

    for _ in range(max(1, iterations)):
        distances.fill(np.inf)
        for idx in range(n):
            cy, cx = float(centers_arr[idx, 0]), float(centers_arr[idx, 1])
            y0 = max(0, int(round(cy)) - search_radius)
            y1 = min(h, int(round(cy)) + search_radius + 1)
            x0 = max(0, int(round(cx)) - search_radius)
            x1 = min(w, int(round(cx)) + search_radius + 1)
            if y0 >= y1 or x0 >= x1:
                continue
            color_dist = np.sum((lab[y0:y1, x0:x1] - centers_arr[idx, 2:5]) ** 2, axis=2)
            yy = np.arange(y0, y1, dtype=np.float32)[:, None]
            xx = np.arange(x0, x1, dtype=np.float32)[None, :]
            spatial = ((yy - cy) ** 2 + (xx - cx) ** 2) / step_sq
            score = color_dist + spatial_weight * spatial
            win = distances[y0:y1, x0:x1]
            upd = score < win
            win[upd] = score[upd]
            labels[y0:y1, x0:x1][upd] = idx

        # --- vectorised centre update (bincount, O(H*W) not O(n*H*W)) ---
        flat = labels.ravel()
        valid = flat >= 0
        fl = flat[valid]
        cnt = np.bincount(fl, minlength=n).astype(np.float64)
        nz = cnt > 0
        cntc = np.maximum(cnt, 1.0)
        new_cy = np.bincount(fl, weights=yy_flat[valid], minlength=n) / cntc
        new_cx = np.bincount(fl, weights=xx_flat[valid], minlength=n) / cntc
        centers_arr[nz, 0] = new_cy[nz].astype(np.float32)
        centers_arr[nz, 1] = new_cx[nz].astype(np.float32)
        for c in range(3):
            mc = np.bincount(fl, weights=lab_flat[valid, c], minlength=n) / cntc
            centers_arr[nz, 2 + c] = mc[nz].astype(np.float32)

    # --- fill any pixels never claimed by a window (nearest assigned label) ---
    missing = labels < 0
    if np.any(missing):
        from scipy.ndimage import distance_transform_edt
        _, nearest = distance_transform_edt(missing, return_indices=True)
        labels[missing] = labels[nearest[0][missing], nearest[1][missing]]

    return labels


def _adjacency_pairs_fast(labels):
    """Return unique sorted adjacent-label pairs (Nx2 int32) from horizontal+vertical neighbors.

    Vectorized using np.unique on stacked min/max of neighboring label pairs.
    """
    labels = np.asarray(labels, dtype=np.int32)

    # Horizontal neighbors: (i, j) vs (i, j+1)
    left = labels[:, :-1].ravel()
    right = labels[:, 1:].ravel()
    h_mask = left != right
    h_pairs = np.stack([np.minimum(left[h_mask], right[h_mask]),
                        np.maximum(left[h_mask], right[h_mask])], axis=1)

    # Vertical neighbors: (i, j) vs (i+1, j)
    top = labels[:-1, :].ravel()
    bot = labels[1:, :].ravel()
    v_mask = top != bot
    v_pairs = np.stack([np.minimum(top[v_mask], bot[v_mask]),
                        np.maximum(top[v_mask], bot[v_mask])], axis=1)

    all_pairs = np.concatenate([h_pairs, v_pairs], axis=0)
    if all_pairs.shape[0] == 0:
        return np.empty((0, 2), dtype=np.int32)

    # Unique pairs
    # Use structured view for unique
    unique_pairs = np.unique(all_pairs, axis=0)
    return unique_pairs.astype(np.int32)


def _compute_pairwise_weights(image, labels, n,
                              color_weight=12.0, texture_weight=3.0,
                              spatial_weight=1.0, crf_weight=0.75):
    """Compute pairwise CRF weights between adjacent superpixels.

    Returns (pairs Nx2 int32, weights N float32).
    Returns empty arrays if no pairs.
    """
    h, w = labels.shape

    # Convert image to LAB for color features
    img_float = np.asarray(image, dtype=np.float32)
    if img_float.max() > 1.0:
        img_float = img_float / 255.0
    img_float = np.clip(img_float, 0.0, 1.0)

    lab = rgb2lab(img_float).astype(np.float32)
    grad = compute_gradient(image)  # H x W float32

    # Compute per-region features using np.bincount
    pixel_count = np.bincount(labels.ravel(), minlength=n).astype(np.float64)
    pixel_count = np.maximum(pixel_count, 1)  # avoid division by zero

    # Mean LAB per region
    lab_means = np.zeros((n, 3), dtype=np.float64)
    for c in range(3):
        lab_means[:, c] = np.bincount(labels.ravel(), weights=lab[:, :, c].ravel(), minlength=n) / pixel_count

    # Mean texture per region
    texture_means = np.bincount(labels.ravel(), weights=grad.ravel(), minlength=n) / pixel_count

    # Normalized centroid (cy/(h-1), cx/(w-1))
    yy, xx = np.mgrid[0:h, 0:w]
    cy_norm = yy / max(h - 1, 1)
    cx_norm = xx / max(w - 1, 1)
    centroid_y = np.bincount(labels.ravel(), weights=cy_norm.ravel(), minlength=n) / pixel_count
    centroid_x = np.bincount(labels.ravel(), weights=cx_norm.ravel(), minlength=n) / pixel_count

    # Adjacent pairs
    pairs = _adjacency_pairs_fast(labels)
    if pairs.shape[0] == 0:
        return np.empty((0, 2), dtype=np.int32), np.empty(0, dtype=np.float32)

    i_idx = pairs[:, 0]
    j_idx = pairs[:, 1]

    # Color distance (L2 in LAB)
    color_diff = lab_means[i_idx] - lab_means[j_idx]
    color_dist = np.sqrt((color_diff ** 2).sum(axis=1))

    # Texture distance
    texture_dist = np.abs(texture_means[i_idx] - texture_means[j_idx])

    # Spatial distance
    dy = centroid_y[i_idx] - centroid_y[j_idx]
    dx = centroid_x[i_idx] - centroid_x[j_idx]
    spatial_dist = np.sqrt(dy ** 2 + dx ** 2)

    similarity = np.exp(
        -color_weight * color_dist
        - texture_weight * texture_dist
        - spatial_weight * spatial_dist
    )
    weights = (crf_weight * similarity).astype(np.float32)

    return pairs.astype(np.int32), weights


_CRF_BLEND = {"light": 0.7, "medium": 0.5, "full": 0.2}  # fraction of unary kept


def run_dcnf_crf(image, dense_depth, segments=700, compactness=10.0, crf_strength="full"):
    """Run DCNF-CRF superpixel depth refinement.

    Args:
        image: RGB uint8 HxWx3
        dense_depth: HxW float32 [0,1]
        segments: target number of superpixels
        compactness: SLIC compactness

    Returns dict with keys:
        crf_depth, unary_depth (HxW float32 normalized),
        labels (HxW int32), n_superpixels (int),
        params (dict)
    """
    # 1. Ensure RGB uint8
    image = np.asarray(image, dtype=np.uint8)
    if image.ndim == 2:
        image = np.stack([image, image, image], axis=2)
    elif image.shape[2] > 3:
        image = image[:, :, :3]

    dense_depth = np.asarray(dense_depth, dtype=np.float32)
    dense_depth = np.clip(dense_depth, 0.0, 1.0)

    # 2. Content-adaptive SLIC superpixels (gradient-seeded centres + adaptive
    # spatial weight) — follows object contours instead of skimage's near-regular
    # grid at this resolution/compactness.
    try:
        labels_raw = _slic_adaptive(image, target_segments=segments,
                                    compactness=compactness, iterations=8)
    except Exception:
        h, w = image.shape[:2]
        labels_raw = np.zeros((h, w), dtype=np.int32)

    # Reindex labels to 0..n-1 contiguously
    unique_labels = np.unique(labels_raw)
    label_map = {old: new for new, old in enumerate(unique_labels)}
    labels = np.vectorize(label_map.__getitem__)(labels_raw).astype(np.int32)
    n = int(labels.max()) + 1

    # 3. Unary: median depth per superpixel
    z = np.zeros(n, dtype=np.float32)
    for i in range(n):
        mask = labels == i
        if mask.any():
            z[i] = float(np.median(dense_depth[mask]))

    # 4. Pairwise weights → build dense R, solve linear system
    pairs, weights = _compute_pairwise_weights(image, labels, n)

    R = np.zeros((n, n), dtype=np.float64)
    if pairs.shape[0] > 0:
        i_idx = pairs[:, 0]
        j_idx = pairs[:, 1]
        w_double = weights.astype(np.float64)
        np.add.at(R, (i_idx, j_idx), w_double)
        np.add.at(R, (j_idx, i_idx), w_double)  # symmetric

    D = np.diag(R.sum(axis=1))
    I_mat = np.eye(n, dtype=np.float64)
    A = I_mat + D - R

    try:
        y = np.linalg.solve(A, z.astype(np.float64))
    except np.linalg.LinAlgError:
        y = z.astype(np.float64)

    y = np.clip(y, 0.0, 1.0).astype(np.float32)

    # 5. Build output maps. Blend the CRF result back toward the dense unary so a
    # high-quality unary (Depth Anything V2) keeps its in-region detail instead of
    # being flattened to the per-superpixel median. "light" keeps 70% unary.
    blend = _CRF_BLEND.get(crf_strength, 0.2)
    crf_depth_raw = y[labels]
    unary_depth_raw = z[labels]
    blended = blend * dense_depth + (1.0 - blend) * crf_depth_raw

    crf_depth = normalize_depth(blended)
    unary_depth = normalize_depth(unary_depth_raw)

    n_pairs = int(pairs.shape[0])

    params = {
        "segments": segments,
        "compactness": compactness,
        "n_pairs": n_pairs,
        "crf_formula": "y* = (I + D - R)⁻¹ z",
        "crf_strength": crf_strength,
        "blend_unary": blend,
    }

    return {
        "crf_depth": crf_depth,
        "unary_depth": unary_depth,
        "labels": labels,
        "n_superpixels": n,
        "params": params,
    }
