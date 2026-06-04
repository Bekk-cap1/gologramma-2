"""Layer 3 - Weighted voting ensemble (TZ section 3.1).

The five math methods emit a coarse *category* hint in {IFS, escape_time, random,
geometric}; the CNN emits a fine *class*. We vote on the coarse category to decide
`is_escape_time`, and use the CNN fine class (validated against the winning category)
as the human-facing `final_type`.
"""
from __future__ import annotations

import numpy as np

# fine CNN class -> coarse category
CNN_TO_CATEGORY = {
    "mandelbrot": "escape_time",
    "julia": "escape_time",
    "burning_ship": "escape_time",
    "spiral_julia": "escape_time",
    "sierpinski_triangle": "IFS",
    "sierpinski_carpet": "IFS",
    "menger_sponge": "IFS",
    "pythagoras_tree": "IFS",
    "koch_snowflake": "IFS",
    "barnsley_fern": "IFS",
    "dragon_curve": "IFS",
    "octahedron_3d": "IFS",
    "dodecahedron_3d": "IFS",
    "icosahedron_3d": "IFS",
    "cantor_dust_3d": "IFS",
    "circle": "geometric",
    "square": "geometric",
}

# Weights when the fractal is an IFS / geometric one (the default).
IFS_WEIGHTS = {
    "box_counting": 0.15,
    "ifs_recovery": 0.25,   # most informative for IFS
    "fourier": 0.15,
    "lacunarity": 0.10,
    "multifractal": 0.20,
    "cnn": 0.15,
}

# Weights when the fractal is escape-time: ignore IFS recovery (garbage here),
# down-weight lacunarity, and trust multifractal + CNN.
ESCAPE_WEIGHTS = {
    "box_counting": 0.10,
    "ifs_recovery": 0.00,   # COMPLETELY ignored for escape-time
    "fourier": 0.20,
    "lacunarity": 0.05,
    "multifractal": 0.30,   # main mathematical descriptor here
    "cnn": 0.35,            # CNN best distinguishes escape-time subtypes
}

# kept for backwards compatibility (older imports)
METHOD_WEIGHTS = IFS_WEIGHTS

CATEGORIES = ["IFS", "escape_time", "random", "geometric"]

# Known fine classes per family — used for the CNN veto on the escape pre-screen.
# Derived from CNN_TO_CATEGORY plus common spelling variants the model may emit.
KNOWN_IFS_CLASSES = {c for c, cat in CNN_TO_CATEGORY.items() if cat == "IFS"} | {
    "sierpinski", "koch", "menger", "fern", "dragon", "cantor", "cantor_set",
    "sierpinski_tetrahedron",
}
KNOWN_ESCAPE_CLASSES = {c for c, cat in CNN_TO_CATEGORY.items() if cat == "escape_time"} | {
    "julia_set", "newton_fractal", "mandelbulb_slice",
}
# CNN confidence above which its family vote is trusted to veto the pre-screen.
# Deliberately lower than the in-distribution threshold (0.85): on unusual views
# the CNN is less confident but still right about the *family*.
CNN_VETO_CONF = 0.40


def _prescreen_escape(results: dict) -> tuple[bool, list[str]]:
    """Decide escape-time vs IFS from the 3 most reliable signals (>=2 => escape).

    CNN veto: if the CNN confidently (> ``CNN_VETO_CONF``) names a known IFS
    class, the pre-screen can NOT flip to escape-time — photorealistic renders of
    IFS fractals (lighting/shadows => many brightness levels) otherwise produce
    false escape signals from the spectral/tone descriptors.
    """
    signals = 0
    evidence: list[str] = []

    cnn = results.get("cnn", {}) or {}
    cnn_class = cnn.get("class", "") or ""
    cnn_conf = float(cnn.get("confidence", 0.0))
    cnn_avail = bool(cnn.get("available"))
    cnn_says_ifs = cnn_avail and cnn_class in KNOWN_IFS_CLASSES and cnn_conf > CNN_VETO_CONF
    cnn_says_escape = cnn_avail and cnn_class in KNOWN_ESCAPE_CLASSES and cnn_conf > CNN_VETO_CONF

    mf = results.get("multifractal", {}) or {}
    if mf.get("spectrum_shape") in ("left_skewed", "wide_asymmetric") and \
            float(mf.get("alpha_width", 0.0)) > 1.2:
        signals += 1
        evidence.append(f"multifractal: wide {mf.get('spectrum_shape')} spectrum "
                        f"(width={mf.get('alpha_width')})")

    fr = results.get("fourier", {}) or {}
    if float(fr.get("spectral_exponent", 0.0)) < 2.0 and float(fr.get("confidence", 0.0)) > 0.8:
        signals += 1
        evidence.append(f"fourier: beta={fr.get('spectral_exponent')}")

    if cnn_says_escape:
        signals += 1
        evidence.append(f"cnn: {cnn_class} ({cnn_conf:.0%})")

    # --- CNN VETO: a confident IFS class blocks the escape override entirely ---
    if cnn_says_ifs:
        evidence.append(
            f"CNN VETO: {cnn_class} ({cnn_conf:.0%}) is IFS — escape override blocked")
        return False, evidence

    return signals >= 2, evidence


