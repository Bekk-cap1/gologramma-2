"""Субагент математического анализа — Claude Sonnet.

Модель (опционально): claude-sonnet-4-6
Роль: выполнить все 5 математических методов Слоя 1.

CRITICAL: the real work is done locally by run_subagent_math() which calls the
layer1 functions directly. The Anthropic agentic loop is kept (guarded) but is
purely an optional coordinator — it is never required for the core path.
"""
from __future__ import annotations

import json

import numpy as np
from PIL import Image

from ..common import to_gray
from ..layer1_math import (
    analyze_fourier,
    compute_box_counting,
    compute_lacunarity,
    compute_multifractal,
    recover_ifs,
)

try:  # the SDK is optional — local mode never needs it
    import anthropic
except ImportError:  # pragma: no cover - exercised only when SDK missing
    anthropic = None


MATH_AGENT_SYSTEM = """
Ты — субагент математического анализа фракталов.
Твоя модель: Claude Sonnet.
Ты получаешь изображение и запускаешь 5 математических методов:
1. box_counting   -> фрактальная размерность D
2. ifs_recovery   -> аффинные преобразования (IFS)
3. fourier        -> частотный спектр
4. lacunarity     -> заполненность пространства
5. multifractal   -> спектр размерностей f(alpha)

После получения всех результатов сделай предварительный вывод о типе
фрактала с confidence. Отвечай строго в JSON формате.
"""

MATH_TOOLS = [
    {
        "name": "run_box_counting",
        "description": "Вычислить фрактальную размерность через box-counting",
        "input_schema": {
            "type": "object",
            "properties": {"image_array": {"type": "string", "description": "numpy array как JSON"}},
            "required": ["image_array"],
        },
    },
    {
        "name": "run_ifs_recovery",
        "description": "Восстановить IFS преобразования из изображения",
        "input_schema": {
            "type": "object",
            "properties": {"image_array": {"type": "string"}},
            "required": ["image_array"],
        },
    },
    {
        "name": "run_fourier",
        "description": "Частотный анализ изображения",
        "input_schema": {
            "type": "object",
            "properties": {"image_array": {"type": "string"}},
            "required": ["image_array"],
        },
    },
    {
        "name": "run_lacunarity",
        "description": "Вычислить лакунарность изображения",
        "input_schema": {
            "type": "object",
            "properties": {"image_array": {"type": "string"}},
            "required": ["image_array"],
        },
    },
    {
        "name": "run_multifractal",
        "description": "Мультифрактальный спектр f(alpha)",
        "input_schema": {
            "type": "object",
            "properties": {"image_array": {"type": "string"}},
            "required": ["image_array"],
        },
    },
]


def _load_gray(tool_input: dict) -> np.ndarray:
    """Accept image_path or an in-memory image and return a grayscale ndarray."""
    if tool_input.get("image") is not None:
        return to_gray(tool_input["image"])
    return to_gray(tool_input["image_path"])


def _preliminary_type(box, ifs, fourier, lacun, multi) -> tuple[str, float]:
    """Combine the per-method hints into a single preliminary type + confidence."""
    votes: dict[str, float] = {}
    pairs = [
        (box.get("fractal_type_hint"), box.get("confidence", 0.0)),
        (ifs.get("ifs_type"), ifs.get("confidence", 0.0)),
        (fourier.get("fractal_hint"), fourier.get("confidence", 0.0)),
        (lacun.get("fractal_hint"), lacun.get("confidence", 0.0)),
        (multi.get("fractal_hint"), multi.get("confidence", 0.0)),
    ]
    for hint, conf in pairs:
        if hint:
            votes[hint] = votes.get(hint, 0.0) + float(conf)
    if not votes:
        confs = [c for _, c in pairs if c]
        return "unknown", float(np.mean(confs)) if confs else 0.0
    best = max(votes, key=votes.get)
    total = sum(votes.values())
    confidence = votes[best] / total if total else 0.0
    return best, float(confidence)


def run_subagent_math(tool_input: dict) -> dict:
    """LOCAL core path — called by the orchestrator. Runs all 5 math methods.

    Returns box_counting, ifs_recovery, fourier, lacunarity, multifractal plus a
    preliminary_type and an aggregate confidence.
    """
    gray = _load_gray(tool_input)

    box = compute_box_counting(gray)
    ifs = recover_ifs(gray)
    fourier = analyze_fourier(gray)
    lacun = compute_lacunarity(gray)
    multi = compute_multifractal(gray)

    prelim_type, confidence = _preliminary_type(box, ifs, fourier, lacun, multi)

    return {
        "box_counting": box,
        "ifs_recovery": ifs,
        "fourier": fourier,
        "lacunarity": lacun,
        "multifractal": multi,
        "preliminary_type": prelim_type,
        "confidence": confidence,
    }


# --------------------------------------------------------------------------- #
# Optional Anthropic agentic loop (coordinator only — never required locally). #
# --------------------------------------------------------------------------- #
def run_subagent_math_llm(tool_input: dict, client=None) -> dict:
    """Sonnet agentic loop variant. Falls back to LOCAL mode on any failure."""
    if anthropic is None:
        return run_subagent_math(tool_input)
    try:
        client = client or anthropic.Anthropic()
        image = Image.open(tool_input["image_path"]).convert("L").resize((256, 256))
        img_array = np.array(image)
        img_json = json.dumps(img_array.tolist())

        messages = [{
            "role": "user",
            "content": (
                "Выполни полный математический анализ фрактала. Запусти все 5 "
                "методов последовательно и верни сводный JSON с результатами и "
                "предварительным типом фрактала.\n\n"
                f"Image array (256x256 grayscale, truncated):\n{img_json[:500]}..."
            ),
        }]

        def handle(name: str, inp: dict) -> dict:
            arr = np.array(json.loads(inp["image_array"]))
            if name == "run_box_counting":
                return compute_box_counting(arr)
            if name == "run_ifs_recovery":
                return recover_ifs(arr)
            if name == "run_fourier":
                return analyze_fourier(arr)
            if name == "run_lacunarity":
                return compute_lacunarity(arr)
            if name == "run_multifractal":
                return compute_multifractal(arr)
            return {}

        while True:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=MATH_AGENT_SYSTEM,
                tools=MATH_TOOLS,
                messages=messages,
            )
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                for block in response.content:
                    if getattr(block, "type", None) == "text":
                        try:
                            return json.loads(block.text)
                        except Exception:
                            return run_subagent_math(tool_input)
                return run_subagent_math(tool_input)

            if response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result = handle(block.name, block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, default=str),
                        })
                messages.append({"role": "user", "content": tool_results})
    except Exception:
        return run_subagent_math(tool_input)
