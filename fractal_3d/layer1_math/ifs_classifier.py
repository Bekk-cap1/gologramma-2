"""Geometric classifier of IFS sub-types.

Distinguishes sierpinski_triangle / sierpinski_carpet / koch_snowflake /
barnsley_fern / dragon_curve / cantor_set using box-counting dimension,
rotational symmetry, fill ratio, aspect ratio and hole ratio.

Pure function (np.ndarray [+ optional D] -> dict). skimage/scipy/numpy only.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_fill_holes
from scipy.ndimage import rotate as ndimage_rotate
from skimage.filters import threshold_otsu
from skimage.measure import label, regionprops
from skimage.metrics import structural_similarity
from skimage.transform import resize


def classify_ifs_subtype(image: np.ndarray, box_counting_D: float = None) -> dict:
    """Classify an IFS fractal by geometric features.

    Key distinctions:
    - sierpinski_triangle: D~1.585, 3-fold symmetry, triangular holes
    - sierpinski_carpet:   D~1.893, 4-fold symmetry, square holes
    - koch_snowflake:      D~1.262, 6-fold symmetry, curve-like boundary
    - barnsley_fern:       D~1.7, elongated, single axis
    - dragon_curve:        D~2.0, space-filling curve
    """
    img = resize(image, (256, 256), anti_aliasing=True)
    mx = float(img.max())
    if mx > 0:
        img = img / mx

    scores: dict[str, float] = {}
    evidence: list[str] = []

    def add(key: str, val: float) -> None:
        scores[key] = scores.get(key, 0.0) + val

    # --- Dimension as the first filter ---
    D = box_counting_D
    if D is not None:
        if 1.2 < D < 1.35:
            add("koch_snowflake", 3)
            evidence.append(f"D={D:.3f} matches Koch (1.262)")
        elif 1.5 < D < 1.65:
            add("sierpinski_triangle", 3)
            evidence.append(f"D={D:.3f} matches Sierpinski triangle (1.585)")
        elif 1.8 < D < 1.95:
            add("sierpinski_carpet", 3)
            evidence.append(f"D={D:.3f} matches Sierpinski carpet (1.893)")
        elif 1.6 < D < 1.8:
            add("barnsley_fern", 2)
            evidence.append(f"D={D:.3f} matches Barnsley fern (~1.7)")
        elif D > 1.9:
            add("dragon_curve", 2)
            evidence.append(f"D={D:.3f} matches Dragon curve (~2.0)")

    # --- Symmetry ---
    symmetry_scores = {}
    for angle in (60, 90, 120, 180):
        rotated = ndimage_rotate(img, angle, reshape=False, mode="constant", cval=0)
        symmetry_scores[angle] = float(structural_similarity(img, rotated, data_range=1.0))

    if symmetry_scores[120] > 0.5:
        add("sierpinski_triangle", 2)
        add("koch_snowflake", 2)
        evidence.append(f"3-fold symmetry: {symmetry_scores[120]:.2f}")
    if symmetry_scores[90] > 0.5:
        add("sierpinski_carpet", 2)
        evidence.append(f"4-fold symmetry: {symmetry_scores[90]:.2f}")
    if symmetry_scores[60] > 0.5:
        add("koch_snowflake", 2)
        evidence.append(f"6-fold symmetry: {symmetry_scores[60]:.2f}")

    # --- Fill ratio: curve vs filled-with-holes ---
    try:
        thresh = threshold_otsu(img)
    except ValueError:
        thresh = 0.5
    binary = (img > thresh).astype(np.uint8)
    fill_ratio = float(np.mean(binary))

    if fill_ratio < 0.15:
        add("koch_snowflake", 2)
        add("cantor_set", 2)
        evidence.append(f"sparse: fill={fill_ratio:.2f}")
    elif 0.15 < fill_ratio < 0.45:
        add("sierpinski_triangle", 1)
        evidence.append(f"moderate_fill: {fill_ratio:.2f}")
    elif fill_ratio > 0.6:
        add("sierpinski_carpet", 1)
        add("dragon_curve", 1)
        evidence.append(f"dense_fill: {fill_ratio:.2f}")

    # --- Aspect ratio (fern is elongated) ---
    labeled = label(binary)
    regions = regionprops(labeled)
    if regions:
        largest = max(regions, key=lambda r: r.area)
        aspect = largest.axis_major_length / max(largest.axis_minor_length, 1)
        if aspect > 2.5:
            add("barnsley_fern", 3)
            evidence.append(f"elongated: aspect={aspect:.2f}")

    # --- Holes (Sierpinski) ---
    filled = binary_fill_holes(binary)
    holes = filled.astype(int) - binary.astype(int)
    hole_ratio = float(np.sum(holes) / max(np.sum(filled), 1))
    if hole_ratio > 0.2:
        add("sierpinski_triangle", 2)
        add("sierpinski_carpet", 2)
        evidence.append(f"holes: ratio={hole_ratio:.2f}")

    # --- Decision ---
    if not scores:
        return {"subtype": "unknown", "confidence": 0.0, "evidence": evidence}

    best = max(scores, key=scores.get)
    total = sum(scores.values())
    confidence = min(scores[best] / (total + 1), 0.95)

    return {
        "subtype": best,
        "confidence": float(confidence),
        "all_scores": {k: float(v) for k, v in sorted(scores.items(), key=lambda x: -x[1])},
        "evidence": evidence,
    }
