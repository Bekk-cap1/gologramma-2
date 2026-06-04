"""Main depth estimation pipeline (DCNF-CRF + pseudo cues + optional Depth Anything V2)."""
import numpy as np

from .postprocess import pseudo_depth_from_image, edge_aware_smooth, normalize_depth
from .dcnf_crf import run_dcnf_crf


def _coerce_rgb_uint8(image, max_side=512):
    """Coerce to RGB uint8 and downscale so max side <= ``max_side``."""
    image = np.asarray(image)
    if image.ndim == 2:
        image = np.stack([image, image, image], axis=2)
    elif image.ndim == 3 and image.shape[2] == 1:
        image = np.concatenate([image, image, image], axis=2)
    elif image.ndim == 3 and image.shape[2] > 3:
        image = image[:, :, :3]
    if image.dtype != np.uint8:
        image = ((image * 255.0).clip(0, 255).astype(np.uint8) if image.max() <= 1.0
                 else image.clip(0, 255).astype(np.uint8))
    h, w = image.shape[:2]
    if max(h, w) > max_side:
        from skimage.transform import resize as sk_resize
        s = max_side / float(max(h, w))
        image = sk_resize(image, (max(1, int(round(h * s))), max(1, int(round(w * s)))),
                          order=1, preserve_range=True, anti_aliasing=True).astype(np.uint8)
    return image


