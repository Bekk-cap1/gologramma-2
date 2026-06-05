"""FastAPI server for the fractal 2D->3D reconstruction system.

Thin HTTP layer over the existing fractal_3d pipeline. Does NOT reimplement any
analysis — it only decodes input, calls the pipeline, and shapes the response.

Run:
    python -m fractal_3d.api_server --port 8000
    # or
    python fractal_3d/api_server.py --port 8000
"""
from __future__ import annotations

import argparse
import base64
import datetime
import io
import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from fractal_3d.pipeline import analyze, reconstruct, OUTPUT_DIR  # noqa: F401
from fractal_3d.layer2_cnn import classify
from fractal_3d.depth_map import build_depth_map
from fractal_3d.layer4_verify import synthesize, render_topdown, compare

# ──────────────────────────────────────────────────────────────────────────────
# 3D analogs mapping (type → 3D model display name) — mirrors scripts/api_server.py
# ──────────────────────────────────────────────────────────────────────────────
TYPE_TO_3D = {
    "mandelbrot":          "Mandelbulb (n=8)",
    "julia":               "Julia 3D",
    "burning_ship":        "Burning Ship 3D",
    "sierpinski_triangle": "Sierpinski Tetrahedron",
    "sierpinski_carpet":   "Menger Sponge",
    "menger_sponge":       "Menger Sponge (level 3)",
    "pythagoras_tree":     "3D Pythagoras Tree",
    "koch_snowflake":      "Koch Snowflake Surface",
    "barnsley_fern":       "3D Barnsley Fern",
    "dragon_curve":        "Dragon Curve 3D",
    "octahedron_3d":       "Sierpinski Octahedron",
    "dodecahedron_3d":     "Dodecahedron Fractal",
    "icosahedron_3d":      "Icosahedron Fractal",
    "cantor_dust_3d":      "Cantor Dust 3D",
    "spiral_julia":        "Julia 3D (spiral)",
    "circle":              "Sphere",
    "square":              "Cube",
}

FEEDBACK_DIR = os.path.join(os.path.dirname(__file__), "feedback_dataset")

# UI depth_method → builder use_neural routing.
_DEPTH_METHOD_TO_NEURAL = {"neural": "always", "mathematical": "never", "auto": "auto"}


def _use_neural(depth_method: str) -> str:
    return _DEPTH_METHOD_TO_NEURAL.get((depth_method or "auto").lower(), "auto")

app = FastAPI(title="Fractal 2D->3D API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cached model-loaded flag (resolved lazily on first /health or at startup).
_MODEL_LOADED: Optional[bool] = None


def _resolve_model_loaded() -> bool:
    """Return whether the CNN weights are loadable. Cached after first call."""
    global _MODEL_LOADED
    if _MODEL_LOADED is not None:
        return _MODEL_LOADED
    try:
        from fractal_3d.layer2_cnn import load_model
        _MODEL_LOADED = load_model() is not None
    except Exception:  # noqa: BLE001
        try:
            import numpy as np
            tiny = Image.fromarray((np.ones((8, 8, 3)) * 255).astype("uint8"))
            _MODEL_LOADED = bool(classify(tiny).get("available", False))
        except Exception:  # noqa: BLE001
            _MODEL_LOADED = False
    return _MODEL_LOADED


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _decode_image(b64: str) -> Image.Image:
    """Decode a base64 png/jpg (optionally with data-URI prefix) to a PIL image."""
    if not b64:
        raise ValueError("empty image payload")
    if "," in b64 and b64.strip().lower().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(b64)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"invalid base64: {e}")
    try:
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"cannot decode image: {e}")


def _b64_file(path: str) -> str:
    with open(path, "rb") as fh:
        return base64.b64encode(fh.read()).decode("ascii")


# ──────────────────────────────────────────────────────────────────────────────
# Request models
# ──────────────────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    image: str


class AnalyzeStepsRequest(BaseModel):
    image: str
    generate_images: bool = True
    depth_method: str = "auto"  # "auto" | "neural" | "mathematical"
    crf_strength: str = "auto"  # "auto" | "none" | "light" | "full"
    unary_source: str = "auto"  # "auto" | "pseudo" | "shape_from_shading" | "depth_anything"
    fractal_aware: bool = False
    eta: float = 0.8


class ReconstructRequest(BaseModel):
    image: str
    quality: str = "fast"
    depth_method: str = "auto"  # "auto" | "neural" | "mathematical"
    crf_strength: str = "auto"  # "auto" | "none" | "light" | "full"
    unary_source: str = "auto"
    fractal_aware: bool = False
    eta: float = 0.8


