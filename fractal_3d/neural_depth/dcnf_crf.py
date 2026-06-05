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


def _region_histograms(flat_labels, codes, n, n_bins):
    """Per-region normalised histogram (n, n_bins), vectorised via np.add.at."""
    desc = np.zeros((n, n_bins), dtype=np.float64)
    np.add.at(desc, (flat_labels, np.clip(codes, 0, n_bins - 1)), 1.0)
    desc /= np.maximum(desc.sum(axis=1, keepdims=True), 1.0)
    return desc


def _compute_lbp_descriptors(image, labels, n, n_points=8, radius=1):
    """Per-superpixel uniform-LBP texture histogram (n, n_points+2).

    Falls back to a single-column mean-gradient descriptor if LBP is unavailable.
    """
    if image.ndim == 3:
        gray = np.mean(image.astype(np.float32), axis=2) / 255.0
    else:
        gray = image.astype(np.float32) / (255.0 if image.max() > 1 else 1.0)
    flat = labels.ravel()
    try:
        from skimage.feature import local_binary_pattern
        lbp = local_binary_pattern(gray, n_points, radius, method="uniform")
        n_bins = n_points + 2
        return _region_histograms(flat, lbp.ravel().astype(np.int64), n, n_bins)
    except Exception:
        # Fallback: per-region mean gradient (old texture behaviour) as 1 column.
        grad = compute_gradient(image).ravel()
        counts = np.maximum(np.bincount(flat, minlength=n).astype(np.float64), 1.0)
        return (np.bincount(flat, weights=grad, minlength=n) / counts)[:, None]


def _compute_color_histogram_descriptors(image, labels, n, bins=8):
    """Per-superpixel LAB colour histogram (n, bins*3), vectorised."""
    img_float = np.asarray(image, dtype=np.float32)
    if img_float.max() > 1.0:
        img_float = img_float / 255.0
    lab = rgb2lab(np.clip(img_float, 0.0, 1.0))
    lab_norm = np.empty_like(lab)
    lab_norm[:, :, 0] = lab[:, :, 0] / 100.0
    lab_norm[:, :, 1] = (lab[:, :, 1] + 128.0) / 255.0
    lab_norm[:, :, 2] = (lab[:, :, 2] + 128.0) / 255.0
    flat = labels.ravel()
    parts = []
    for c in range(3):
        codes = (np.clip(lab_norm[:, :, c].ravel(), 0, 1) * bins).astype(np.int64)
        parts.append(_region_histograms(flat, codes, n, bins))
    return np.concatenate(parts, axis=1)


