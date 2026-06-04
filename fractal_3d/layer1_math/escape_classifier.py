"""Geometric tie-breakers for escape-time fractals (no CNN).

`classify_escape_subtype` distinguishes Mandelbrot from Julia purely on
geometric features; `classify_ifs_vs_escape` separates IFS fractals from
escape-time ones on tone/histogram statistics. Both are pure functions
(np.ndarray -> dict) used by the voter when the CNN is unsure or disagrees
with the mathematics.

Only skimage/scipy/numpy are used (no cv2).
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_fill_holes
from scipy.ndimage import rotate as ndimage_rotate
from skimage.filters import threshold_otsu
from skimage.measure import label, regionprops
from skimage.transform import resize


def _prep(image: np.ndarray) -> np.ndarray:
    img = resize(image, (256, 256), anti_aliasing=True)
    mx = float(img.max())
    if mx > 0:
        img = img / mx
    return img.astype(np.float32)


def _sym(a: np.ndarray, b: np.ndarray) -> float:
    """Normalised-L1 symmetry similarity in ~[0, 1] (1 = identical).

    Robust to the large flat background that inflates SSIM on escape-time and
    sparse IFS images: a constant background contributes 0 to both numerator
    and denominator.
    """
    denom = float(np.sum(a) + np.sum(b)) + 1e-9
    return 1.0 - float(np.sum(np.abs(a - b))) / denom


def classify_escape_subtype(image: np.ndarray) -> dict:
    """Tell Mandelbrot from Julia from geometric features.

    Returns ``{"subtype", "confidence", "evidence", "features"}``.
    """
    img = _prep(image)

    evidence: list[str] = []
    mandelbrot_score = 0.0
    julia_score = 0.0

    # --- Feature 1: cardioid main body ---
    try:
        thresh = threshold_otsu(img)
    except ValueError:
        thresh = 0.5
    binary = (img > thresh).astype(np.uint8)
    binary_inv = 1 - binary

    for polarity, mask in (("direct", binary), ("inverted", binary_inv)):
        filled = binary_fill_holes(mask)
        labeled = label(filled)
        regions = regionprops(labeled)
        if not regions:
            continue
        largest = max(regions, key=lambda r: r.area)
        ecc = largest.eccentricity
        sol = largest.solidity
        ext = largest.extent
        if 0.4 < ecc < 0.85 and 0.55 < sol < 0.90 and ext > 0.4:
            mandelbrot_score += 2
            evidence.append(f"cardioid_shape: ecc={ecc:.2f}, sol={sol:.2f} ({polarity})")
            break

    # --- Feature 2: mirror symmetry (whole-image, normalised-L1) ---
    # Mandelbrot is mirror-symmetric about exactly ONE axis (its real axis):
    # cardioid on one side, antenna on the other => large asymmetry between the
    # two mirror axes, and NO point (180-degree) symmetry.
    lr_symmetry = _sym(img, np.fliplr(img))
    tb_symmetry = _sym(img, np.flipud(img))
    mirror_asym = abs(lr_symmetry - tb_symmetry)

    # --- Feature 2b: rotational symmetry (normalised-L1) ---
    # Every Julia set is point-symmetric (z -> -z) => high 180-degree symmetry.
    # Many Julia sets also have higher n-fold symmetry; Mandelbrot has neither.
    r180 = _sym(img, ndimage_rotate(img, 180, reshape=False, mode="constant", cval=0))
    best_rot_sim = 0.0
    best_rot_angle = 0
    for angle in (60, 72, 90, 120):
        rotated = ndimage_rotate(img, angle, reshape=False, mode="constant", cval=0)
        rot_sim = _sym(img, rotated)
        if rot_sim > best_rot_sim:
            best_rot_sim = rot_sim
            best_rot_angle = angle

    if r180 > 0.6 and mirror_asym < 0.25:
        julia_score += 3
        evidence.append(f"point_symmetry(julia): r180={r180:.2f}")
    if best_rot_sim > 0.6:
        julia_score += 2
        evidence.append(f"n_fold_symmetry(julia): angle={best_rot_angle}, sim={best_rot_sim:.2f}")

    if mirror_asym > 0.4 and r180 < 0.5:
        mandelbrot_score += 4
        evidence.append(f"one_axis_mirror(mandelbrot): asym={mirror_asym:.2f}, r180={r180:.2f}")

    # --- Feature 3: number of large connected components ---
    labeled_full = label(binary)
    regions_full = regionprops(labeled_full)
    large_components = [r for r in regions_full if r.area > 100]
    n_components = len(large_components)

    if n_components == 1:
        mandelbrot_score += 1
        evidence.append(f"single_component: {n_components}")
    elif n_components > 5:
        julia_score += 1
        evidence.append(f"many_components: {n_components} (dust-like)")

    # --- Feature 4: brightness variance proxy ---
    brightness_var = float(np.var(img))
    if brightness_var > 0.08:
        mandelbrot_score += 0.5
        evidence.append(f"high_variance: {brightness_var:.3f}")

    # --- Decision ---
    total = mandelbrot_score + julia_score
    if total == 0:
        return {
            "subtype": "uncertain",
            "confidence": 0.0,
            "evidence": evidence,
            "features": {"mandelbrot_score": 0.0, "julia_score": 0.0},
        }

    if mandelbrot_score > julia_score * 1.5:
        subtype = "mandelbrot"
        confidence = min(mandelbrot_score / (total + 2), 0.95)
    elif julia_score > mandelbrot_score * 1.5:
        subtype = "julia"
        confidence = min(julia_score / (total + 2), 0.95)
    else:
        subtype = "uncertain"
        confidence = 0.3

    return {
        "subtype": subtype,
        "confidence": float(confidence),
        "evidence": evidence,
        "features": {
            "mandelbrot_score": float(mandelbrot_score),
            "julia_score": float(julia_score),
            "lr_symmetry": float(lr_symmetry),
            "tb_symmetry": float(tb_symmetry),
            "mirror_asym": float(mirror_asym),
            "r180": float(r180),
            "n_components": int(n_components),
            "rotational_symmetry": float(best_rot_sim),
            "rot_angle": int(best_rot_angle),
        },
    }


def classify_ifs_vs_escape(image: np.ndarray) -> dict:
    """Separate an IFS fractal from an escape-time one by tone statistics.

    Complements the voter pre-screen — works on *geometry/tone*, not spectrum.
    Returns ``{"category", "confidence", "evidence"}``.
    """
    img = _prep(image)

    evidence: list[str] = []
    ifs_score = 0.0
    escape_score = 0.0

    # --- Feature 1: unique brightness levels (dominant signal) ---
    # IFS line/area drawings are near-binary (a handful of levels); escape-time
    # fields carry a smooth iteration gradient (many levels). This separates a
    # Koch curve (~2 levels) from a Julia/Mandelbrot field (~100 levels) even
    # though both sit on a large black background.
    n_levels = len(np.unique((img * 255).astype(np.uint8)))
    if n_levels <= 20:
        ifs_score += 3
        evidence.append(f"very_few_levels: {n_levels}")
    elif n_levels >= 50:
        # Down-weighted (was +3): a photorealistic render of an IFS fractal
        # (lighting/shadows) also has many brightness levels — this signal alone
        # must not dominate. The self-similarity check below is the counterweight.
        escape_score += 1.5
        evidence.append(f"gradient_many_levels: {n_levels}")

    # --- Feature 1b: self-similarity via autocorrelation (IFS signal) ---
    # IFS fractals repeat structure at multiple scales, producing strong
    # off-centre autocorrelation peaks even in photorealistic renders. Escape-time
    # fields do not self-tile this way.
    try:
        from scipy.signal import fftconvolve
        ic = img - float(img.mean())
        autocorr = fftconvolve(ic, ic[::-1, ::-1], mode="same")
        autocorr /= float(autocorr.max()) + 1e-10
        cy, cx = autocorr.shape[0] // 2, autocorr.shape[1] // 2
        ms = max(1, autocorr.shape[0] // 5)
        masked = autocorr.copy()
        masked[cy - ms:cy + ms, cx - ms:cx + ms] = 0.0
        n_peaks = int(np.sum(masked > 0.2))
        if n_peaks > 10:
            ifs_score += 1.5
            evidence.append(f"self_similar_peaks: {n_peaks} (autocorrelation)")
    except Exception:
        pass

    # --- Feature 2: fraction of pure black/white pixels ---
    # Only counts as an IFS signal when the image is also genuinely few-level;
    # an escape field has a black background too, but with a graded boundary.
    black_ratio = float(np.mean(img < 0.05))
    white_ratio = float(np.mean(img > 0.95))
    binary_ratio = black_ratio + white_ratio
    if binary_ratio > 0.7 and n_levels < 50:
        ifs_score += 1
        evidence.append(f"mostly_binary: {binary_ratio:.2f}")
    elif binary_ratio < 0.3:
        escape_score += 1
        evidence.append(f"continuous_tones: binary_ratio={binary_ratio:.2f}")

    # --- Feature 3: histogram entropy ---
    hist, _ = np.histogram(img.ravel(), bins=32, range=(0, 1))
    p = hist / max(hist.sum(), 1)
    hist_entropy = float(-np.sum((p + 1e-10) * np.log2(p + 1e-10)))
    if hist_entropy < 2.5:
        ifs_score += 1
        evidence.append(f"low_hist_entropy: {hist_entropy:.2f}")
    elif hist_entropy > 4.0:
        escape_score += 1
        evidence.append(f"high_hist_entropy: {hist_entropy:.2f}")

    # --- Decision ---
    total = ifs_score + escape_score
    if total == 0:
        return {"category": "uncertain", "confidence": 0.0, "evidence": evidence}

    if ifs_score > escape_score:
        return {
            "category": "ifs",
            "confidence": min(ifs_score / (total + 1), 0.9),
            "evidence": evidence,
        }
    return {
        "category": "escape_time",
        "confidence": min(escape_score / (total + 1), 0.9),
        "evidence": evidence,
    }
