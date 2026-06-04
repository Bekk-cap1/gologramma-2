"""Главный оркестратор — Claude Opus.

Модель (опционально): claude-opus-4-6
Роль: декомпозиция, координация субагентов, финальное решение, верификация.

Two execution modes:
  * use_llm=False (DEFAULT, no API key needed): runs the three subagents in
    sequence LOCALLY, applies layer3 voting, runs layer4 verification and
    assembles the spec's final JSON itself.
  * use_llm=True: drives the Anthropic Opus agentic tool-use loop with the
    SUBAGENT_TOOLS schema. Falls back to LOCAL mode if anthropic is not
    installed or no/invalid API key is configured.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import numpy as np
from PIL import Image

from ..common import get_logger, to_gray
from ..layer3_fusion import vote
from ..layer4_verify import compare, render_topdown, synthesize
from .subagent_cnn import run_subagent_cnn
from .subagent_depth_mesh import run_subagent_depth_mesh
from .subagent_math import run_subagent_math

try:
    import anthropic
except ImportError:  # pragma: no cover - exercised only when SDK missing
    anthropic = None

log = get_logger()

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

CONF_THRESHOLD = 0.75

ORCHESTRATOR_SYSTEM = """
Ты — главный оркестратор системы распознавания и реконструкции фракталов.
Твоя модель: Claude Opus. Ты управляешь тремя субагентами Sonnet.

Твои обязанности:
1. Принять входное изображение фрактала
2. Декомпозировать задачу на 3 параллельных потока
3. Запустить субагентов через инструменты
4. Собрать их результаты
5. Применить weighted voting (layer3_fusion)
6. Запустить верификацию (layer4_verify)
7. Вернуть финальный результат с confidence

Ты принимаешь ФИНАЛЬНОЕ решение на основе всех данных.
Если субагенты противоречат друг другу — ты арбитр.
Если confidence < 0.75 — явно сообщи об этом.

