"""Субагент построения Depth Map и 3D Mesh — Claude Sonnet.

Модель (опционально): claude-sonnet-4-6
Роль: depth map -> облако точек -> marching cubes -> OBJ файл.

CRITICAL: the real work is done locally by run_subagent_depth_mesh() which calls
the depth_map / mesh layers directly. The Anthropic agentic loop is optional.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from ..common import to_gray
from ..depth_map import build_depth_map
from ..mesh import build_mesh, chaos_game_3d, export_obj

try:
    import anthropic
except ImportError:  # pragma: no cover
    anthropic = None


DEPTH_MESH_SYSTEM = """
Ты — субагент построения 3D геометрии фракталов.
Твоя модель: Claude Sonnet.

Ты получаешь тип фрактала и его параметры. Твои задачи:
1. Построить depth map (разными методами для IFS и escape-time)
2. Запустить chaos game в 3D для облака точек
3. Применить Marching Cubes для получения mesh
4. Экспортировать в OBJ файл
5. Вернуть пути к файлам и метаданные

Важно: для IFS фракталов глубина = уровень рекурсии.
Для escape-time фракталов глубина = smooth escape time.
"""

DEPTH_MESH_TOOLS = [
    {
        "name": "build_depth_map",
        "description": "Построить depth map из параметров фрактала",
        "input_schema": {
            "type": "object",
            "properties": {
                "fractal_type": {"type": "string"},
                "is_escape_time": {"type": "boolean"},
                "ifs_transforms": {"type": "array"},
                "output_path": {"type": "string"},
            },
            "required": ["fractal_type", "is_escape_time"],
        },
    },
    {
        "name": "run_chaos_game",
        "description": "Запустить chaos game в 3D пространстве",
        "input_schema": {
            "type": "object",
            "properties": {
                "ifs_transforms": {"type": "array"},
                "n_points": {"type": "integer"},
                "is_escape_time": {"type": "boolean"},
            },
            "required": ["ifs_transforms"],
        },
    },
    {
        "name": "marching_cubes_mesh",
        "description": "Построить 3D mesh из вокселей",
        "input_schema": {
            "type": "object",
            "properties": {
                "resolution": {"type": "integer"},
            },
            "required": [],
        },
    },
    {
        "name": "export_to_obj",
        "description": "Экспортировать mesh в OBJ файл",
        "input_schema": {
            "type": "object",
            "properties": {
                "fractal_type": {"type": "string"},
                "metadata": {"type": "object"},
                "output_path": {"type": "string"},
            },
            "required": ["fractal_type"],
        },
    },
]


def run_subagent_depth_mesh(tool_input: dict) -> dict:
    """LOCAL core path — called by the orchestrator.

    Builds the depth map, a 3D mesh (chaos-game point cloud for IFS fractals,
    height-field for escape-time fractals), exports an OBJ and saves the depth
    PNG. Returns depth_map_path, obj_path, mesh_path, n_faces (and n_vertices).
    """
    fractal_type = tool_input.get("fractal_type", "unknown")
    is_escape_time = bool(tool_input.get("is_escape_time", False))
    ifs_transforms = tool_input.get("ifs_transforms") or []
    output_dir = Path(tool_input.get("output_dir") or "output")
    output_dir.mkdir(parents=True, exist_ok=True)
    resolution = int(tool_input.get("resolution", 64))
    n_points = int(tool_input.get("n_points", 100000))

    image = tool_input.get("image")
    if image is None and tool_input.get("image_path"):
        image = tool_input["image_path"]
    img_for_depth = to_gray(image) if image is not None else None

    # 1. depth map
    depth_info = build_depth_map(
        fractal_type=fractal_type,
        is_escape_time=is_escape_time,
        ifs_transforms=ifs_transforms,
        image=img_for_depth,
    )
    depth_map = depth_info["depth_map"]

    # 2. mesh: chaos-game point cloud for IFS, height-field otherwise
    mesh = None
    if not is_escape_time and ifs_transforms:
        try:
            points = chaos_game_3d(transforms=ifs_transforms, n_points=n_points)
            if points is not None and len(points) > 0:
                mesh = build_mesh(points=points, resolution=resolution)
        except Exception:
            mesh = None
    if mesh is None:
        mesh = build_mesh(depth_map=depth_map, resolution=resolution)

    # 3. depth PNG
    basename = tool_input.get("basename", "fractal")
    depth_png = output_dir / f"{basename}_depth.png"
    Image.fromarray((np.clip(depth_map, 0, 1) * 255).astype(np.uint8)).save(depth_png)

    # 4. export OBJ
    metadata = {
        "fractal_type": fractal_type,
        "is_escape_time": is_escape_time,
        "ifs_transforms": ifs_transforms,
    }
    metadata.update(tool_input.get("metadata", {}))
    obj_path = export_obj(
        mesh["vertices"], mesh["faces"],
        str(output_dir / f"{basename}.obj"), metadata,
    )

    return {
        "depth_map_path": str(depth_png),
        "obj_path": obj_path,
        "mesh_path": obj_path,
        "n_faces": int(mesh["n_faces"]),
        "n_vertices": int(mesh["n_vertices"]),
        "confidence": float(depth_info.get("confidence", 0.0)),
    }


# --------------------------------------------------------------------------- #
# Optional Anthropic agentic loop (coordinator only).                          #
# --------------------------------------------------------------------------- #
def run_subagent_depth_mesh_llm(tool_input: dict, client=None) -> dict:
    """Sonnet agentic loop variant. Falls back to LOCAL mode on any failure."""
    if anthropic is None:
        return run_subagent_depth_mesh(tool_input)
    try:
        client = client or anthropic.Anthropic()
        # Shared state populated by the tools, returned as the final result.
        state: dict = {}

        messages = [{
            "role": "user",
            "content": (
                "Построй depth map и 3D mesh для фрактала.\n\n"
                f"fractal_type: {tool_input['fractal_type']}\n"
                f"is_escape_time: {tool_input['is_escape_time']}\n"
                f"ifs_transforms: {json.dumps(tool_input.get('ifs_transforms', []), default=str)}\n"
                f"output_dir: {tool_input.get('output_dir', 'output/')}\n\n"
                "Выполни шаги: build_depth_map, run_chaos_game (если IFS), "
                "marching_cubes_mesh, export_to_obj. Верни пути к файлам."
            ),
        }]

        def handle(name: str, inp: dict) -> dict:
            # All tools funnel into the single deterministic local builder so the
            # geometry is always consistent regardless of call order.
            merged = {**tool_input, **inp}
            res = run_subagent_depth_mesh(merged)
            state.update(res)
            return res

        while True:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=DEPTH_MESH_SYSTEM,
                tools=DEPTH_MESH_TOOLS,
                messages=messages,
            )
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                for block in response.content:
                    if getattr(block, "type", None) == "text":
                        try:
                            return json.loads(block.text)
                        except Exception:
                            return state or run_subagent_depth_mesh(tool_input)
                return state or run_subagent_depth_mesh(tool_input)

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
        return run_subagent_depth_mesh(tool_input)
