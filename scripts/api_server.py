"""
Этап 2b: FastAPI сервер — принимает изображение, возвращает тип фрактала + параметры.
Фронтенд вызывает: POST http://localhost:8000/predict  { image: base64 }

Запуск:
  pip install fastapi uvicorn torch torchvision pillow python-multipart
  python api_server.py --model ./model/best_model.pt --port 8000
"""

import argparse, base64, io, os, sys
from typing import Optional

import numpy as np
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Import model from train_cnn.py (same directory)
sys.path.insert(0, os.path.dirname(__file__))
from train_cnn import FractalCNN, FRACTAL_CLASSES, PARAM_MEANS, PARAM_STDS, NUM_CLASSES, NUM_PARAMS

# ──────────────────────────────────────────────────────────────────────────────
# 3D analogs mapping (type → 3D model name)
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

# ──────────────────────────────────────────────────────────────────────────────
# Global model handle
# ──────────────────────────────────────────────────────────────────────────────
model: Optional[FractalCNN] = None
device: torch.device = torch.device("cpu")
param_means: torch.Tensor = PARAM_MEANS
param_stds:  torch.Tensor = PARAM_STDS
model_classes = list(FRACTAL_CLASSES)

transform = T.Compose([
    T.Resize((128, 128)),
    T.ToTensor(),
    T.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
])

# ──────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Fractal CNN API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    image: str  # base64-encoded PNG/JPG


class PredictResponse(BaseModel):
    type: str
    type_3d: str
    confidence: float       # 0-100
    c_real: float
    c_imag: float
    zoom: float
    iterations: int
    all_scores: dict        # {type: score}


def score_dict_for(ftype: str, confidence: float) -> dict:
    classes = list(dict.fromkeys([*model_classes, "circle", "square"]))
    scores = {c: 0.0 for c in classes}
    scores[ftype] = round(confidence, 2)
    return scores