Формат финального ответа — строго JSON:
{
  "final_type": str,
  "confidence": float,
  "is_escape_time": bool,
  "ifs_transforms": list,
  "depth_map_path": str,
  "mesh_path": str,
  "verification_score": float,
  "low_confidence": bool,
  "agent_results": {"math": dict, "cnn": dict, "depth_mesh": dict},
  "reasoning": str
}
"""

SUBAGENT_TOOLS = [
    {
        "name": "run_math_agent",
        "description": "Запустить субагент математического анализа (Sonnet). Выполняет box-counting, IFS recovery, Fourier, Lacunarity, Multifractal анализ.",
        "input_schema": {
            "type": "object",
            "properties": {
                "image_path": {"type": "string", "description": "Путь к изображению"},
                "image_base64": {"type": "string", "description": "Base64 изображения"},
            },
            "required": ["image_path"],
        },
    },
    {
        "name": "run_cnn_agent",
        "description": "Запустить субагент CNN классификации (Sonnet). Загружает модель и предсказывает тип фрактала с embedding.",
        "input_schema": {
            "type": "object",
            "properties": {
                "image_path": {"type": "string"},
                "math_hints": {"type": "object", "description": "Подсказки от math агента"},
            },
            "required": ["image_path"],
        },
    },
    {
        "name": "run_depth_mesh_agent",
        "description": "Запустить субагент построения depth map и 3D mesh (Sonnet). Строит depth map и генерирует OBJ файл.",
        "input_schema": {
            "type": "object",
            "properties": {
                "image_path": {"type": "string"},
                "fractal_type": {"type": "string"},
                "ifs_transforms": {"type": "array"},
                "is_escape_time": {"type": "boolean"},
                "output_dir": {"type": "string"},
            },
            "required": ["image_path", "fractal_type", "is_escape_time"],
        },
    },
    {
        "name": "run_verification",
        "description": "Запустить верификацию (layer4). Рендерит 3D обратно в 2D и сравнивает с входом.",
        "input_schema": {
            "type": "object",
            "properties": {
                "original_image_path": {"type": "string"},
                "mesh_path": {"type": "string"},
                "fractal_type": {"type": "string"},
            },
            "required": ["original_image_path", "mesh_path"],
        },
    },
]


# --------------------------------------------------------------------------- #
# Helpers shared by both modes                                                 #
# --------------------------------------------------------------------------- #
def _math_results_to_vote_input(math_res: dict, cnn_res: dict) -> dict:
    """Adapt subagent outputs into the dict shape expected by layer3 vote()."""
    results = {
        "box_counting": math_res["box_counting"],
        "ifs_recovery": math_res["ifs_recovery"],
        "fourier": math_res["fourier"],
        "lacunarity": math_res["lacunarity"],
        "multifractal": math_res["multifractal"],
    }
    if cnn_res.get("available"):
        results["cnn"] = {
            "class": cnn_res["predicted_class"],
            "confidence": cnn_res["confidence"],
            "available": True,
            "embedding": cnn_res.get("embedding", []),
        }
    return results


def _run_verification(image, decision: dict) -> dict:
    synth = synthesize(decision, n_points=50000)
    render = render_topdown(synth)
    return compare(image, render)


def _assemble(decision: dict, math_res: dict, cnn_res: dict, dm_res: dict,
              verification: dict, reasoning: str) -> dict:
    confidence = float(decision["final_confidence"])
    return {
        "final_type": decision["final_type"],
        "confidence": confidence,
        "is_escape_time": bool(decision["is_escape_time"]),
        "ifs_transforms": decision["ifs_transforms"],
        "depth_map_path": dm_res.get("depth_map_path", ""),
        "mesh_path": dm_res.get("mesh_path", dm_res.get("obj_path", "")),
        "verification_score": float(verification.get("similarity", 0.0)),
        "low_confidence": bool(decision.get("low_confidence_flag", confidence < CONF_THRESHOLD)),
        "agent_results": {
            "math": math_res,
            "cnn": cnn_res,
            "depth_mesh": dm_res,
        },
        "reasoning": reasoning,
    }


# --------------------------------------------------------------------------- #
# LOCAL mode (default, no API key)                                             #
# --------------------------------------------------------------------------- #
def orchestrate_local(image_path: str, basename: str = "fractal") -> dict:
    """Run the three subagents sequentially and assemble the final JSON."""
    image = to_gray(image_path)

    log.info("[Opus/local] -> run_math_agent")
    math_res = run_subagent_math({"image_path": image_path, "image": image})
    log.info("[Opus/local]    math preliminary_type=%s conf=%.3f",
             math_res["preliminary_type"], math_res["confidence"])

    log.info("[Opus/local] -> run_cnn_agent")
    cnn_res = run_subagent_cnn({
        "image_path": image_path,
        "image": image,
        "math_hints": {"preliminary_type": math_res["preliminary_type"]},
    })
    log.info("[Opus/local]    cnn=%s conf=%.3f available=%s",
             cnn_res["predicted_class"], cnn_res["confidence"], cnn_res["available"])

    # layer3 weighted voting -> final decision
    decision = vote(_math_results_to_vote_input(math_res, cnn_res))
    decision["box_counting_dimension"] = math_res["box_counting"].get("dimension", 0.0)
    log.info("[Opus/local] -> vote: %s (cat=%s) conf=%.3f escape=%s low=%s",
             decision["final_type"], decision["final_category"],
             decision["final_confidence"], decision["is_escape_time"],
             decision["low_confidence_flag"])

    log.info("[Opus/local] -> run_depth_mesh_agent")
    dm_res = run_subagent_depth_mesh({
        "image_path": image_path,
        "image": image,
        "fractal_type": decision["final_type"],
        "is_escape_time": decision["is_escape_time"],
        "ifs_transforms": decision["ifs_transforms"],
        "output_dir": str(OUTPUT_DIR),
        "basename": basename,
        "metadata": {
            "fractal_dimension": round(decision.get("box_counting_dimension", 0.0), 4),
            "confidence": decision["final_confidence"],
        },
    })
    log.info("[Opus/local]    mesh=%s faces=%d", dm_res.get("mesh_path"), dm_res.get("n_faces", 0))

    log.info("[Opus/local] -> run_verification")
    verification = _run_verification(image, decision)
    log.info("[Opus/local]    verification similarity=%.3f verified=%s",
             verification.get("similarity", 0.0), verification.get("verified"))

    agree = (cnn_res.get("available") and
             cnn_res["predicted_class"] == decision["final_type"])
    reasoning = (
        f"Math agent predicted '{math_res['preliminary_type']}' "
        f"(conf={math_res['confidence']:.2f}); "
        f"CNN agent predicted '{cnn_res['predicted_class']}' "
        f"(conf={cnn_res['confidence']:.2f}, available={cnn_res['available']}). "
        f"Weighted voting (layer3) selected '{decision['final_type']}' "
        f"[{decision['final_category']}] with agreement_score="
        f"{decision.get('agreement_score', 0.0):.2f}; math/CNN "
        f"{'agree' if agree else 'disagree'}. "
        f"Depth+mesh built {dm_res.get('n_faces', 0)} faces; "
        f"verification similarity={verification.get('similarity', 0.0):.2f}."
    )
    if decision.get("low_confidence_flag"):
        reasoning += " WARNING: confidence below threshold (0.75) — result may be inaccurate."

    return _assemble(decision, math_res, cnn_res, dm_res, verification, reasoning)


# --------------------------------------------------------------------------- #
# LLM mode (optional Opus agentic loop)                                        #
# --------------------------------------------------------------------------- #
def _handle_tool_call(tool_name: str, tool_input: dict, image_path: str,
                      shared: dict) -> dict:
    """Real execution of orchestrator tools — runs the local subagents."""
    if tool_name == "run_math_agent":
        res = run_subagent_math({"image_path": tool_input.get("image_path", image_path)})
        shared["math"] = res
        return res
    if tool_name == "run_cnn_agent":
        res = run_subagent_cnn({
            "image_path": tool_input.get("image_path", image_path),
            "math_hints": tool_input.get("math_hints"),
        })
        shared["cnn"] = res
        return res
    if tool_name == "run_depth_mesh_agent":
        ti = dict(tool_input)
        ti.setdefault("image_path", image_path)
        ti.setdefault("output_dir", str(OUTPUT_DIR))
        res = run_subagent_depth_mesh(ti)
        shared["depth_mesh"] = res
        return res
    if tool_name == "run_verification":
        # Re-run verification against the current best decision if available.
        decision = shared.get("decision")
        if decision is not None:
            verification = _run_verification(to_gray(image_path), decision)
            shared["verification"] = verification
            return verification
        return {"similarity": 0.0, "verified": False}
    return {"error": f"Unknown tool: {tool_name}"}


def orchestrate_llm(image_path: str) -> dict:
    """Anthropic Opus agentic loop. Falls back to LOCAL mode on any failure."""
    if anthropic is None:
        log.warning("[Opus] anthropic SDK not installed — falling back to LOCAL mode")
        return orchestrate_local(image_path)

    try:
        client = anthropic.Anthropic()
        image_b64 = base64.b64encode(Path(image_path).read_bytes()).decode()
        shared: dict = {}

        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": "image/png", "data": image_b64}},
                {"type": "text", "text": (
                    "Проанализируй это изображение фрактала и построй 3D модель.\n\n"
                    f"Путь к файлу: {image_path}\n\n"
                    "Действуй по плану:\n"
                    "1. Запусти run_math_agent\n"
                    "2. Запусти run_cnn_agent (используй math результаты как hints)\n"
                    "3. На основе результатов запусти run_depth_mesh_agent\n"
                    "4. Запусти run_verification\n"
                    "5. Верни финальный JSON с результатами\n\n"
                    "Если verification_score < 0.75 — попробуй второй по рейтингу тип."
                )},
            ],
        }]

        while True:
            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=4096,
                system=ORCHESTRATOR_SYSTEM,
                tools=SUBAGENT_TOOLS,
                messages=messages,
            )
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                for block in response.content:
                    if getattr(block, "type", None) == "text":
                        try:
                            return json.loads(block.text)
                        except json.JSONDecodeError:
                            # The model finished but didn't emit clean JSON — use
                            # the deterministic local assembly as ground truth.
                            return orchestrate_local(image_path)
                return orchestrate_local(image_path)

            if response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        log.info("[Opus] -> субагент: %s", block.name)
                        result = _handle_tool_call(block.name, block.input, image_path, shared)
                        log.info("[Opus]    <- %s confidence=%s",
                                 block.name, result.get("confidence", "?"))
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, default=str),
                        })
                messages.append({"role": "user", "content": tool_results})
    except Exception as e:  # noqa: BLE001 - any auth/network/SDK error -> local
        log.warning("[Opus] LLM mode failed (%s) — falling back to LOCAL mode", e)
        return orchestrate_local(image_path)


# --------------------------------------------------------------------------- #
# Public entry point                                                           #
# --------------------------------------------------------------------------- #
def orchestrate(image_path: str, use_llm: bool = False, basename: str = "fractal") -> dict:
    """Run the multi-agent pipeline and return the spec's final JSON.

    use_llm=False (default) runs everything locally — no API key required.
    use_llm=True uses the Anthropic Opus agentic loop, falling back to local
    mode if anthropic is unavailable or the API key is missing/invalid.
    """
    if use_llm:
        return orchestrate_llm(image_path)
    return orchestrate_local(image_path, basename=basename)
