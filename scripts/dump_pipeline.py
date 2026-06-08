"""Dump the depth-estimation pipeline stages as PNGs + a manifest.

Usage:
    python scripts/dump_pipeline.py --input sample_fractal.png --out fractal_3d/output/pipeline_demo/

Produces 01..08 PNG stage images (via estimate_depth(dump_dir=...)) plus
manifest.json describing each stage (RU title + short description).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

# allow running as a script from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fractal_3d.neural_depth import estimate_depth  # noqa: E402

_MANIFEST = [
    ("01_input.png", "Вход: 2D-изображение",
     "Исходное изображение, из которого восстанавливаем карту глубины."),
    ("02_slic.png", "SLIC-сегментация",
     "Разбиваем вход на ~сотни суперпикселей — компактных однородных регионов."),
    ("03_raw_depth.png", "Сырой depth (unary z)",
     "Грубая глубина из Depth Anything V2 (или pseudo-cues / shape-from-shading)."),
    ("04_unary_z.png", "Медиана по суперпикселям",
     "z_p — медианная глубина внутри каждого суперпикселя (узловой потенциал CRF)."),
    ("05_crf_depth.png", "CRF-решение y* = A⁻¹z",
     "Глубина после решения системы A=I+D−R: pairwise-связи сглаживают между похожими регионами."),
    ("06_guided.png", "Guided filter + edge-aware",
     "Убираем ступеньки суперпикселей, сохраняя границы изображения."),
    ("07_final_depth.png", "Финальная карта глубины 256×256",
     "Итоговый depth map с цветовой шкалой — вход для 3D-реконструкции."),
    ("08_mesh_preview.png", "3D-предпросмотр",
     "Карта глубины как 3D-поверхность (heightmap / marching cubes)."),
    ("09_rpq_weights.png", "Карта pairwise-весов R_pq",
     "Сила связей CRF: где соседние суперпиксели притягиваются к одной глубине (Σ R_pq)."),
    ("10_fractal_prior.png", "Фрактальный приор h",
     "h = 0.5·фрактальная размерность + 0.25·текстура + 0.25·градиент (расширение fractal-aware)."),
]


def main():
    ap = argparse.ArgumentParser(description="Dump depth pipeline stages")
    ap.add_argument("--input", required=True, help="input image path")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--method", default="auto", choices=["auto", "depth_anything", "pseudo"])
    args = ap.parse_args()

    img = np.asarray(Image.open(args.input).convert("RGB"))
    os.makedirs(args.out, exist_ok=True)

    print(f"[dump] estimating depth for {args.input} -> {args.out}")
    estimate_depth(img, method=args.method, dump_dir=args.out)

    manifest = [{"file": f, "title": t, "desc": d} for f, t, d in _MANIFEST
                if os.path.exists(os.path.join(args.out, f))]
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)

    produced = sorted(p for p in os.listdir(args.out) if p.endswith(".png"))
    print(f"[dump] wrote {len(produced)} PNGs + manifest.json: {produced}")


if __name__ == "__main__":
    main()
