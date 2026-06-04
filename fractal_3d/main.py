"""Entry point for the multi-agent fractal 2D->3D system.

Usage:
    python -m fractal_3d.main [<image_path>] [--llm]

If no image path is given, a Sierpinski triangle test image is generated and
saved to a temp PNG first. Runs in LOCAL mode by default (no API key needed);
pass --llm to attempt the Anthropic Opus agentic loop (auto-falls back to local).

Writes fractal_3d/output/result.json with the final spec JSON.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

from .agents.orchestrator import orchestrate

OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def _make_test_image() -> str:
    """Generate a Sierpinski triangle test image and return its path."""
    import numpy as np
    from PIL import Image

    from .reference_fractals import sierpinski_triangle

    arr = (np.asarray(sierpinski_triangle()) * 255).astype("uint8")
    path = os.path.join(tempfile.gettempdir(), "sierpinski_test.png")
    Image.fromarray(arr).save(path)
    return path


def main(argv: list[str] | None = None) -> dict:
    argv = list(sys.argv[1:] if argv is None else argv)
    use_llm = "--llm" in argv
    argv = [a for a in argv if a != "--llm"]

    if argv:
        image_path = argv[0]
    else:
        image_path = _make_test_image()
        print(f"[System] No image given — generated test Sierpinski triangle: {image_path}")

    print("[System] Запуск мульти-агентной системы")
    print("[System] Оркестратор: Claude Opus 4.6")
    print("[System] Субагенты:   Claude Sonnet 4.6 x 3")
    print(f"[System] Режим:       {'LLM (Opus agentic loop)' if use_llm else 'LOCAL (no API key)'}")
    print(f"[System] Входное изображение: {image_path}")
    print("-" * 50)

    result = orchestrate(image_path, use_llm=use_llm)

    print("-" * 50)
    print(f"[Opus] Финальный тип: {result['final_type']}")
    print(f"[Opus] Уверенность:   {result['confidence']:.1%}")
    print(f"[Opus] Верификация:   {result['verification_score']:.1%}")
    print(f"[Opus] Depth map:     {result['depth_map_path']}")
    print(f"[Opus] 3D файл:       {result['mesh_path']}")
    print(f"[Opus] Рассуждение:   {result['reasoning']}")

    if result.get("low_confidence"):
        print("[Opus] ! НИЗКАЯ УВЕРЕННОСТЬ — результат может быть неточным")

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / "result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print("-" * 50)
    print(f"[System] Результат сохранён: {out_path}")
    return result


if __name__ == "__main__":
    main()
