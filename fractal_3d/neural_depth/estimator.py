"""Main depth estimation pipeline (DCNF-CRF + selectable unary sources)."""
import numpy as np

from .postprocess import (
    pseudo_depth_from_image,
    shape_from_shading_depth,
    edge_aware_smooth,
    normalize_depth,
)
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


def _canonical_unary_source(unary_source, method="auto"):
    """Resolve API aliases to the dense unary source used as z."""
    src = (unary_source or "auto").lower().replace("-", "_")
    meth = (method or "auto").lower().replace("-", "_")
    aliases = {
        "demo": "shape_from_shading",
        "sfs": "shape_from_shading",
        "shape": "shape_from_shading",
        "shape_from_shading": "shape_from_shading",
        "pseudo_cues": "pseudo",
        "pseudo": "pseudo",
        "da": "depth_anything",
        "da_v2": "depth_anything",
        "depth_anything_v2": "depth_anything",
        "depth_anything": "depth_anything",
        "best": "depth_anything",
    }
    if src in aliases:
        return aliases[src]
    if src != "auto":
        return "auto"
    if meth in aliases:
        return aliases[meth]
    return "auto"


def _dense_unary_from_image(image, method="auto", unary_source="auto"):
    """Return (dense_depth, method_used, source_used) for the CRF unary z."""
    source = _canonical_unary_source(unary_source, method=method)

    if source == "shape_from_shading":
        return normalize_depth(shape_from_shading_depth(image)), "shape_from_shading", source

    if source == "pseudo":
        return normalize_depth(pseudo_depth_from_image(image)), "pseudo_cues", source

    if source in ("depth_anything", "auto"):
        try:
            from .depth_anything import run_depth_anything
            depth = normalize_depth(run_depth_anything(image)["depth"])
            return depth, "depth_anything_v2", "depth_anything"
        except ImportError:
            pass
        except Exception as e:  # noqa: BLE001 - model present but failed; log + fallback
            print(f"[DepthAnything] failed ({type(e).__name__}: {e}); using pseudo cues")

    return normalize_depth(pseudo_depth_from_image(image)), "pseudo_cues", "pseudo"


