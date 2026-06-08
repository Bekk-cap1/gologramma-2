"""End-to-end deterministic pipeline (no LLM): 2D image -> analysis -> 3D mesh.

This is the non-agentic orchestrator. The multi-agent (Anthropic) variant lives in
agents/ and calls into these same layer functions.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from .common import get_logger, to_gray
from .layer1_math import (
    analyze_fourier,
    compute_box_counting,
    compute_lacunarity,
    compute_multifractal,
    recover_ifs,
)
from .layer2_cnn import classify
from .layer3_fusion import vote
from .layer3_fusion.weighted_voter import _prescreen_escape
from .layer4_verify import compare, render_topdown, synthesize
from .depth_map import build_depth_map
from .mesh import build_mesh, export_mesh

log = get_logger()
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

CONF_THRESHOLD = 0.75


def run_layer1(image, generate_images: bool = False) -> dict:
    gray = to_gray(image)
    t0 = time.time()
    # The cheap descriptors first; IFS recovery is gated on the escape pre-screen.
    results = {
        "box_counting": compute_box_counting(gray, generate_images=generate_images),
        "fourier": analyze_fourier(gray, generate_images=generate_images),
        "lacunarity": compute_lacunarity(gray, generate_images=generate_images),
        "multifractal": compute_multifractal(gray, generate_images=generate_images),
    }
    log.info("[Layer1] core done in %.2fs", time.time() - t0)
    for k, v in results.items():
        log.info("  %-13s conf=%.3f hint=%s", k, v.get("confidence", 0),
                 v.get("fractal_type_hint") or v.get("fractal_hint") or v.get("ifs_type"))
    return results


def analyze(image, use_cnn: bool = True, generate_images: bool = False) -> dict:
    """Layers 1-3: returns the voter decision plus raw method outputs.

    ``generate_images=True`` attaches base64 debug images to each layer-1 method
    result (used by the visual /analyze_steps pipeline; off by default so the
    latency-sensitive /predict path and the test suite are unaffected).
    """
    gray = to_gray(image)
    results = run_layer1(gray, generate_images=generate_images)
    if use_cnn:
        cnn = classify(image)
        results["cnn"] = {
            "class": cnn["class"],
            "confidence": cnn["confidence"],
            "available": cnn["available"],
            "all_probs": cnn.get("all_probs", {}),
            "embedding": cnn.get("embedding", []),
        }
        log.info("[Layer2] CNN: %s (%.3f) available=%s",
                 cnn["class"], cnn["confidence"], cnn["available"])

    # Pre-screen escape-time vs IFS, then run IFS recovery only when it's useful
    # (skipped for escape-time fractals — its output there is garbage).
    likely_escape, _ev = _prescreen_escape(results)
    # fast IFS on the analyze/predict path (latency-sensitive); /reconstruct re-runs
    # the full-quality recovery for mesh building.
    results["ifs_recovery"] = recover_ifs(gray, escape_time_hint=likely_escape, fast=True)
    log.info("[Layer1] ifs_recovery %s (escape_hint=%s)",
             "skipped" if likely_escape else "fast", likely_escape)

    decision = vote(results, image=gray)
    decision["box_counting_dimension"] = results["box_counting"]["dimension"]
    log.info("[Layer3] -> %s (cat=%s) conf=%.3f escape=%s low=%s",
             decision["final_type"], decision["final_category"],
             decision["final_confidence"], decision["is_escape_time"],
             decision["low_confidence_flag"])
    return {"decision": decision, "methods": results}


def reconstruct(image, quality: str = "full", basename: str = "fractal",
                use_cnn: bool = True, use_neural: str = "auto",
                crf_strength: str = "auto", unary_source: str = "auto",
                fractal_aware: bool = False, eta: float = 0.8) -> dict:
    """Full pipeline incl. depth map, mesh, export and verification.

    ``use_neural`` ("auto"|"always"|"never") routes depth estimation between the
    mathematical (escape/IFS) path and the neural DCNF-CRF path.
    """
    t0 = time.time()
    ana = analyze(image, use_cnn=use_cnn)
    decision = ana["decision"]
    # The raw CNN class before any geometric tie-break (for transparency in the UI).
    decision["cnn_original_class"] = (ana.get("methods", {}).get("cnn", {}) or {}).get("class", "")

    if decision["low_confidence_flag"]:
        log.warning("[Pipeline] LOW_CONFIDENCE — building best-effort mesh anyway")

    n_points = 30000 if quality == "fast" else 100000
    res = 48 if quality == "fast" else 64

    # Re-run full-quality IFS recovery for mesh building (analyze used the fast path).
    # For known IFS types, recover_ifs uses the EXACT canonical maps (e.g. 8 for the
    # carpet) fitted to the image, instead of blind clustering.
    if not decision["is_escape_time"]:
        from .layer1_math import recover_ifs as _recover_full
        ifs_subtype = (decision.get("ifs_subtype_analysis", {}) or {}).get("subtype")
        if not ifs_subtype or ifs_subtype in ("unknown",):
            ifs_subtype = decision["final_type"]
        full_ifs = _recover_full(to_gray(image), fast=False,
                                 classified_type=ifs_subtype)
        if full_ifs.get("transforms"):
            decision["ifs_transforms"] = full_ifs["transforms"]
        if full_ifs.get("global_transform"):
            decision["global_transform"] = full_ifs["global_transform"]
        # Surface canonical-recovery details for the UI.
        decision["recovery_method"] = full_ifs.get("recovery_method", "full_affine")
        decision["theoretical_dimension"] = full_ifs.get("theoretical_dimension")
        if full_ifs.get("pose") is not None:
            pose = dict(full_ifs["pose"])
            pose["fit_score"] = full_ifs.get("fit_score")
            decision["pose"] = pose
    else:
        decision["recovery_method"] = "skipped_escape"

    # depth map
    # Auto depth-routing: photos / natural images / low-confidence classifications
    # are switched to neural depth (math escape/IFS depth is meaningless there).
    from .neural_depth.photo_detector import resolve_neural_mode
    eff_neural, photo_check, neural_reason = resolve_neural_mode(
        use_neural, decision, np.asarray(image))
    decision["photo_detection"] = photo_check
    decision["depth_routing_reason"] = neural_reason

    depth_info = build_depth_map(
        fractal_type=decision["final_type"],
        is_escape_time=decision["is_escape_time"],
        ifs_transforms=decision["ifs_transforms"],
        image=image,
        use_neural=eff_neural,
        crf_strength=crf_strength,
        unary_source=unary_source,
        fractal_aware=fractal_aware,
        eta=eta,
    )
    decision["depth_method"] = depth_info.get("method", "")

    # feed recovered escape-time params into synthesis so the verification render
    # matches the actual input region/parameter (Julia c, etc.)
    ep = depth_info.get("escape_params") or {}
    if ep:
        decision["c_real"] = ep.get("c_real", decision.get("c_real", -0.7))
        decision["c_imag"] = ep.get("c_imag", decision.get("c_imag", 0.27015))

    # 3D synthesis + mesh
    #
    # Bug 1 (2D->3D builds from depth, not IFS): the displayed geometry is ALWAYS
    # a height-field relief extruded from the depth map of the current image, so
    # the result visually matches the depth map and differs per input. The IFS
    # chaos-game path no longer drives the exported geometry. ``synthesize`` is
    # still run, but only to produce the top-down render used by the
    # analysis-by-synthesis verification metric below (not as a 3D source).
    t_mesh = time.time()
    synth = synthesize(decision, n_points=n_points)  # verification render only
    mesh = build_mesh(depth_map=depth_info["depth_map"], resolution=res)
    mesh_time_ms = int((time.time() - t_mesh) * 1000)

    # how the 3D geometry was generated (for the UI viewer label) — always depth
    neural_depth_used = str(depth_info.get("method", "")).startswith("neural")
    generation_method = "neural_depth" if neural_depth_used else "depth_relief"

    metadata = {
        "fractal_type": decision["final_type"],
        "fractal_dimension": round(decision.get("box_counting_dimension", 0.0), 4),
        "confidence": decision["final_confidence"],
        "is_escape_time": decision["is_escape_time"],
        "ifs_transforms": decision["ifs_transforms"],
        "escape_params": depth_info.get("escape_params"),
    }
    exported = export_mesh(mesh, str(OUTPUT_DIR), basename=basename, metadata=metadata)

    # verification (analysis by synthesis) — escape-time uses edge-aware thresholds
    render = render_topdown(synth)
    verification = compare(image, render, is_escape_time=decision["is_escape_time"])
    log.info("[Layer4] verification similarity=%.3f verified=%s",
             verification["similarity"], verification["verified"])

    # save depth map png
    depth_png = OUTPUT_DIR / f"{basename}_depth.png"
    from PIL import Image
    Image.fromarray((depth_info["depth_map"] * 255).astype(np.uint8)).save(depth_png)

    result = {
        "decision": decision,
        "depth_map_png": str(depth_png),
        "mesh": {"n_vertices": mesh["n_vertices"], "n_faces": mesh["n_faces"]},
        "files": exported,
        "verification": verification,
        "metadata": metadata,
        "elapsed_sec": round(time.time() - t0, 3),
        "low_confidence": decision["low_confidence_flag"],
        "generation_method": generation_method,
        "mesh_time_ms": mesh_time_ms,
    }
    log.info("[Pipeline] done in %.2fs -> %s (%d faces)",
             result["elapsed_sec"], exported.get("obj"), mesh["n_faces"])
    return result


if __name__ == "__main__":
    import sys
    from .reference_fractals import sierpinski_triangle
    if len(sys.argv) > 1:
        img = sys.argv[1]
    else:
        img = sierpinski_triangle()
    out = reconstruct(img, basename="cli_demo")
    print(json.dumps({k: v for k, v in out.items() if k != "decision"}, indent=2, default=str))