def estimate_depth_compare(image, method="auto", segments=500, compactness=10.0):
    """Build depth two ways for a Liu et al.-style comparison.

    Single dense-depth pass (DA V2 or pseudo), then:
      - depth_unary : unary only (no pairwise CRF) — edge-aware smoothed dense map
      - depth_crf   : full DCNF-CRF (y* = A⁻¹z)
    Returns {depth_unary, depth_crf, depth_da, labels, method_used}.
    """
    image = _coerce_rgb_uint8(image)
    pixels = image.shape[0] * image.shape[1]

    method_used = "pseudo_cues"
    raw = None
    if method in ("depth_anything", "auto"):
        try:
            from .depth_anything import run_depth_anything
            raw = run_depth_anything(image)["depth"]
            method_used = "depth_anything_v2"
        except ImportError:
            raw = None
        except Exception as e:  # noqa: BLE001
            print(f"[DepthAnything] failed ({type(e).__name__}: {e}); using pseudo cues")
            raw = None
    if raw is None:
        raw = pseudo_depth_from_image(image)
        method_used = "pseudo_cues"
    raw = normalize_depth(raw)

    depth_unary = edge_aware_smooth(raw, image, iterations=1)

    actual_segments = int(np.clip(min(segments, pixels // 50), 20, segments))
    crf = run_dcnf_crf(image, raw, segments=actual_segments,
                       compactness=compactness, crf_strength="full")

    depth_unary = normalize_depth(depth_unary)
    depth_crf = crf["crf_depth"]
    return {
        "depth_unary": depth_unary,
        "depth_crf": depth_crf,
        "depth_da": raw,
        "labels": crf["labels"],
        "method_used": method_used,
        "image": image,
        "metrics": compute_depth_metrics(image, depth_unary, depth_crf, raw),
    }


def compute_depth_metrics(image, unary, crf, da):
    """Relative (no ground-truth) depth metrics between the three methods.

    Per-method: gradient_energy (detail), smoothness, edge_alignment (corr of
    depth gradient with image gradient), depth_range (p95-p5). Plus pairwise MAE
    differences. All computed at 256x256. Returns a JSON-friendly dict.
    """
    from skimage.transform import resize as sk_resize
    from .postprocess import compute_gradient

    size = 256

    def _r(a):
        return sk_resize(np.asarray(a, dtype=np.float32), (size, size),
                         preserve_range=True, anti_aliasing=True).astype(np.float32)

    u, c, d = _r(unary), _r(crf), _r(da)
    img = np.asarray(image)
    gray = np.mean(img, axis=2) if img.ndim == 3 else img
    gray = sk_resize(gray.astype(np.float32), (size, size), preserve_range=True,
                     anti_aliasing=True).astype(np.float32)
    img_edges = compute_gradient(gray).ravel()

    def gradient_energy(depth):
        gx = np.abs(np.diff(depth, axis=1))
        gy = np.abs(np.diff(depth, axis=0))
        return float((gx.mean() + gy.mean()) / 2.0)

    def smoothness(depth):
        return float(1.0 - gradient_energy(depth))

    def edge_alignment(depth):
        de = compute_gradient(depth).ravel()
        if img_edges.std() < 1e-6 or de.std() < 1e-6:
            return 0.0
        return float(np.clip(np.corrcoef(img_edges, de)[0, 1], 0.0, 1.0))

    def depth_range(depth):
        return float(np.percentile(depth, 95) - np.percentile(depth, 5))

    def mae(a, b):
        return float(np.mean(np.abs(a - b)))

    def triple(fn):
        return {"unary": fn(u), "crf": fn(c), "da_v2": fn(d)}

    return {
        "gradient_energy": triple(gradient_energy),
        "smoothness": triple(smoothness),
        "edge_alignment": triple(edge_alignment),
        "depth_range": triple(depth_range),
        "differences": {
            "crf_vs_unary": mae(c, u),
            "da_vs_crf": mae(d, c),
            "da_vs_unary": mae(d, u),
        },
    }


def _depth_quality(depth):
    """Estimate depth map quality as a confidence score in [0.1, 0.99].

    smoothness = 1 - 0.5 * (mean|dx| + mean|dy|)
    range_score = p95 - p5
    confidence = clip(0.5*max(smoothness,0) + 0.5*range_score, 0.1, 0.99)
    """
    depth = np.asarray(depth, dtype=np.float32)

    if depth.size == 0:
        return 0.1

    # Gradient smoothness
    dx = np.abs(np.diff(depth, axis=1))
    dy = np.abs(np.diff(depth, axis=0))
    mean_dx = float(dx.mean()) if dx.size > 0 else 0.0
    mean_dy = float(dy.mean()) if dy.size > 0 else 0.0
    smoothness = 1.0 - 0.5 * (mean_dx + mean_dy)

    # Range score
    flat = depth.ravel()
    p5 = float(np.percentile(flat, 5))
    p95 = float(np.percentile(flat, 95))
    range_score = p95 - p5

    confidence = 0.5 * max(smoothness, 0.0) + 0.5 * range_score
    return float(np.clip(confidence, 0.1, 0.99))


def estimate_depth(image, method="auto", segments=500, compactness=10.0, target_size=256,
                   crf_strength="auto"):
    """Estimate depth from an image using DCNF-CRF + optional Depth Anything V2.

    Args:
        image: H x W x 3 uint8 RGB or H x W uint8 grayscale numpy array
        method: "auto" | "depth_anything" | "pseudo"
        segments: target number of superpixels for CRF
        compactness: SLIC compactness
        target_size: output depth map side length (square)

    Returns dict with keys:
        depth_map (target_size x target_size float32 [0,1]),
        raw_depth (H x W float32),
        crf_depth (H x W float32),
        unary_depth (H x W float32),
        method_used (str),
        superpixels (H x W int32 labels),
        n_superpixels (int),
        confidence (float),
        params (dict)
    """
    image = np.asarray(image)

    # --- Coerce to RGB uint8 ---
    if image.ndim == 2:
        # Grayscale -> 3-channel
        image = np.stack([image, image, image], axis=2)
    elif image.ndim == 3 and image.shape[2] == 1:
        image = np.concatenate([image, image, image], axis=2)
    elif image.ndim == 3 and image.shape[2] > 3:
        image = image[:, :, :3]

    if image.dtype != np.uint8:
        if image.max() <= 1.0:
            image = (image * 255.0).clip(0, 255).astype(np.uint8)
        else:
            image = image.clip(0, 255).astype(np.uint8)

    # --- Downscale so max side <= 512 ---
    h, w = image.shape[:2]
    max_side = max(h, w)
    if max_side > 512:
        from skimage.transform import resize as sk_resize
        scale = 512.0 / max_side
        new_h = max(1, int(round(h * scale)))
        new_w = max(1, int(round(w * scale)))
        image = (sk_resize(image, (new_h, new_w), order=1, preserve_range=True,
                           anti_aliasing=True)).astype(np.uint8)

    h, w = image.shape[:2]
    pixels = h * w

    # --- Dense depth estimation ---
    method_used = "pseudo_cues"
    raw_depth = None

    if method in ("depth_anything", "auto"):
        try:
            from .depth_anything import run_depth_anything
            result = run_depth_anything(image)
            raw_depth = result["depth"]
            method_used = "depth_anything_v2"
        except ImportError:
            # torch / transformers not installed → silent fallback to pseudo cues.
            raw_depth = None
        except Exception as e:  # noqa: BLE001 — model present but failed; log + fallback
            print(f"[DepthAnything] failed ({type(e).__name__}: {e}); using pseudo cues")
            raw_depth = None

    if raw_depth is None:
        raw_depth = pseudo_depth_from_image(image)
        method_used = "pseudo_cues"

    if method == "pseudo":
        raw_depth = pseudo_depth_from_image(image)
        method_used = "pseudo_cues"

    raw_depth = normalize_depth(raw_depth)

    # --- CRF strength: a strong unary (DA V2) only wants light CRF (keeps detail);
    #     the weak pseudo-cue unary benefits from full CRF refinement. ---
    if crf_strength == "auto":
        crf_strength = "light" if method_used == "depth_anything_v2" else "full"

    actual_segments = int(np.clip(min(segments, pixels // 50), 20, segments))

    if crf_strength == "none":
        # No SLIC/CRF — keep the dense depth, only edge-aware smooth it.
        crf_depth_raw = raw_depth
        unary_depth = raw_depth
        labels = None
        n_superpixels = 0
        crf_params = {"crf_strength": "none", "blend_unary": 1.0}
        smoothed = edge_aware_smooth(raw_depth, image, iterations=1)
    else:
        crf_result = run_dcnf_crf(image, raw_depth, segments=actual_segments,
                                  compactness=compactness, crf_strength=crf_strength)
        crf_depth_raw = crf_result["crf_depth"]
        unary_depth = crf_result["unary_depth"]
        labels = crf_result["labels"]
        n_superpixels = crf_result["n_superpixels"]
        crf_params = crf_result["params"]
        smoothed = edge_aware_smooth(crf_depth_raw, image)

    # --- Resize to target_size x target_size ---
    from skimage.transform import resize as sk_resize
    depth_map = sk_resize(smoothed, (target_size, target_size), order=1,
                          preserve_range=True, anti_aliasing=True).astype(np.float32)
    depth_map = normalize_depth(depth_map)

    # --- Confidence ---
    confidence = _depth_quality(depth_map)

    params = {
        "segments_requested": segments,
        "segments_actual": actual_segments,
        "compactness": compactness,
        "target_size": target_size,
        "input_shape": (h, w),
        "crf_strength": crf_strength,
        **crf_params,
    }

    return {
        "depth_map": depth_map,
        "raw_depth": raw_depth,
        "crf_depth": crf_depth_raw,
        "unary_depth": unary_depth,
        "method_used": method_used,
        "superpixels": labels,
        "n_superpixels": n_superpixels,
        "confidence": confidence,
        "params": params,
    }