def _box_count_bw(bw, box_size):
    """Count occupied boxes of side ``box_size`` in a binary image (vectorised)."""
    h, w = bw.shape
    nh = -(-h // box_size)
    nw = -(-w // box_size)
    pad = np.zeros((nh * box_size, nw * box_size), dtype=bool)
    pad[:h, :w] = bw
    return int(pad.reshape(nh, box_size, nw, box_size).any(axis=(1, 3)).sum())


def _local_fractal_dimension(gray, labels, n, box_sizes=(2, 4, 8)):
    """Per-superpixel box-counting fractal dimension (Ilhom's fractal prior).

    Edge-enhanced (Canny | region mask) box-counting slope. Uses find_objects to
    get per-label bounding boxes in one pass (avoids O(n·HW) masking).
    """
    from scipy.ndimage import find_objects
    try:
        from skimage.feature import canny
    except Exception:
        canny = None

    if gray.max() > 1.0:
        gray = gray / 255.0
    fd = np.ones(n, dtype=np.float64)
    logx = np.log(1.0 / np.array(box_sizes, dtype=float))
    slices = find_objects(labels + 1)  # labels 0..n-1 → 1..n; slices[p] ↔ label p
    for p in range(n):
        sl = slices[p] if p < len(slices) else None
        if sl is None:
            continue
        sub_mask = labels[sl] == p
        sub_gray = gray[sl]
        if sub_gray.size < 4:
            continue
        if canny is not None:
            try:
                edges = canny(sub_gray, sigma=1.0)
            except Exception:
                edges = np.zeros_like(sub_mask)
        else:
            edges = np.zeros_like(sub_mask)
        bw = edges | sub_mask
        counts = np.array([_box_count_bw(bw, s) for s in box_sizes], dtype=float)
        valid = counts > 0
        if valid.sum() < 2:
            continue
        slope = np.polyfit(logx[valid], np.log(counts[valid]), 1)[0]
        if np.isfinite(slope):
            fd[p] = slope
    return fd


def _norm_vec(v):
    vmin, vmax = float(v.min()), float(v.max())
    if abs(vmax - vmin) < 1e-12:
        return np.zeros_like(v, dtype=np.float64)
    return (v - vmin) / (vmax - vmin)


def _fractal_prior(gray, labels, n, texture_desc, gradient_desc):
    """Fractal depth prior h_p = 0.5·fractalDim + 0.25·texture + 0.25·gradient.

    Returns (h normalised to [0,1], fractal_dim normalised to [0,1]).
    """
    fd = _norm_vec(_local_fractal_dimension(gray, labels, n))
    h = 0.5 * fd + 0.25 * _norm_vec(texture_desc) + 0.25 * _norm_vec(gradient_desc)
    return _norm_vec(h), fd


def _compute_pairwise_weights(image, labels, n,
                              beta_color=12.0, beta_color_hist=6.0,
                              beta_lbp=8.0, beta_fractal=10.0, beta_spatial=1.0,
                              crf_weight=0.75,
                              active=("color", "histogram", "lbp", "spatial"),
                              fractal_dim=None):
    """Pairwise CRF weights from the 3 Liu et al. similarities + spatial.

    R_pq = crf_weight · exp(−Σ_k β_k·d_k). ``active`` selects which similarities
    contribute (used by the ablation study); only active descriptors are computed.
    Returns (pairs Nx2 int32, weights N float32); empty arrays if no adjacency.
    """
    h, w = labels.shape
    flat = labels.ravel()
    counts = np.maximum(np.bincount(flat, minlength=n).astype(np.float64), 1.0)

    pairs = _adjacency_pairs_fast(labels)
    if pairs.shape[0] == 0:
        return np.empty((0, 2), dtype=np.int32), np.empty(0, dtype=np.float32)
    i_idx, j_idx = pairs[:, 0], pairs[:, 1]

    exponent = np.zeros(pairs.shape[0], dtype=np.float64)

    if "color" in active:
        img_float = np.asarray(image, dtype=np.float32)
        if img_float.max() > 1.0:
            img_float = img_float / 255.0
        lab = rgb2lab(np.clip(img_float, 0.0, 1.0)).astype(np.float64)
        mean_lab = np.zeros((n, 3), dtype=np.float64)
        for c in range(3):
            mean_lab[:, c] = np.bincount(flat, weights=lab[:, :, c].ravel(), minlength=n) / counts
        mean_lab[:, 0] /= 100.0
        mean_lab[:, 1:] = (mean_lab[:, 1:] + 128.0) / 255.0
        exponent -= beta_color * np.sqrt(((mean_lab[i_idx] - mean_lab[j_idx]) ** 2).sum(axis=1))

    if "histogram" in active:
        color_hist = _compute_color_histogram_descriptors(image, labels, n)
        exponent -= beta_color_hist * np.abs(color_hist[i_idx] - color_hist[j_idx]).sum(axis=1)

    if "lbp" in active:
        lbp_desc = _compute_lbp_descriptors(image, labels, n)
        exponent -= beta_lbp * np.abs(lbp_desc[i_idx] - lbp_desc[j_idx]).sum(axis=1)

    if "fractal" in active and fractal_dim is not None:
        # Group superpixels of similar local fractal dimension (Ilhom).
        exponent -= beta_fractal * np.abs(fractal_dim[i_idx] - fractal_dim[j_idx])

    if "spatial" in active:
        yy, xx = np.mgrid[0:h, 0:w]
        cy = np.bincount(flat, weights=yy.ravel().astype(np.float64), minlength=n) / counts / max(h - 1, 1)
        cx = np.bincount(flat, weights=xx.ravel().astype(np.float64), minlength=n) / counts / max(w - 1, 1)
        centroids = np.stack([cy, cx], axis=1)
        exponent -= beta_spatial * np.linalg.norm(centroids[i_idx] - centroids[j_idx], axis=1)

    weights = (crf_weight * np.exp(exponent)).astype(np.float32)
    return pairs.astype(np.int32), weights


_CRF_BLEND = {"light": 0.7, "medium": 0.5, "full": 0.32}  # fraction of unary kept
# Guided-filter radius per strength — stronger CRF needs more de-blocking.
_CRF_GUIDE_RADIUS = {"light": 3, "medium": 4, "full": 6}


def _adaptive_full_blend(dense_depth, base_blend=0.32):
    """Pick the full-CRF unary fraction from the unary's detail level.

    A detail-rich unary keeps more of itself (higher blend) so fine structure
    isn't smoothed away; a flat unary can take stronger CRF (lower blend).
    Clamped to [0.20, 0.45].
    """
    gx = np.abs(np.diff(dense_depth, axis=1))
    gy = np.abs(np.diff(dense_depth, axis=0))
    detail = (float(gx.mean()) + float(gy.mean())) / 2.0
    if detail > 0.04:
        return min(0.45, base_blend + 0.13)
    if detail < 0.015:
        return max(0.20, base_blend - 0.12)
    return base_blend


def _guided_smooth(depth, guide_gray, radius=4, eps=0.01):
    """Edge-preserving smoothing (He et al. guided filter).

    Removes the piecewise-constant SLIC superpixel steps inside image-homogeneous
    regions while keeping transitions that coincide with real image edges (the
    guide). Box filters via scipy uniform_filter. depth/guide same HxW, in [0,1].
    """
    from scipy.ndimage import uniform_filter

    g = np.asarray(guide_gray, dtype=np.float32)
    d = np.asarray(depth, dtype=np.float32)
    win = int(radius) * 2 + 1
    mean_g = uniform_filter(g, win)
    mean_d = uniform_filter(d, win)
    corr_gd = uniform_filter(g * d, win)
    var_g = uniform_filter(g * g, win) - mean_g ** 2
    a = (corr_gd - mean_g * mean_d) / (var_g + eps)
    b = mean_d - a * mean_g
    return uniform_filter(a, win) * g + uniform_filter(b, win)


def run_dcnf_crf(image, dense_depth, segments=700, compactness=10.0, crf_strength="full",
                 active_similarities=None, fractal_aware=False, eta=0.8):
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

    # 4. Pairwise weights → build dense R, solve linear system.
    # Fractal-aware mode (Ilhom's extension): add a fractal depth prior h and a
    # 4th "fractal" similarity →  A = (1+η)I + D − R,  b = z + η·h,  y* = A⁻¹b.
    gray_f = image.astype(np.float32).mean(axis=2) / 255.0
    h_prior, fractal_dim = None, None
    if fractal_aware:
        try:
            flat = labels.ravel()
            cnt = np.maximum(np.bincount(flat, minlength=n).astype(np.float64), 1.0)
            grad = compute_gradient(image).ravel()
            gradient_desc = np.bincount(flat, weights=grad, minlength=n) / cnt
            gf = gray_f.ravel()
            mg = np.bincount(flat, weights=gf, minlength=n) / cnt
            mg2 = np.bincount(flat, weights=gf ** 2, minlength=n) / cnt
            texture_desc = np.sqrt(np.maximum(mg2 - mg ** 2, 0.0))
            h_prior, fractal_dim = _fractal_prior(gray_f, labels, n, texture_desc, gradient_desc)
            active_similarities = ("color", "histogram", "lbp", "fractal", "spatial")
        except Exception:
            h_prior, fractal_dim = None, None  # fall back to base CRF

    if active_similarities is None:
        active_similarities = ("color", "histogram", "lbp", "spatial")
    pairs, weights = _compute_pairwise_weights(image, labels, n,
                                               active=active_similarities,
                                               fractal_dim=fractal_dim)

    R = np.zeros((n, n), dtype=np.float64)
    if pairs.shape[0] > 0:
        i_idx = pairs[:, 0]
        j_idx = pairs[:, 1]
        w_double = weights.astype(np.float64)
        np.add.at(R, (i_idx, j_idx), w_double)
        np.add.at(R, (j_idx, i_idx), w_double)  # symmetric

    D = np.diag(R.sum(axis=1))
    if fractal_aware and h_prior is not None:
        A = (1.0 + eta) * np.eye(n, dtype=np.float64) + D - R
        b = z.astype(np.float64) + eta * h_prior
    else:
        A = np.eye(n, dtype=np.float64) + D - R
        b = z.astype(np.float64)

    try:
        y = np.linalg.solve(A, b)
    except np.linalg.LinAlgError:
        y = z.astype(np.float64)

    y = np.clip(y, 0.0, 1.0).astype(np.float32)

    # 5. Build output maps. Blend the CRF result back toward the dense unary so a
    # high-quality unary (Depth Anything V2) keeps its in-region detail instead of
    # being flattened to the per-superpixel median. "light" keeps 70% unary.
    # "full" picks an adaptive unary fraction from the unary's detail level so
    # fine detail survives (was a flat 0.2 → "Полезные детали" went negative).
    blend = (_adaptive_full_blend(dense_depth) if crf_strength == "full"
             else _CRF_BLEND.get(crf_strength, 0.2))
    crf_depth_raw = y[labels]
    unary_depth_raw = z[labels]

    # De-block the piecewise-constant superpixel map with a guided filter (guide =
    # image luminance) so SLIC region boundaries don't show as depth steps, then
    # blend with the dense unary.
    gray_guide = image.astype(np.float32).mean(axis=2) / 255.0
    radius = _CRF_GUIDE_RADIUS.get(crf_strength, 4)
    crf_smoothed = _guided_smooth(crf_depth_raw, gray_guide, radius=radius)
    blended = blend * dense_depth + (1.0 - blend) * crf_smoothed

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
