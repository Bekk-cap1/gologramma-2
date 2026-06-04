"""Layer 4.3 - Compare input image vs render of synthesized 3D object."""
from __future__ import annotations

import numpy as np

from ..common import to_gray
from ..layer1_math.box_counting import compute_box_counting


def _norm(a: np.ndarray) -> np.ndarray:
    a = a.astype(np.float32)
    m = float(a.max())
    if m > 0:
        a = a / m
    return a


def _dihedral(a: np.ndarray, k: int) -> np.ndarray:
    """The 8 dihedral orientations: 4 rotations x optional mirror."""
    b = np.rot90(a, k % 4)
    return np.fliplr(b) if k >= 4 else b


def _fg_bbox_norm(mask: np.ndarray, size: int = 128) -> np.ndarray | None:
    """Crop a binary mask to its foreground bounding box and rescale to size^2.

    Makes overlap scale/translation invariant: a thin centred curve (e.g. a Koch
    snowflake) that fills the frame in the IFS render but sits with margins in
    the input would otherwise score ~0 overlap purely from the scale mismatch.
    """
    from skimage.transform import resize
    ys, xs = np.where(mask > 0)
    if len(ys) < 5:
        return None
    sub = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32)
    return (resize(sub, (size, size), preserve_range=True) > 0.3).astype(np.float32)