def estimate_depth_compare(image, method="auto", segments=900, compactness=10.0,
                           unary_source="shape_from_shading",
                           fractal_aware=False, eta=0.8):
    """Comparison that reproduces Liu et al. Figure 4 (weak unary → strong CRF).

    Both Unary-only and Full-CRF use the SAME selected weak unary, so the only
    difference is the pairwise DCNF-CRF — isolating its effect. Depth Anything V2
    is shown separately as a neural *reference* (quality ceiling), not a competitor.

    Returns {depth_unary (raw unary), depth_crf (unary+CRF), depth_da (reference
    or None), da_available, labels, metrics, note}.
    """
    image = _coerce_rgb_uint8(image)
    pixels = image.shape[0] * image.shape[1]

    # --- Selected unary z (shape-from-shading by default for an explainable demo).
    unary_raw, unary_method, source_used = _dense_unary_from_image(
        image, method=method, unary_source=unary_source)

    # --- Full CRF = the SAME weak unary + full DCNF-CRF (shows the improvement).
    actual_segments = int(np.clip(min(segments, pixels // 50), 20, segments))
    crf = run_dcnf_crf(image, unary_raw, segments=actual_segments,
                       compactness=compactness, crf_strength="full",
                       fractal_aware=fractal_aware, eta=eta)
    depth_crf = crf["crf_depth"]

    # --- Make3D-style baseline (Saxena): piecewise-planar fit on the SAME
    #     unary + MRF co-planarity. Reuses the CRF SLIC labels.
    depth_make3d = None
    try:
        from .make3d_depth import make3d_style_depth
        labels = crf["labels"]
        depth_make3d = make3d_style_depth(image, unary_raw, labels,
                                          int(labels.max()) + 1)
    except Exception:
        depth_make3d = None

    # --- DA V2 = neural reference (quality ceiling), optional.
    depth_da = None
    da_available = False
    try:
        from .depth_anything import run_depth_anything
        depth_da = normalize_depth(run_depth_anything(image)["depth"])
        da_available = True
    except Exception as e:
        print(f"[DepthAnything] comparison reference unavailable "
              f"({type(e).__name__}: {e}); first run downloads ~100MB from HuggingFace")
        depth_da = None

    return {
        "depth_unary": unary_raw,
        "depth_crf": depth_crf,
        "depth_make3d": depth_make3d,
        "depth_da": depth_da,
        "da_available": da_available,
        "labels": crf["labels"],
        "method_used": f"{unary_method}+dcnf_crf",
        "unary_source": source_used,
        "fractal_aware": bool(crf.get("params", {}).get("fractal_aware", False)),
        "crf_params": crf.get("params", {}),
        "image": image,
        "metrics": compute_depth_metrics(image, unary_raw, depth_crf, depth_da,
                                         make3d=depth_make3d),
        "note": f"Unary={source_used}, Make3D=plane baseline, CRF=unary+DCNF, DA V2=reference",
    }


def compute_depth_metrics(image, unary, crf, da, make3d=None):
    """Relative (no ground-truth) depth metrics between the methods.

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

    u, c = _r(unary), _r(crf)
    d = _r(da) if da is not None else None
    mk = _r(make3d) if make3d is not None else None
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

    def useful_detail(depth):
        # Detail that coincides with image edges (real structure), not SLIC
        # block noise: product of depth-gradient and image-gradient magnitudes.
        return float((compute_gradient(depth) * compute_gradient(gray)).mean())

    # LBP texture-edge map (shared across methods); None if skimage LBP fails.
    try:
        from skimage.feature import local_binary_pattern
        _lbp = local_binary_pattern(gray, 8, 1, method="uniform").astype(np.float32)
        _lbp_edges = compute_gradient(_lbp / (float(_lbp.max()) + 1e-9)).ravel()
    except Exception:
        _lbp_edges = None

    def texture_coherence(depth):
        # How well depth boundaries respect texture (LBP) boundaries.
        if _lbp_edges is None:
            return 0.0
        de = compute_gradient(depth).ravel()
        if de.std() < 1e-6 or _lbp_edges.std() < 1e-6:
            return 0.0
        return float(np.clip(np.corrcoef(de, _lbp_edges)[0, 1], 0.0, 1.0))

    def mae(a, b):
        return float(np.mean(np.abs(a - b)))

    def triple(fn):
        out = {"unary": fn(u), "crf": fn(c), "da_v2": fn(d) if d is not None else None}
        if mk is not None:
            out["make3d"] = fn(mk)
        return out

    return {
        "gradient_energy": triple(gradient_energy),
        "useful_detail": triple(useful_detail),
        "texture_coherence": triple(texture_coherence),
        "smoothness": triple(smoothness),
        "edge_alignment": triple(edge_alignment),
        "depth_range": triple(depth_range),
        "differences": {
            "crf_vs_unary": mae(c, u),
            "da_vs_crf": mae(d, c) if d is not None else None,
            "da_vs_unary": mae(d, u) if d is not None else None,
        },
    }


def _single_depth_metrics(image_r, depth):
    """The 5 per-method metrics for a single depth map (at 256x256)."""
    from skimage.transform import resize as sk_resize
    from .postprocess import compute_gradient

    size = 256
    d = sk_resize(np.asarray(depth, dtype=np.float32), (size, size),
                  preserve_range=True, anti_aliasing=True).astype(np.float32)
    img = np.asarray(image_r)
    gray = np.mean(img, axis=2) if img.ndim == 3 else img
    gray = sk_resize(gray.astype(np.float32), (size, size), preserve_range=True,
                     anti_aliasing=True).astype(np.float32)
    img_grad = compute_gradient(gray)

    de = compute_gradient(d)
    edge = 0.0
    if img_grad.std() > 1e-6 and de.std() > 1e-6:
        edge = float(np.clip(np.corrcoef(img_grad.ravel(), de.ravel())[0, 1], 0.0, 1.0))

    tex = 0.0
    try:
        from skimage.feature import local_binary_pattern
        lbp = local_binary_pattern(gray, 8, 1, method="uniform").astype(np.float32)
        le = compute_gradient(lbp / (float(lbp.max()) + 1e-9)).ravel()
        if le.std() > 1e-6 and de.std() > 1e-6:
            tex = float(np.clip(np.corrcoef(de.ravel(), le)[0, 1], 0.0, 1.0))
    except Exception:
        pass

    grad_energy = float((np.abs(np.diff(d, axis=1)).mean() + np.abs(np.diff(d, axis=0)).mean()) / 2.0)
    return {
        "edge_alignment": edge,
        "useful_detail": float((de * img_grad).mean()),
        "smoothness": float(1.0 - grad_energy),
        "depth_range": float(np.percentile(d, 95) - np.percentile(d, 5)),
        "texture_coherence": tex,
    }


def estimate_depth_ablation(image, segments=900, compactness=10.0,
                            unary_source="shape_from_shading",
                            include_fractal=False, eta=0.8):
    """Ablation over the pairwise similarities (Liu et al. Table 2 style).

    One selected weak unary; CRF re-run with incrementally added similarities
    (color → +histogram → +LBP → +spatial). Returns a list of
    {name, active, depth, metrics}.
    """
    image = _coerce_rgb_uint8(image)
    pixels = image.shape[0] * image.shape[1]
    unary_raw, _unary_method, source_used = _dense_unary_from_image(
        image, method="pseudo", unary_source=unary_source)
    actual_segments = int(np.clip(min(segments, pixels // 50), 20, segments))

    # (name, active_similarities, fractal_aware)
    # Fractal-aware CRF is an explicit extension row, not part of the base Liu
    # ablation. Keep it opt-in so the paper baseline and the fractal extension
    # remain visually separable.
    configs = [
        ("Unary only", None, False),
        ("Unary only (smooth)", ("smooth",), False),
        ("+ color", ("color",), False),
        ("+ histogram", ("color", "histogram"), False),
        ("+ LBP", ("color", "histogram", "lbp"), False),
        ("Our method (Liu DCNF-CRF)", ("color", "histogram", "lbp", "spatial"), False),
    ]
    if include_fractal:
        configs.append(
            ("Our method + fractal prior", ("color", "histogram", "lbp", "fractal", "spatial"), True)
        )
    results = []
    for name, active, frac in configs:
        if active is None:
            depth = unary_raw
        elif active == ("smooth",):
            depth = edge_aware_smooth(unary_raw, image, iterations=1)
        else:
            depth = run_dcnf_crf(image, unary_raw, segments=actual_segments,
                                 compactness=compactness, crf_strength="full",
                                 active_similarities=active,
                                 fractal_aware=frac, eta=eta)["crf_depth"]
        results.append({
            "name": name,
            "active": list(active) if active else [],
            "fractal_aware": frac,
            "unary_source": source_used,
            "depth": depth,
            "metrics": _single_depth_metrics(image, depth),
        })
    return results


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


def estimate_depth(image, method="auto", segments=900, compactness=10.0, target_size=256,
                   crf_strength="auto", unary_source="auto",
                   fractal_aware=False, eta=0.8, dump_dir=None):
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
    requested_source = _canonical_unary_source(unary_source, method=method)

    if requested_source == "auto" and method in ("depth_anything", "auto"):
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
    if requested_source != "auto":
        raw_depth, method_used, source_used = _dense_unary_from_image(
            image, method=method, unary_source=unary_source)
    else:
        source_used = "depth_anything" if method_used == "depth_anything_v2" else "pseudo"

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
        crf_params = {
            "crf_strength": "none",
            "blend_unary": 1.0,
            "crf_formula": "y* = z",
            "fractal_aware": False,
            "eta": 0.0,
        }
        smoothed = edge_aware_smooth(raw_depth, image, iterations=1)
        crf_solve = raw_depth
    else:
        crf_result = run_dcnf_crf(image, raw_depth, segments=actual_segments,
                                  compactness=compactness, crf_strength=crf_strength,
                                  fractal_aware=fractal_aware, eta=eta)
        crf_depth_raw = crf_result["crf_depth"]
        unary_depth = crf_result["unary_depth"]
        labels = crf_result["labels"]
        n_superpixels = crf_result["n_superpixels"]
        crf_params = crf_result["params"]
        smoothed = edge_aware_smooth(crf_depth_raw, image)
        crf_solve = crf_result.get("crf_raw", crf_depth_raw)  # MAP solve (pre guided)

    # --- Resize to target_size x target_size ---
    from skimage.transform import resize as sk_resize
    depth_map = sk_resize(smoothed, (target_size, target_size), order=1,
                          preserve_range=True, anti_aliasing=True).astype(np.float32)
    depth_map = normalize_depth(depth_map)

    # --- Optional: dump the ordered pipeline-stage PNGs (visualization only) ---
    if dump_dir:
        try:
            from .dump import dump_pipeline_stages
            dump_pipeline_stages(dump_dir, image=image, raw_depth=raw_depth,
                                 unary_depth=unary_depth, crf_solve=crf_solve,
                                 guided=smoothed, depth_map=depth_map, labels=labels)
        except Exception as e:  # noqa: BLE001 — dump is best-effort
            print(f"[dump] failed: {e}")

    # --- Confidence ---
    confidence = _depth_quality(depth_map)

    params = {
        "segments_requested": segments,
        "segments_actual": actual_segments,
        "compactness": compactness,
        "target_size": target_size,
        "input_shape": (h, w),
        "crf_strength": crf_strength,
        "unary_source": source_used,
        "fractal_aware_requested": bool(fractal_aware),
        "eta_requested": float(eta) if fractal_aware else 0.0,
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