class CompareDepthRequest(BaseModel):
    image: str
    depth_method: str = "auto"  # "auto" | "neural" | "mathematical"
    unary_source: str = "shape_from_shading"
    fractal_aware: bool = False
    eta: float = 0.8


class AblationRequest(BaseModel):
    image: str
    depth_method: str = "auto"  # accepted for parity; unary_source controls z
    unary_source: str = "shape_from_shading"
    fractal_aware: bool = False
    eta: float = 0.8


class FeedbackRequest(BaseModel):
    image: str
    correct_type: str


# ──────────────────────────────────────────────────────────────────────────────
# Startup
# ──────────────────────────────────────────────────────────────────────────────
@app.on_event("startup")
def _startup() -> None:
    _resolve_model_loaded()
    # Warm up heavy imports (sklearn KMeans, torch) and JIT paths on a tiny image
    # so the first real /predict meets the <500ms target instead of paying import cost.
    try:
        from fractal_3d.pipeline import analyze as _analyze
        from fractal_3d.reference_fractals import sierpinski_triangle as _st
        # a real fractal so the IFS->KMeans path (and torch) are fully JIT-warmed
        _analyze(_st(size=128, n_points=20000), use_cnn=True)
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/predict")
def predict(req: PredictRequest):
    try:
        img = _decode_image(req.image)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        out = analyze(img, use_cnn=True)
        decision = out["decision"]
        methods = out["methods"]

        cnn = methods.get("cnn", {}) or {}
        all_scores = cnn.get("all_probs") or {}
        if not all_scores:
            all_scores = decision.get("category_scores") or {}

        # Frontend treats confidence and all_scores as PERCENTAGES (0-100).
        all_scores = {k: round(float(v) * 100.0, 2) for k, v in all_scores.items()}

        final_type = decision.get("final_type")
        return {
            "type": final_type,
            "type_3d": TYPE_TO_3D.get(final_type, final_type),
            "confidence": float(decision.get("final_confidence", 0.0)) * 100.0,
            "all_scores": all_scores,
            "ifs_transforms": decision.get("ifs_transforms", []),
            "fractal_dimension": float(decision.get("box_counting_dimension", 0.0)),
            "is_escape_time": bool(decision.get("is_escape_time", False)),
            "low_confidence": bool(decision.get("low_confidence_flag", False)),
            # Escape-time params: sensible defaults (only meaningful for escape-time).
            "c_real": -0.7,
            "c_imag": 0.27015,
            "zoom": 1.0,
            "iterations": 200,
        }
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


def _yn(v) -> str:
    return "yes" if bool(v) else "no"


_RECOVERY_LABELS = {
    "canonical_fitted": {"ru": "Каноничная IFS + подгонка позы",
                         "uz": "Kanonik IFS + poza moslash"},
    "full_affine": {"ru": "Blind recovery (кластеризация)",
                    "uz": "Blind recovery (klasterlash)"},
    "skipped_escape": {"ru": "Пропущен (escape-time)", "uz": "O'tkazib yuborildi"},
    "unknown": {"ru": "—", "uz": "—"},
}


def _ifs_recovery_step(ifs: dict, ifs_canon: dict) -> dict:
    """Build the (possibly canonical) IFS-recovery step card payload."""
    # prefer the full canonical recovery when it produced something
    src = ifs_canon if ifs_canon.get("transforms") else ifs
    method = src.get("recovery_method", "full_affine")
    transforms = src.get("transforms", []) or []

    metrics = [
        {"label": {"ru": "Метод", "uz": "Usul"},
         "value": _RECOVERY_LABELS.get(method, _RECOVERY_LABELS["unknown"])["ru"]},
        {"label": {"ru": "Кол-во преобразований", "uz": "Almashtirishlar soni"},
         "value": str(src.get("num_transforms", len(transforms)))},
        {"label": {"ru": "Тип", "uz": "Tur"},
         "value": str(src.get("ifs_type", ""))},
    ]
    theo = src.get("theoretical_dimension")
    if theo is not None:
        metrics.append({"label": {"ru": "Теоретич. D", "uz": "Nazariy D"},
                        "value": f"{float(theo):.3f}"})

    # serialise transform matrices for the collapsible "show all" list
    tlist = []
    for t in transforms:
        m = t.get("matrix", [[0, 0], [0, 0]])
        b = t.get("translation", [0, 0])
        tlist.append({
            "matrix": [[round(float(m[0][0]), 3), round(float(m[0][1]), 3)],
                       [round(float(m[1][0]), 3), round(float(m[1][1]), 3)]],
            "translation": [round(float(b[0]), 3), round(float(b[1]), 3)],
            "probability": round(float(t.get("probability", 0.0)), 3),
        })

    step = {
        "id": "ifs_recovery",
        "layer": 1,
        "title": {"ru": "Восстановление IFS", "uz": "IFS tiklash"},
        "confidence": float(src.get("confidence", 0.0)) * 100.0,
        "hint": str(method),
        "metrics": metrics,
        "recovery_method": method,
        "theoretical_dimension": theo,
        "transforms": tlist,
    }
    pose = src.get("pose")
    if pose:
        step["pose"] = {
            "scale": round(float(pose.get("scale", 0.0)), 3),
            "angle_deg": round(float(pose.get("angle", 0.0)) * 180.0 / 3.14159265, 1),
            "tx": round(float(pose.get("tx", 0.0)), 3),
            "ty": round(float(pose.get("ty", 0.0)), 3),
            "fit_score": round(float(src.get("fit_score", pose.get("fit_score", 0.0)) or 0.0), 3),
        }
    return step