def classify_simple_shape(img: Image.Image) -> Optional[tuple[str, float]]:
    gray = np.asarray(
        img.resize((128, 128), Image.Resampling.BILINEAR).convert("L"),
        dtype=np.float32,
    ) / 255.0

    border = np.concatenate([gray[0], gray[-1], gray[:, 0], gray[:, -1]])
    bg = float(np.median(border))
    mask = np.abs(gray - bg) > 0.20

    area = int(mask.sum())
    if area < 128 * 128 * 0.03:
        return None

    ys, xs = np.where(mask)
    min_x, max_x = int(xs.min()), int(xs.max())
    min_y, max_y = int(ys.min()), int(ys.max())
    bbox_w = max_x - min_x + 1
    bbox_h = max_y - min_y + 1
    if bbox_w < 16 or bbox_h < 16:
        return None

    aspect = bbox_w / bbox_h
    if not 0.75 <= aspect <= 1.35:
        return None

    mid_x = (min_x + max_x) / 2
    mid_y = (min_y + max_y) / 2
    left = int((xs < mid_x).sum())
    right = max(1, int((xs >= mid_x).sum()))
    top = int((ys < mid_y).sum())
    bottom = max(1, int((ys >= mid_y).sum()))
    h_sym = min(left, right) / max(left, right)
    v_sym = min(top, bottom) / max(top, bottom)
    if h_sym < 0.78 or v_sym < 0.78:
        return None

    fill = area / (bbox_w * bbox_h)
    nx = (xs - mid_x) / max(1.0, bbox_w / 2)
    ny = (ys - mid_y) / max(1.0, bbox_h / 2)
    radius = np.sqrt(nx * nx + ny * ny)
    max_norm = np.maximum(np.abs(nx), np.abs(ny))

    radius_mean = float(radius.mean())
    max_norm_mean = float(max_norm.mean())
    circle_edge = 1.0 - float(radius.std()) / max(radius_mean, 1e-6)
    square_edge = 1.0 - float(max_norm.std()) / max(max_norm_mean, 1e-6)

    if fill >= 0.86:
        return "square", min(98.0, 88.0 + (fill - 0.86) * 60)
    if 0.55 <= fill <= 0.84:
        return "circle", min(97.0, 86.0 + (1.0 - abs(fill - 0.72)) * 10)
    if fill < 0.55:
        if circle_edge > square_edge + 0.04 and circle_edge > 0.72:
            return "circle", min(94.0, 80.0 + circle_edge * 14)
        if square_edge > circle_edge + 0.04 and square_edge > 0.72:
            return "square", min(94.0, 80.0 + square_edge * 14)

    return None


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None, "classes": model_classes}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    # Decode image
    try:
        img_bytes = base64.b64decode(req.image)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(400, f"Invalid image: {e}")

    simple_shape = classify_simple_shape(img)
    if simple_shape is not None:
        ftype, confidence = simple_shape
        return PredictResponse(
            type=ftype,
            type_3d=TYPE_TO_3D[ftype],
            confidence=round(confidence, 2),
            c_real=0.0,
            c_imag=0.0,
            zoom=1.0,
            iterations=1,
            all_scores=score_dict_for(ftype, confidence),
        )

    if model is None:
        raise HTTPException(503, "Model not loaded")

    # Inference
    tensor = transform(img).unsqueeze(0).to(device)
    with torch.no_grad():
        logits, pred_params = model(tensor)
        probs = F.softmax(logits, dim=1)[0]
        pred_idx = probs.argmax().item()
        confidence = probs[pred_idx].item() * 100

        # Un-normalise parameters
        params_raw = pred_params[0] * param_stds.to(device) + param_means.to(device)

    classes = model_classes
    ftype = classes[pred_idx]
    all_scores = {classes[i]: round(probs[i].item() * 100, 2) for i in range(len(classes))}

    return PredictResponse(
        type=ftype,
        type_3d=TYPE_TO_3D.get(ftype, ftype),
        confidence=round(confidence, 2),
        c_real=round(params_raw[0].item(), 5),
        c_imag=round(params_raw[1].item(), 5),
        zoom=round(max(0.1, params_raw[2].item()), 4),
        iterations=int(max(50, params_raw[3].item())),
        all_scores=all_scores,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Startup / shutdown
# ──────────────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def load_model():
    global model, device, model_classes
    ckpt_path = os.environ.get("MODEL_PATH", "./model/best_model.pt")
    if not os.path.exists(ckpt_path):
        print(f"[WARN] Model not found at {ckpt_path} — running without CNN (heuristic only)")
        return
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(ckpt_path, map_location=device)
    state_dict = ckpt.get("state_dict", ckpt) if isinstance(ckpt, dict) else ckpt
    ckpt_classes = ckpt.get("classes") if isinstance(ckpt, dict) else None
    if not ckpt_classes:
        cls_weight = state_dict.get("cls_head.3.weight")
        out_classes = int(cls_weight.shape[0]) if cls_weight is not None else len(FRACTAL_CLASSES)
        ckpt_classes = FRACTAL_CLASSES[:out_classes]

    candidate = FractalCNN(num_classes=len(ckpt_classes))
    try:
        candidate.load_state_dict(state_dict)
    except RuntimeError as e:
        print(f"[WARN] Could not load CNN checkpoint at {ckpt_path}: {e}")
        print("[WARN] Running simple circle/square detection only until the model is retrained.")
        model = None
        return

    model = candidate
    model_classes = list(ckpt_classes)
    model.eval().to(device)
    acc = ckpt.get("acc") if isinstance(ckpt, dict) else None
    acc_msg = f"  |  best_acc={acc:.4f}" if isinstance(acc, (int, float)) else ""
    print(f"[OK] Model loaded from {ckpt_path}  |  device={device}  |  classes={len(model_classes)}{acc_msg}")


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="./model/best_model.pt")
    parser.add_argument("--port",  type=int, default=8000)
    parser.add_argument("--host",  default="0.0.0.0")
    args = parser.parse_args()

    os.environ["MODEL_PATH"] = args.model
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
