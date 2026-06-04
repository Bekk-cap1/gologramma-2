"""Postprocessing utilities for depth maps (scipy/skimage only, no cv2)."""
import numpy as np
from scipy.ndimage import uniform_filter, gaussian_filter, laplace
from skimage.color import rgb2hsv


def normalize_depth(depth, clip_pct=(2.0, 98.0)):
    """Percentile-clip and normalize depth to float32 [0,1].

    Handles all-NaN and flat arrays by returning zeros.
    """
    depth = np.asarray(depth, dtype=np.float32)
    # Replace NaN with 0 temporarily for percentile computation
    finite_vals = depth[np.isfinite(depth)]
    if finite_vals.size == 0:
        return np.zeros_like(depth, dtype=np.float32)

    lo = np.percentile(finite_vals, clip_pct[0])
    hi = np.percentile(finite_vals, clip_pct[1])

    if hi <= lo:
        # Flat array — return zeros
        return np.zeros_like(depth, dtype=np.float32)

    clipped = np.clip(depth, lo, hi)
    result = (clipped - lo) / (hi - lo)
    return result.astype(np.float32)


def compute_gradient(image):
    """Return normalized Sobel gradient magnitude.

    Accepts 2D or 3D (H, W, C) input, uint8 or float.
    """
    arr = np.asarray(image, dtype=np.float32)
    # Normalize to [0, 1]
    if arr.max() > 1.0:
        arr = arr / 255.0

    # Convert to grayscale if 3D
    if arr.ndim == 3:
        # Simple luminance weights
        if arr.shape[2] >= 3:
            gray = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
        else:
            gray = arr[:, :, 0]
    else:
        gray = arr

    # Sobel via scipy
    from scipy.ndimage import sobel
    sx = sobel(gray, axis=0)
    sy = sobel(gray, axis=1)
    magnitude = np.sqrt(sx ** 2 + sy ** 2)

    max_val = magnitude.max()
    if max_val > 0:
        magnitude = magnitude / max_val
    return magnitude.astype(np.float32)


def pseudo_depth_from_image(image):
    """Estimate depth from image cues.

    Combines: dark-is-far, gradient, contrast, focus, saturation, vertical position.
    Returns normalize_depth result as float32 [0,1].
    """
    arr = np.asarray(image, dtype=np.float32)

    # Normalize to [0, 1]
    if arr.max() > 1.0:
        arr_norm = arr / 255.0
    else:
        arr_norm = arr.copy()

    is_gray = (arr_norm.ndim == 2)

    # --- Grayscale ---
    if is_gray:
        gray = arr_norm
    else:
        if arr_norm.shape[2] >= 3:
            gray = 0.299 * arr_norm[:, :, 0] + 0.587 * arr_norm[:, :, 1] + 0.114 * arr_norm[:, :, 2]
        else:
            gray = arr_norm[:, :, 0]

    h, w = gray.shape

    # 1. Dark-is-far cue (inverted gray)
    dark_cue = (1.0 - gray).astype(np.float32)

    # 2. Gradient cue
    gradient_cue = compute_gradient(gray)

    # 3. Contrast cue: local std via uniform_filter
    size = 9
    local_mean = uniform_filter(gray, size=size)
    local_sq = uniform_filter(gray ** 2, size=size)
    local_var = np.maximum(local_sq - local_mean ** 2, 0.0)
    contrast_cue = normalize_depth(np.sqrt(local_var).astype(np.float32))

    # 4. Focus cue: |laplacian|
    focus_raw = np.abs(laplace(gray)).astype(np.float32)
    focus_cue = normalize_depth(focus_raw)

    # 5. Saturation cue
    if is_gray or arr_norm.ndim == 2:
        saturation_cue = np.zeros((h, w), dtype=np.float32)
    else:
        rgb3 = arr_norm[:, :, :3].astype(np.float32)
        # Ensure valid range for rgb2hsv
        rgb3 = np.clip(rgb3, 0.0, 1.0)
        hsv = rgb2hsv(rgb3)
        saturation_cue = hsv[:, :, 1].astype(np.float32)

    # 6. Vertical position cue (top=0, bottom=1)
    row_positions = np.linspace(0.0, 1.0, h, dtype=np.float32)
    vertical_cue = np.broadcast_to(row_positions[:, np.newaxis], (h, w)).copy()

    # Weighted combination
    depth = (
        0.28 * dark_cue
        + 0.20 * gradient_cue
        + 0.18 * contrast_cue
        + 0.14 * focus_cue
        + 0.10 * saturation_cue
        + 0.10 * vertical_cue
    )

    return normalize_depth(depth.astype(np.float32))


def edge_aware_smooth(depth, image, sigma=2.0, iterations=2):
    """Blend Gaussian-smoothed depth toward edges.

    Smooths in flat regions, preserves depth at edges.
    Returns normalize_depth result as float32 [0,1].
    """
    depth = np.asarray(depth, dtype=np.float32)
    edges = compute_gradient(image)
    edge_weight = np.exp(-5.0 * edges).astype(np.float32)

    result = depth.copy()
    for _ in range(iterations):
        smoothed = gaussian_filter(result, sigma=sigma).astype(np.float32)
        ew = edge_weight
        result = result * (1.0 - 0.3 * ew) + smoothed * 0.3 * ew

    return normalize_depth(result)