def _tiebreak_step(decision: dict) -> Optional[dict]:
    """Geometric tie-break analysis card (escape subtype / IFS subtype). None if absent."""
    esc = decision.get("escape_subtype_analysis")
    ifs_sub = decision.get("ifs_subtype_analysis")
    if not esc and not ifs_sub:
        return None

    applied = bool(decision.get("tiebreak_applied", False))
    conf = float((esc or ifs_sub or {}).get("confidence", 0.0)) * 100.0
    step = {
        "id": "tiebreak",
        "layer": 3,
        "title": {"ru": "Геометрический тай-брейк", "uz": "Geometrik tay-brek"},
        "confidence": conf,
        "hint": "переопределил CNN" if applied else "подтвердил",
        "metrics": [],
        "tiebreak_applied": applied,
    }
    evidence: list = []
    if esc:
        feats = esc.get("features", {}) or {}
        step["metrics"] += [
            {"label": {"ru": "Mandelbrot очки", "uz": "Mandelbrot ball"},
             "value": f"{float(feats.get('mandelbrot_score', 0.0)):.1f}"},
            {"label": {"ru": "Julia очки", "uz": "Julia ball"},
             "value": f"{float(feats.get('julia_score', 0.0)):.1f}"},
            {"label": {"ru": "Вердикт", "uz": "Hukm"},
             "value": str(esc.get("subtype", ""))},
        ]
        evidence += list(esc.get("evidence", []) or [])
    if ifs_sub:
        scores = ifs_sub.get("all_scores", {}) or {}
        top = sorted(scores.items(), key=lambda x: -x[1])[:3]
        for i, (k, v) in enumerate(top):
            step["metrics"].append(
                {"label": {"ru": f"{i+1}. {k}", "uz": f"{i+1}. {k}"},
                 "value": f"{float(v):.1f}"})
        evidence += list(ifs_sub.get("evidence", []) or [])
    step["evidence"] = [str(e) for e in evidence]
    return step


def _escape_params_payload(escape_params) -> Optional[dict]:
    """Shape estimated escape-time params (Julia c + search diagnostics) for the UI.

    Returns None when no escape params were estimated (IFS fractals).
    """
    if not escape_params:
        return None
    ep = escape_params
    return {
        "c_real": round(float(ep.get("c_real", 0.0)), 5),
        "c_imag": round(float(ep.get("c_imag", 0.0)), 5),
        "center_x": round(float(ep.get("center_x", 0.0)), 4),
        "center_y": round(float(ep.get("center_y", 0.0)), 4),
        "zoom": round(float(ep.get("zoom", 1.0)), 4),
        "similarity": round(float(ep.get("similarity_to_known", 0.0)), 4),
        "optimization_method": str(ep.get("optimization_method", "")),
        "search_log": ep.get("search_log", {}) or {},
    }


def _depth_png_b64(depth) -> str:
    """Encode a 0..1 float depth ndarray as a base64 PNG (mode L), no data prefix."""
    import numpy as np
    arr = np.clip(np.asarray(depth, dtype="float64"), 0.0, 1.0)
    pil = Image.fromarray((arr * 255.0).astype("uint8"), mode="L")
    buf = io.BytesIO()
    pil.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# Per-step formula strings (shown as a monospace block under each card).