def _category_of(results: dict, method: str) -> str | None:
    r = results.get(method)
    if not r:
        return None
    if method == "box_counting":
        return r.get("fractal_type_hint")
    if method == "ifs_recovery":
        t = r.get("ifs_type")
        return "IFS" if t in ("geometric", "random") else ("random" if t == "unknown" else t)
    if method in ("fourier", "lacunarity", "multifractal"):
        return r.get("fractal_hint")
    if method == "cnn":
        return CNN_TO_CATEGORY.get(r.get("class"), None)
    return None


def vote(results: dict, image=None) -> dict:
    """Weighted-voting ensemble decision.

    ``image`` (grayscale ndarray) is optional; when supplied the geometric
    tie-breakers in ``_apply_tiebreaks`` may override the CNN/voter decision
    where the mathematics is confident (Mandelbrot-vs-Julia, misrouted IFS).
    """
    # STEP 0: pre-screen escape-time vs IFS from the 3 most reliable signals.
    is_escape, escape_evidence = _prescreen_escape(results)

    # STEP 1: pick weights based on the pre-screened type.
    weights = ESCAPE_WEIGHTS if is_escape else IFS_WEIGHTS

    # STEP 2: weighted voting over categories, skipping zero-weight methods.
    scores = {c: 0.0 for c in CATEGORIES}
    votes = {}
    active_weight = 0.0
    winner_weight = {}

    for method, weight in weights.items():
        if weight == 0:
            continue
        r = results.get(method)
        if not r:
            continue
        cat = _category_of(results, method)
        conf = float(r.get("confidence", 0.0))
        if cat is None or cat not in scores:
            continue
        scores[cat] += weight * conf
        votes[method] = {"category": cat, "confidence": round(conf, 4)}
        active_weight += weight
        winner_weight[cat] = winner_weight.get(cat, 0.0) + weight

    if active_weight == 0:
        out = _low_conf_result(results)
        out["is_escape_time"] = is_escape
        out["escape_evidence"] = escape_evidence
        out["active_weights"] = weights
        return out

    # STEP 3: winner. The escape pre-screen is authoritative for the category.
    scored_winner = max(scores, key=scores.get)
    final_category = "escape_time" if is_escape else scored_winner

    # confidence = mean confidence of the (active) methods that backed the winner
    win_w = winner_weight.get(final_category, 0.0)
    if win_w <= 0:
        # nobody scored the authoritative category directly; fall back to scored winner
        final_category = scored_winner
        win_w = winner_weight.get(final_category, active_weight)
    norm_conf = scores[final_category] / max(win_w, 1e-9)

    # STEP 4: agreement = fraction of ACTIVE method weight backing the winner.
    agreement = win_w / active_weight

    # fine type from CNN — only when its category matches the final category
    cnn = results.get("cnn", {})
    fine_type = final_category
    if cnn.get("available") and cnn.get("class"):
        cnn_cat = CNN_TO_CATEGORY.get(cnn["class"])
        if cnn_cat == final_category:
            fine_type = cnn["class"]

    # IFS transforms are meaningless for escape-time fractals.
    ifs_transforms = [] if is_escape else results.get("ifs_recovery", {}).get("transforms", [])

    low_conf = bool(norm_conf < 0.75 or agreement < 0.6)

    result = {
        "final_type": fine_type,
        "final_category": final_category,
        "final_confidence": round(float(norm_conf), 4),
        "is_escape_time": bool(is_escape),
        "escape_evidence": escape_evidence,
        "ifs_transforms": ifs_transforms,
        "all_votes": votes,
        "category_scores": {k: round(v, 4) for k, v in scores.items()},
        "agreement_score": round(float(agreement), 4),
        "low_confidence_flag": low_conf,
        "active_weights": weights,
    }
    return _apply_tiebreaks(result, results, image)