def _fg_bbox_norm_gray(gray: np.ndarray, thresh: float, size: int = 128) -> np.ndarray | None:
    """Crop grayscale to its foreground bbox and rescale — scale-invariant SSIM."""
    from skimage.transform import resize
    ys, xs = np.where(gray > thresh)
    if len(ys) < 5:
        return None
    sub = gray[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return resize(sub, (size, size), preserve_range=True).astype(np.float32)


def align_images(original: np.ndarray, rendered: np.ndarray,
                 return_shift: bool = False):
    """Translate ``rendered`` onto ``original`` via phase correlation.

    Self-similar IFS renders (e.g. a Sierpinski carpet) often match the input in
    orientation but are shifted, which drives SSIM to ~0. Phase correlation
    recovers the integer translation that maximises cross-power and applies it.

    With ``return_shift`` the recovered ``(dy, dx)`` (in 128px-grid pixels) is
    returned alongside the shifted image.
    """
    from scipy.fft import fft2, ifft2
    from scipy.ndimage import shift as nd_shift

    f_orig = fft2(original)
    f_rend = fft2(rendered)
    prod = f_orig * np.conj(f_rend)
    cross_power = prod / (np.abs(prod) + 1e-10)
    correlation = np.abs(ifft2(cross_power))

    dy, dx = np.unravel_index(int(np.argmax(correlation)), correlation.shape)
    h, w = original.shape
    if dy > h // 2:
        dy -= h
    if dx > w // 2:
        dx -= w
    shifted = nd_shift(rendered, [dy, dx], mode="constant", cval=0.0).astype(np.float32)
    if return_shift:
        return shifted, (int(dy), int(dx))
    return shifted


def compare(input_image, render, is_escape_time: bool = False,
            threshold: float | None = None) -> dict:
    from skimage.metrics import structural_similarity
    from skimage.feature import canny
    from skimage.transform import resize

    orig = resize(to_gray(input_image), (128, 128), preserve_range=True,
                  anti_aliasing=True).astype(np.float32)
    rend = resize(to_gray(render), (128, 128), preserve_range=True,
                  anti_aliasing=True).astype(np.float32)
    orig = _norm(orig)
    rend = _norm(rend)

    from scipy.ndimage import binary_dilation
    from skimage.filters import threshold_otsu

    # ---- pose-invariant features of the original (computed once) ----
    try:
        eo = binary_dilation(canny(orig, sigma=2), iterations=3).astype(np.float32)
    except Exception:
        eo = None
    try:
        to = threshold_otsu(orig)
    except Exception:
        to = 0.5
    mask_o = (orig > to).astype(np.float32)
    mask_o_bbox = _fg_bbox_norm(mask_o)  # scale-invariant reference foreground
    orig_bbox_gray = _fg_bbox_norm_gray(orig, to)  # scale-invariant SSIM reference

    # A 3D reconstruction has no canonical orientation, so compare orientation-
    # invariantly: evaluate SSIM + dilated-edge-IoU + binary-overlap-IoU over all 8
    # dihedral poses of the render and keep the best-matching pose.
    def _metrics(rk: np.ndarray) -> tuple[float, float, float]:
        try:
            s = max(0.0, min(1.0, float(structural_similarity(orig, rk, data_range=1.0))))
        except Exception:
            s = 0.0
        # scale-invariant SSIM on foreground-bbox crops (keep the better) — a
        # centred curve render that fills the frame otherwise mismatches the
        # margined input on raw full-frame SSIM.
        if orig_bbox_gray is not None:
            try:
                tr_k = threshold_otsu(rk)
            except Exception:
                tr_k = 0.5
            rk_bbox = _fg_bbox_norm_gray(rk, tr_k)
            if rk_bbox is not None:
                try:
                    s_b = float(structural_similarity(orig_bbox_gray, rk_bbox, data_range=1.0))
                    s = max(s, max(0.0, min(1.0, s_b)))
                except Exception:
                    pass
        # dilated edge IoU (tolerant to small misalignment)
        try:
            er = binary_dilation(canny(rk, sigma=2), iterations=3).astype(np.float32)
            inter = float(np.sum(eo * er)) if eo is not None else 0.0
            union = float(np.sum(np.clip((eo if eo is not None else 0) + er, 0, 1)))
            e = inter / max(union, 1.0)
        except Exception:
            e = 0.0
        # binary spatial-overlap IoU (main structural signal for sparse IFS renders)
        try:
            tr = threshold_otsu(rk)
        except Exception:
            tr = 0.5
        mask_r = (rk > tr).astype(np.float32)
        inter_m = float(np.sum(mask_o * mask_r))
        union_m = float(np.sum(np.clip(mask_o + mask_r, 0, 1)))
        ov = inter_m / max(union_m, 1.0)
        # scale-invariant overlap: compare foreground-bbox-normalised masks and
        # keep the better of the two (can only raise the structural signal).
        if mask_o_bbox is not None:
            mask_r_bbox = _fg_bbox_norm(mask_r)
            if mask_r_bbox is not None:
                inter_b = float(np.sum(mask_o_bbox * mask_r_bbox))
                union_b = float(np.sum(np.clip(mask_o_bbox + mask_r_bbox, 0, 1)))
                ov = max(ov, inter_b / max(union_b, 1.0))
        return s, e, ov

    ssim, edge_iou, overlap_iou = 0.0, 0.0, 0.0
    best_combo = -1.0
    best_orientation = 0      # degrees (best of the 4 rotations)
    best_phase_shift = None   # (dy, dx) when the phase-aligned candidate won
    for k in range(8):
        rk = _dihedral(rend, k)
        # try the raw pose AND its phase-correlation alignment; keep the better.
        candidates = [(rk, None)]
        try:
            aligned, shift = align_images(orig, rk, return_shift=True)
            candidates.append((aligned, shift))
        except Exception:
            pass
        for cand, shift in candidates:
            s, e, ov = _metrics(cand)
            combo = 0.34 * s + 0.33 * e + 0.33 * ov
            if combo > best_combo:
                best_combo = combo
                ssim, edge_iou, overlap_iou = s, e, ov
                best_orientation = (k % 4) * 90
                best_phase_shift = list(shift) if shift is not None else None

    # fractal dimension similarity (pose-invariant)
    try:
        d_orig = float(compute_box_counting(orig)["dimension"])
    except Exception:
        d_orig = 0.0
    try:
        d_rend = float(compute_box_counting(rend)["dimension"])
    except Exception:
        d_rend = 0.0
    try:
        dim_similarity = 1.0 - min(abs(d_orig - d_rend) / max(d_orig, 0.1), 1.0)
    except Exception:
        dim_similarity = 0.0

    # hybrid weighted score — different formula/threshold per type
    if is_escape_time:
        similarity = 0.35 * ssim + 0.20 * edge_iou + 0.15 * overlap_iou + 0.30 * dim_similarity
        # Near-perfect fractal-dimension agreement is a strong correct-type signal;
        # give a small bonus (helps Mandelbrot clear the bar without inflating misses).
        if dim_similarity > 0.9:
            similarity = min(similarity + 0.05, 1.0)
        default_threshold = 0.60
    else:
        similarity = 0.20 * ssim + 0.15 * edge_iou + 0.30 * overlap_iou + 0.35 * dim_similarity
        default_threshold = 0.70

    used_threshold = default_threshold if threshold is None else threshold
    verified = bool(similarity >= used_threshold)

    return {
        "similarity": round(float(similarity), 4),
        "ssim": round(float(ssim), 4),
        "edge_iou": round(float(edge_iou), 4),
        "overlap_iou": round(float(overlap_iou), 4),
        "dim_similarity": round(float(dim_similarity), 4),
        "dim_input": round(float(d_orig), 4),
        "dim_render": round(float(d_rend), 4),
        "verified": verified,
        "retry_needed": bool(not verified),
        "threshold_used": round(float(used_threshold), 4),
        "is_escape_time": bool(is_escape_time),
        "phase_shift": best_phase_shift,
        "best_orientation": int(best_orientation),
    }
