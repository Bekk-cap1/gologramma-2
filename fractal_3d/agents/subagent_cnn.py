"""Субагент CNN классификации — Claude Sonnet.

Модель (опционально): claude-sonnet-4-6
Роль: загрузить обученную модель, предсказать тип, вернуть embedding.

CRITICAL: the real work is done locally by run_subagent_cnn() which calls
layer2_cnn.classify() directly. The Anthropic agentic loop is optional.
"""
from __future__ import annotations

import json

from ..layer2_cnn import classify

try:
    import anthropic
except ImportError:  # pragma: no cover
    anthropic = None


CNN_AGENT_SYSTEM = """
Ты — субагент CNN классификации фракталов.
Твоя модель: Claude Sonnet.

Ты получаешь изображение и математические подсказки от math агента.
Твои задачи:
1. Загрузить обученную CNN модель
2. Предсказать тип фрактала
3. Получить embedding вектор для ensemble
4. Скорректировать предсказание с учётом math_hints
5. Вернуть финальный тип с confidence

Если math_hints сильно противоречат CNN — укажи это явно.
Отвечай строго в JSON.
"""

CNN_TOOLS = [
    {
        "name": "load_and_predict",
        "description": "Загрузить CNN модель и сделать предсказание",
        "input_schema": {
            "type": "object",
            "properties": {
                "image_path": {"type": "string"},
                "weights_path": {"type": "string"},
            },
            "required": ["image_path"],
        },
    },
    {
        "name": "cross_check_with_math",
        "description": "Сравнить CNN предсказание с математическими подсказками",
        "input_schema": {
            "type": "object",
            "properties": {
                "cnn_prediction": {"type": "string"},
                "cnn_confidence": {"type": "number"},
                "math_hints": {"type": "object"},
            },
            "required": ["cnn_prediction", "math_hints"],
        },
    },
]


def run_subagent_cnn(tool_input: dict) -> dict:
    """LOCAL core path — called by the orchestrator.

    Returns predicted_class, confidence, all_probs, embedding, available and an
    optional math_agreement flag when math_hints are supplied.
    """
    image = tool_input.get("image")
    if image is None:
        image = tool_input["image_path"]

    result = classify(image, weights=tool_input.get("weights_path"))

    out = {
        "predicted_class": result["class"],
        "confidence": result["confidence"],
        "all_probs": result["all_probs"],
        "embedding": result["embedding"],
        "available": result["available"],
    }

    math_hints = tool_input.get("math_hints")
    if math_hints:
        prelim = str(math_hints.get("preliminary_type", "")) if isinstance(math_hints, dict) else ""
        agreement = bool(prelim) and prelim == out["predicted_class"]
        out["math_agreement"] = agreement
        if out["available"]:
            out["confidence"] = float(min(1.0, out["confidence"] * (1.1 if agreement else 0.9)))

    return out


# --------------------------------------------------------------------------- #
# Optional Anthropic agentic loop (coordinator only).                          #
# --------------------------------------------------------------------------- #
def run_subagent_cnn_llm(tool_input: dict, client=None) -> dict:
    """Sonnet agentic loop variant. Falls back to LOCAL mode on any failure."""
    if anthropic is None:
        return run_subagent_cnn(tool_input)
    try:
        client = client or anthropic.Anthropic()
        messages = [{
            "role": "user",
            "content": (
                "Выполни CNN классификацию фрактала.\n"
                f"image_path: {tool_input['image_path']}\n"
                f"math_hints: {json.dumps(tool_input.get('math_hints', {}), default=str)}\n\n"
                "Загрузи модель, сделай предсказание, сравни с math_hints."
            ),
        }]

        def handle(name: str, inp: dict) -> dict:
            if name == "load_and_predict":
                r = classify(inp["image_path"], weights=inp.get("weights_path"))
                return {
                    "predicted_class": r["class"],
                    "confidence": r["confidence"],
                    "all_probs": r["all_probs"],
                    "embedding": r["embedding"],
                    "available": r["available"],
                }
            if name == "cross_check_with_math":
                agreement = inp["cnn_prediction"] in str(inp.get("math_hints", {}))
                return {
                    "agreement": agreement,
                    "final_confidence": inp.get("cnn_confidence", 0.0) * (1.1 if agreement else 0.85),
                }
            return {}

        while True:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=CNN_AGENT_SYSTEM,
                tools=CNN_TOOLS,
                messages=messages,
            )
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                for block in response.content:
                    if getattr(block, "type", None) == "text":
                        try:
                            return json.loads(block.text)
                        except Exception:
                            return run_subagent_cnn(tool_input)
                return run_subagent_cnn(tool_input)

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
        return run_subagent_cnn(tool_input)