def _apply_tiebreaks(result: dict, results: dict, image) -> dict:
    """Geometric tie-breakers that may overrule the CNN/voter when the math is
    confident. Three cases, all gated to be conservative:

    1. escape-time + geometry strongly says Mandelbrot (one-axis mirror, no point
       symmetry) while CNN said otherwise  -> force ``mandelbrot``.
    2. pre-screened escape-time but the image is a near-binary IFS curve/area
       (e.g. a Koch snowflake mislabeled Julia)  -> pull back to IFS and pick the
       IFS subtype geometrically.
    3. IFS path -> record the geometric IFS subtype for transparency (no override:
       the CNN is reliable for the IFS classes we already get right).
    """
    result["tiebreak_applied"] = False
    result["tiebreak_reason"] = []
    if image is None:
        return result

    cnn_class = (results.get("cnn") or {}).get("class", "") or ""
    D = result.get("box_counting_dimension")
    if D is None:
        D = (results.get("box_counting") or {}).get("dimension")

    final_type = result["final_type"]
    is_escape = result["is_escape_time"]

    if is_escape:
        from ..layer1_math.escape_classifier import (
            classify_escape_subtype,
            classify_ifs_vs_escape,
        )
        ive = classify_ifs_vs_escape(image)
        result["ifs_vs_escape_analysis"] = ive

        if ive["category"] == "ifs" and ive["confidence"] >= 0.6:
            # TIE-BREAK 2: a near-binary IFS shape was pre-screened as escape-time.
            from ..layer1_math.ifs_classifier import classify_ifs_subtype
            ifs_cls = classify_ifs_subtype(image, box_counting_D=D)
            result["ifs_subtype_analysis"] = ifs_cls
            if ifs_cls["confidence"] >= 0.4 and ifs_cls["subtype"] not in ("unknown", "cantor_set"):
                final_type = ifs_cls["subtype"]
                is_escape = False
                result["final_category"] = "IFS"
                result["ifs_transforms"] = results.get("ifs_recovery", {}).get("transforms", [])
                result["tiebreak_applied"] = True
                result["tiebreak_reason"].append(
                    f"ifs_pullback -> {final_type}: {ive['evidence']}")
        else:
            # TIE-BREAK 1: Mandelbrot vs Julia on a genuine escape-time field.
            esc = classify_escape_subtype(image)
            result["escape_subtype_analysis"] = esc
            if (esc["confidence"] > 0.5 and esc["subtype"] == "mandelbrot"
                    and cnn_class != "mandelbrot"
                    and esc["features"]["mandelbrot_score"] >= 4):
                final_type = "mandelbrot"
                result["tiebreak_applied"] = True
                result["tiebreak_reason"].append(
                    f"escape geometry override -> mandelbrot: {esc['evidence']}")
            # geometry == julia: trust the CNN's finer Julia subtype (no change).
    else:
        # TIE-BREAK 3: record geometric IFS subtype (transparency, no override).
        from ..layer1_math.ifs_classifier import classify_ifs_subtype
        result["ifs_subtype_analysis"] = classify_ifs_subtype(image, box_counting_D=D)

        # CNN IFS protection: if the CNN confidently named an IFS class but the
        # voter still landed on an escape class, snap the final type back to the
        # CNN's IFS class (consistency with the veto in _prescreen_escape).
        cnn_conf = float((results.get("cnn") or {}).get("confidence", 0.0))
        if (cnn_class in KNOWN_IFS_CLASSES and cnn_conf > CNN_VETO_CONF
                and (final_type in KNOWN_ESCAPE_CLASSES or final_type == "escape_time")):
            final_type = cnn_class
            result["final_category"] = "IFS"
            result["tiebreak_applied"] = True
            result["tiebreak_reason"].append(
                f"CNN IFS override: {cnn_class} ({cnn_conf:.0%})")

    result["final_type"] = final_type
    result["is_escape_time"] = bool(is_escape)
    return result


def _low_conf_result(results: dict) -> dict:
    return {
        "final_type": "unknown",
        "final_category": "random",
        "final_confidence": 0.0,
        "is_escape_time": False,
        "ifs_transforms": results.get("ifs_recovery", {}).get("transforms", []),
        "all_votes": {},
        "category_scores": {},
        "agreement_score": 0.0,
        "low_confidence_flag": True,
    }
