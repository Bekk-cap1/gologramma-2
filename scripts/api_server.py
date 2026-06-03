"""
Этап 2b: FastAPI сервер — принимает изображение, возвращает тип фрактала + параметры.
Фронтенд вызывает: POST http://localhost:8000/predict  { image: base64 }

Запуск:
  pip install fastapi uvicorn torch torchvision pillow python-multipart
  python api_server.py --model ./model/best_model.pt --port 8000
"""

import argparse, base64, io, os, sys
from typing import Optional

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
}

# ──────────────────────────────────────────────────────────────────────────────
# Global model handle
# ──────────────────────────────────────────────────────────────────────────────
model: Optional[FractalCNN] = None
device: torch.device = torch.device("cpu")
param_means: torch.Tensor = PARAM_MEANS
param_stds:  torch.Tensor = PARAM_STDS

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


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if model is None:
        raise HTTPException(503, "Model not loaded")

    # Decode image
    try:
        img_bytes = base64.b64decode(req.image)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(400, f"Invalid image: {e}")

    # Inference
    tensor = transform(img).unsqueeze(0).to(device)
    with torch.no_grad():
        logits, pred_params = model(tensor)
        probs = F.softmax(logits, dim=1)[0]
        pred_idx = probs.argmax().item()
        confidence = probs[pred_idx].item() * 100

        # Un-normalise parameters
        params_raw = pred_params[0] * param_stds.to(device) + param_means.to(device)

    ftype = FRACTAL_CLASSES[pred_idx]
    all_scores = {FRACTAL_CLASSES[i]: round(probs[i].item() * 100, 2) for i in range(NUM_CLASSES)}

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
    global model, device
    ckpt_path = os.environ.get("MODEL_PATH", "./model/best_model.pt")
    if not os.path.exists(ckpt_path):
        print(f"[WARN] Model not found at {ckpt_path} — running without CNN (heuristic only)")
        return
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(ckpt_path, map_location=device)
    model = FractalCNN()
    model.load_state_dict(ckpt["state_dict"])
    model.eval().to(device)
    print(f"[OK] Model loaded from {ckpt_path}  |  device={device}  |  best_acc={ckpt.get('acc', '?'):.4f}")


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