_STEP_FORMULAS = {
    "box_counting": "D = −lim[log N(ε) / log ε],   R² = goodness-of-fit",
    "ifs_recovery": "Tᵢ(x) = Aᵢ·x + tᵢ,   i = 1..N",
    "fourier": "S(f) ~ f^(−β)",
    "lacunarity": "Λ(r) = ⟨S²⟩ / ⟨S⟩²",
    "multifractal": "f(α) = qα − τ(q),   α = dτ/dq",
    "cnn": "P(class) = softmax(W·f) = exp(zᵢ) / Σ exp(zⱼ)",
    "fusion": "score[type] = Σ wᵢ · confᵢ",
    "tiebreak": "sym = SSIM(I, flip(I)),   r₁₈₀ = SSIM(I, rot180(I))",
    "verification": "sim = w₁·SSIM + w₂·EdgeIoU + w₃·OverlapIoU + w₄·DimSim",
}


def _attach_step_visuals(steps, gen_images, img, decision, methods,
                         depth_map, depth_out, render, is_escape) -> None:
    """Attach a ``formula`` string (always) and ``images`` (when gen_images) to
    each pipeline step in-place. All image generation is best-effort: any failure
    degrades to no images rather than failing the request."""
    # formulas first (cheap, always on)
    depth_is_neural = str(depth_out.get("method", "")).startswith("neural")
    for s in steps:
        if s["id"] == "depth":
            if depth_is_neural:
                params = (depth_out.get("neural_params", {}) or {})
                src = str(params.get("unary_source", "auto"))
                if params.get("fractal_aware"):
                    s["formula"] = (
                        f"z = {src}(image); h = fractal_prior; "
                        "y* = ((1+eta)I + D - R)^-1 (z + eta*h)"
                    )
                else:
                    s["formula"] = f"z = {src}(image); y* = (I + D - R)^-1 z"
            elif is_escape:
                s["formula"] = "depth = i + 1 − log(log|z|)/log 2"
            else:
                s["formula"] = "depth = recursion_level / max_level"
        else:
            f = _STEP_FORMULAS.get(s["id"])
            if f:
                s["formula"] = f

    if not gen_images:
        return

    try:
        import numpy as np
        from fractal_3d.common import to_gray, binarize
        from fractal_3d import viz

        by_id = {s["id"]: s for s in steps}
        gray = to_gray(np.asarray(img))
        binary = binarize(gray)

        # layer-1 method images (built inside the analysis functions)
        for mid in ("box_counting", "fourier", "lacunarity", "multifractal"):
            step = by_id.get(mid)
            imgs = (methods.get(mid, {}) or {}).get("images") or []
            if step is not None and imgs:
                step["images"] = imgs

        # box_counting card also shows the shared preprocessing (gray + binary)
        if "box_counting" in by_id:
            pre = viz.preprocessing_images(gray, binary)
            by_id["box_counting"]["images"] = pre + (by_id["box_counting"].get("images") or [])

        # IFS recovery → chaos-game attractor from the recovered transforms
        if "ifs_recovery" in by_id and not is_escape:
            ifs_imgs = viz.ifs_images(gray, decision.get("ifs_transforms", []) or [])
            if ifs_imgs:
                by_id["ifs_recovery"]["images"] = ifs_imgs

        # ensemble vote bars
        if "fusion" in by_id:
            scores = decision.get("category_scores") or (
                methods.get("cnn", {}) or {}).get("all_probs") or {}
            ens = viz.ensemble_image(scores)
            if ens:
                by_id["fusion"]["images"] = [ens]

        # depth map images. Neural depth → show the DCNF-CRF stage breakdown
        # (raw unary · superpixels · CRF · colorized). Math depth → raw+colorized
        # (+ the Julia render for escape-time).
        if "depth" in by_id and depth_map is not None:
            if str(depth_out.get("method", "")).startswith("neural"):
                d_imgs = viz.depth_step_images(depth_out, gray)
            else:
                d_imgs = viz.depth_images(depth_map)
                ep = (depth_out or {}).get("escape_params") or {}
                if is_escape and ep:
                    er = viz.escape_render_image(gray, ep.get("c_real", -0.7),
                                                 ep.get("c_imag", 0.27015))
                    if er:
                        d_imgs.append(er)
            by_id["depth"]["images"] = d_imgs

        # verification comparison (original · render · diff · edges)
        if "verification" in by_id and render is not None:
            vimg = viz.verification_image(gray, np.asarray(render))
            if vimg:
                by_id["verification"]["images"] = [vimg]
    except Exception:  # noqa: BLE001 — visuals are best-effort
        pass


@app.post("/analyze_steps")
def analyze_steps(req: AnalyzeStepsRequest):
    try:
        img = _decode_image(req.image)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        gen_images = bool(req.generate_images)
        out = analyze(img, use_cnn=True, generate_images=gen_images)
        decision = out.get("decision", {}) or {}
        methods = out.get("methods", {}) or {}

        box = methods.get("box_counting", {}) or {}
        ifs = methods.get("ifs_recovery", {}) or {}
        fourier = methods.get("fourier", {}) or {}
        lac = methods.get("lacunarity", {}) or {}
        mf = methods.get("multifractal", {}) or {}
        cnn = methods.get("cnn", {}) or {}

        final_type = decision.get("final_type")
        is_escape = bool(decision.get("is_escape_time", False))

        # ── canonical IFS recovery (full path) so the card can show the exact
        #    maps / pose / theoretical dimension, not just the fast blind recovery.
        ifs_canon: dict = {}
        if not is_escape:
            import numpy as np
            from fractal_3d.common import to_gray
            from fractal_3d.layer1_math import recover_ifs as _recover_full
            sub = (decision.get("ifs_subtype_analysis", {}) or {}).get("subtype")
            if not sub or sub == "unknown":
                sub = final_type
            try:
                ifs_canon = _recover_full(to_gray(np.asarray(img)), fast=False,
                                          classified_type=sub) or {}
            except Exception:  # noqa: BLE001
                ifs_canon = {}
            if ifs_canon.get("transforms"):
                decision["ifs_transforms"] = ifs_canon["transforms"]

        # ── depth map (layer between 3 and 4) ────────────────────────────────
        # Auto depth-routing (photo / low-confidence → neural depth).
        import numpy as np
        from fractal_3d.neural_depth.photo_detector import resolve_neural_mode
        eff_neural, photo_check, neural_reason = resolve_neural_mode(
            _use_neural(req.depth_method), decision, np.asarray(img))

        depth_out = build_depth_map(
            final_type,
            bool(decision.get("is_escape_time", False)),
            decision.get("ifs_transforms", []) or [],
            img,
            use_neural=eff_neural,
            crf_strength=req.crf_strength,
            unary_source=req.unary_source,
            fractal_aware=req.fractal_aware,
            eta=req.eta,
        ) or {}
        depth_map = depth_out.get("depth_map")
        depth_b64 = _depth_png_b64(depth_map) if depth_map is not None else ""

        # ── verification (layer 4) ───────────────────────────────────────────
        synth = synthesize(decision, n_points=20000) or {}
        render = render_topdown(synth)
        verify = compare(img, render, is_escape_time=is_escape) or {}

        cnn_available = bool(cnn.get("available", False))
        cnn_hint = str(cnn.get("class")) if cnn_available else "модель не загружена"

        steps = [
            {
                "id": "box_counting",
                "layer": 1,
                "title": {"ru": "Box-counting размерность", "uz": "Box-counting o'lchami"},
                "confidence": float(box.get("confidence", 0.0)) * 100.0,
                "hint": str(box.get("fractal_type_hint", "")),
                "metrics": [
                    {"label": {"ru": "Размерность D", "uz": "O'lcham D"},
                     "value": f"{float(box.get('dimension', 0.0)):.3f}"},
                    {"label": {"ru": "R²", "uz": "R²"},
                     "value": f"{float(box.get('confidence', 0.0)):.3f}"},
                ],
            },
            _ifs_recovery_step(ifs, ifs_canon),
            {
                "id": "fourier",
                "layer": 1,
                "title": {"ru": "Фурье-спектр", "uz": "Furye spektri"},
                "confidence": float(fourier.get("confidence", 0.0)) * 100.0,
                "hint": str(fourier.get("fractal_hint", "")),
                "metrics": [
                    {"label": {"ru": "β (экспонента)", "uz": "β (eksponenta)"},
                     "value": f"{float(fourier.get('spectral_exponent', 0.0)):.3f}"},
                    {"label": {"ru": "Симметрия", "uz": "Simmetriya"},
                     "value": str(fourier.get("symmetry_order", 0))},
                ],
            },
            {
                "id": "lacunarity",
                "layer": 1,
                "title": {"ru": "Лакунарность", "uz": "Lakunarlik"},
                "confidence": float(lac.get("confidence", 0.0)) * 100.0,
                "hint": str(lac.get("fractal_hint", "")),
                "metrics": [
                    {"label": {"ru": "Средняя", "uz": "O'rtacha"},
                     "value": f"{float(lac.get('mean_lacunarity', 0.0)):.3f}"},
                    {"label": {"ru": "Наклон", "uz": "Qiyalik"},
                     "value": f"{float(lac.get('lacunarity_slope', 0.0)):.3f}"},
                ],
            },
            {
                "id": "multifractal",
                "layer": 1,
                "title": {"ru": "Мультифрактальный спектр f(α)", "uz": "Multifraktal spektr f(α)"},
                "confidence": float(mf.get("confidence", 0.0)) * 100.0,
                "hint": str(mf.get("fractal_hint", "")),
                "metrics": [
                    {"label": {"ru": "Ширина α", "uz": "α kengligi"},
                     "value": f"{float(mf.get('alpha_width', 0.0)):.3f}"},
                    {"label": {"ru": "Форма", "uz": "Shakl"},
                     "value": str(mf.get("spectrum_shape", ""))},
                ],
            },
            {
                "id": "cnn",
                "layer": 2,
                "title": {"ru": "CNN классификация", "uz": "CNN klassifikatsiya"},
                "confidence": float(cnn.get("confidence", 0.0)) * 100.0,
                "hint": cnn_hint,
                "metrics": [
                    {"label": {"ru": "Класс", "uz": "Sinf"},
                     "value": str(cnn.get("class", ""))},
                    {"label": {"ru": "Доступна", "uz": "Mavjud"},
                     "value": _yn(cnn_available)},
                ],
            },
            {
                "id": "fusion",
                "layer": 3,
                "title": {"ru": "Ансамблевое голосование", "uz": "Ansambl ovoz berish"},
                "confidence": float(decision.get("final_confidence", 0.0)) * 100.0,
                "hint": str(decision.get("final_category", "")),
                "metrics": [
                    {"label": {"ru": "Итоговый тип", "uz": "Yakuniy tur"},
                     "value": str(final_type)},
                    {"label": {"ru": "Категория", "uz": "Kategoriya"},
                     "value": str(decision.get("final_category", ""))},
                    {"label": {"ru": "Согласие", "uz": "Kelishuv"},
                     "value": f"{float(decision.get('agreement_score', 0.0)) * 100.0:.0f}%"},
                ],
            },
            {
                "id": "depth",
                "layer": 3,
                "title": {"ru": "Карта глубины", "uz": "Chuqurlik xaritasi"},
                "confidence": float(depth_out.get("confidence", 0.0)) * 100.0,
                "hint": str(depth_out.get("method", "")),
                "metrics": [
                    {"label": {"ru": "Метод", "uz": "Usul"},
                     "value": str(depth_out.get("method", ""))},
                    {"label": {"ru": "Заполненность", "uz": "To'ldirilganlik"},
                     "value": f"{float(depth_out.get('occupancy', 0.0)) * 100.0:.1f}%"},
                ],
            },
            {
                "id": "verification",
                "layer": 4,
                "title": {"ru": "Верификация (синтез→сравнение)", "uz": "Verifikatsiya"},
                "confidence": float(verify.get("similarity", 0.0)) * 100.0,
                "hint": "verified" if verify.get("verified") else "low",
                "metrics": [
                    {"label": {"ru": "SSIM", "uz": "SSIM"},
                     "value": f"{float(verify.get('ssim', 0.0)):.3f}"},
                    {"label": {"ru": "Edge IoU", "uz": "Edge IoU"},
                     "value": f"{float(verify.get('edge_iou', 0.0)):.3f}"},
                    {"label": {"ru": "Overlap IoU", "uz": "Overlap IoU"},
                     "value": f"{float(verify.get('overlap_iou', 0.0)):.3f}"},
                    {"label": {"ru": "Dim similarity", "uz": "Dim similarity"},
                     "value": f"{float(verify.get('dim_similarity', 0.0)):.3f}"},
                    {"label": {"ru": "Сходство", "uz": "O'xshashlik"},
                     "value": f"{float(verify.get('similarity', 0.0)) * 100.0:.1f}%"},
                    {"label": {"ru": "Порог", "uz": "Bo'sag'a"},
                     "value": f"{float(verify.get('threshold_used', 0.0)) * 100.0:.0f}% "
                              f"({'escape' if is_escape else 'IFS'})"},
                    {"label": {"ru": "Ориентация", "uz": "Yo'nalish"},
                     "value": f"{int(verify.get('best_orientation', 0))}°"},
                    {"label": {"ru": "Phase shift", "uz": "Phase shift"},
                     "value": (f"({verify['phase_shift'][0]}px, {verify['phase_shift'][1]}px)"
                               if verify.get("phase_shift") else "—")},
                    {"label": {"ru": "Подтверждено", "uz": "Tasdiqlangan"},
                     "value": _yn(verify.get("verified"))},
                ],
            },
        ]

        # Insert the geometric tie-break card between fusion and depth (if present).
        tb_step = _tiebreak_step(decision)
        if tb_step is not None:
            insert_at = next((i for i, s in enumerate(steps) if s["id"] == "depth"), len(steps))
            steps.insert(insert_at, tb_step)

        # ── attach per-step formulas + intermediate debug images ─────────────
        _attach_step_visuals(steps, gen_images, img, decision, methods,
                             depth_map, depth_out, render, is_escape)

        tiebreak_reason = decision.get("tiebreak_reason")
        if isinstance(tiebreak_reason, (list, tuple)):
            tiebreak_reason = "; ".join(str(r) for r in tiebreak_reason) or None

        return {
            "final": {
                "type": final_type,
                "type_3d": TYPE_TO_3D.get(final_type, final_type),
                "category": str(decision.get("final_category", "")),
                "confidence": float(decision.get("final_confidence", 0.0)) * 100.0,
                "is_escape_time": bool(decision.get("is_escape_time", False)),
                "fractal_dimension": float(decision.get("box_counting_dimension", 0.0)),
                "low_confidence": bool(decision.get("low_confidence_flag", False)),
                "agreement": float(decision.get("agreement_score", 0.0)) * 100.0,
                # ── new (stage 5) ───────────────────────────────────────────
                "recovery_method": ifs_canon.get("recovery_method",
                                                  "skipped_escape" if is_escape else "full_affine"),
                "theoretical_dimension": ifs_canon.get("theoretical_dimension"),
                "generation_method": (
                    "neural_depth" if str(depth_out.get("method", "")).startswith("neural")
                    else "recursive_boundary" if final_type == "koch_snowflake"
                    else "escape_depth" if is_escape else "chaos_game"),
                "depth_method": depth_out.get("method", ""),
                "crf_strength": depth_out.get("crf_strength"),
                "unary_source": (depth_out.get("neural_params", {}) or {}).get("unary_source"),
                "fractal_aware": bool((depth_out.get("neural_params", {}) or {}).get("fractal_aware", False)),
                "photo_detection": photo_check,
                "depth_routing_reason": neural_reason,
                "tiebreak_applied": bool(decision.get("tiebreak_applied", False)),
                "tiebreak_reason": tiebreak_reason,
                "cnn_original_class": str(cnn.get("class", "")),
                "pose_fit_score": (round(float(ifs_canon.get("fit_score", 0.0)), 3)
                                   if ifs_canon.get("fit_score") is not None else None),
            },
            "depth_image": depth_b64,
            "escape_params": _escape_params_payload(depth_out.get("escape_params")),
            "steps": steps,
        }
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reconstruct")
def reconstruct_endpoint(req: ReconstructRequest):
    try:
        img = _decode_image(req.image)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    quality = req.quality if req.quality in ("fast", "full") else "fast"
    try:
        out = reconstruct(img, quality=quality, basename="fractal", use_cnn=True,
                          use_neural=_use_neural(req.depth_method),
                          crf_strength=req.crf_strength,
                          unary_source=req.unary_source,
                          fractal_aware=req.fractal_aware,
                          eta=req.eta)
        files = out.get("files", {}) or {}
        obj_path = files.get("obj")
        depth_path = out.get("depth_map_png")
        verification = out.get("verification", {}) or {}
        decision = out.get("decision", {}) or {}
        mesh = out.get("mesh", {}) or {}

        final_type = decision.get("final_type")
        tiebreak_reason = decision.get("tiebreak_reason")
        if isinstance(tiebreak_reason, (list, tuple)):
            tiebreak_reason = "; ".join(str(r) for r in tiebreak_reason) or None

        return {
            # ── existing fields ─────────────────────────────────────────────
            "obj_file": _b64_file(obj_path) if obj_path else "",
            "depth_map": _b64_file(depth_path) if depth_path else "",
            "metadata": out.get("metadata", {}),
            "verification_score": float(verification.get("similarity", 0.0)),
            "confidence": float(decision.get("final_confidence", 0.0)),
            "low_confidence": bool(out.get("low_confidence", False)),
            "files": files,
            # ── identity ────────────────────────────────────────────────────
            "type": final_type,
            "type_3d": TYPE_TO_3D.get(final_type, final_type),
            "fractal_dimension": float(decision.get("box_counting_dimension", 0.0)),
            "is_escape_time": bool(decision.get("is_escape_time", False)),
            "agreement": float(decision.get("agreement_score", 0.0)) * 100.0,
            # ── escape-time params (Julia c + search diagnostics) ────────────
            "escape_params": _escape_params_payload((out.get("metadata", {}) or {}).get("escape_params")),
            # ── canonical IFS / recovery ─────────────────────────────────────
            "recovery_method": decision.get("recovery_method", "unknown"),
            "theoretical_dimension": decision.get("theoretical_dimension"),
            "pose": decision.get("pose"),
            "global_transform": decision.get("global_transform"),
            "ifs_transforms": decision.get("ifs_transforms", []),
            # ── tie-break transparency ───────────────────────────────────────
            "tiebreak_applied": bool(decision.get("tiebreak_applied", False)),
            "tiebreak_reason": tiebreak_reason,
            "cnn_original_class": decision.get("cnn_original_class", ""),
            "escape_subtype_analysis": decision.get("escape_subtype_analysis"),
            "ifs_subtype_analysis": decision.get("ifs_subtype_analysis"),
            # ── verification (rich) ──────────────────────────────────────────
            "verification": {
                "similarity": float(verification.get("similarity", 0.0)),
                "ssim": float(verification.get("ssim", 0.0)),
                "edge_iou": float(verification.get("edge_iou", 0.0)),
                "overlap_iou": float(verification.get("overlap_iou", 0.0)),
                "dim_similarity": float(verification.get("dim_similarity", 0.0)),
                "verified": bool(verification.get("verified", False)),
                "threshold_used": float(verification.get("threshold_used", 0.0)),
                "phase_shift": verification.get("phase_shift"),
                "best_orientation": int(verification.get("best_orientation", 0)),
            },
            # ── 3D generation ────────────────────────────────────────────────
            "generation_method": out.get("generation_method", "chaos_game"),
            "depth_method": decision.get("depth_method", ""),
            "photo_detection": decision.get("photo_detection"),
            "depth_routing_reason": decision.get("depth_routing_reason"),
            "mesh_stats": {
                "vertices": int(mesh.get("n_vertices", 0)),
                "faces": int(mesh.get("n_faces", 0)),
                "generation_time_ms": int(out.get("mesh_time_ms", 0)),
            },
        }
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compare_depth")
def compare_depth(req: CompareDepthRequest):
    """Build a Unary-only vs Full-CRF depth comparison grid (Liu et al. CVPR 2015)."""
    try:
        img = _decode_image(req.image)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        import numpy as np
        from fractal_3d.neural_depth import estimate_depth_compare
        from fractal_3d import viz
        method = "pseudo" if (req.depth_method or "").lower() == "mathematical" else "auto"
        cmp = estimate_depth_compare(
            np.asarray(img),
            method=method,
            unary_source=req.unary_source,
            fractal_aware=req.fractal_aware,
            eta=req.eta,
        )
        grid = viz.depth_comparison_grid(
            cmp["image"], cmp["depth_unary"], cmp["depth_crf"], cmp["depth_da"],
            depth_make3d=cmp.get("depth_make3d"),
            da_available=cmp.get("da_available", False),
            unary_source=cmp.get("unary_source", ""),
            fractal_aware=cmp.get("fractal_aware", False))
        return {
            "comparison_grid": (grid or {}).get("data", ""),
            "method_used": cmp.get("method_used", ""),
            "unary_source": cmp.get("unary_source", ""),
            "fractal_aware": cmp.get("fractal_aware", False),
            "crf_params": cmp.get("crf_params", {}),
            "da_available": cmp.get("da_available", False),
            "metrics": cmp.get("metrics", {}),
        }
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ablation")
def ablation(req: AblationRequest):
    """Ablation over pairwise similarities (Liu et al. Table 2 style)."""
    try:
        img = _decode_image(req.image)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        import numpy as np
        from fractal_3d.neural_depth import estimate_depth_ablation
        from fractal_3d import viz
        results = estimate_depth_ablation(
            np.asarray(img),
            unary_source=req.unary_source,
            include_fractal=req.fractal_aware,
            eta=req.eta,
        )
        grid = viz.ablation_grid(np.asarray(img), results)
        table = [{"name": r["name"], "active": r["active"],
                  "fractal_aware": r.get("fractal_aware", False),
                  "unary_source": r.get("unary_source", ""),
                  "metrics": r["metrics"]}
                 for r in results]
        return {"ablation_grid": grid or "", "table": table}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _resolve_model_loaded(), "version": "1.0.0"}


@app.post("/feedback")
def feedback(req: FeedbackRequest):
    try:
        img = _decode_image(req.image)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        label = req.correct_type.strip() or "unknown"
        # Sanitize label to a safe folder name.
        safe = "".join(c for c in label if c.isalnum() or c in ("_", "-")).strip("_-")
        safe = safe or "unknown"
        target_dir = os.path.join(FEEDBACK_DIR, safe)
        os.makedirs(target_dir, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        path = os.path.join(target_dir, f"{ts}.png")
        img.save(path, "PNG")
        count = len([f for f in os.listdir(target_dir) if f.lower().endswith(".png")])
        return {"saved": True, "path": path, "count": count}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# Entrypoint
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Fractal 2D->3D FastAPI server")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
