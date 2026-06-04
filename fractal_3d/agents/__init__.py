"""Multi-agent orchestration layer for the fractal 2D->3D system.

An (optional) Claude Opus orchestrator coordinates three Sonnet subagents
(math / cnn / depth_mesh) using the Anthropic SDK tool-use loop. The REAL work
of every subagent is performed by deterministic local functions that call the
existing fractal_3d layers directly, so the whole system runs end-to-end
WITHOUT an Anthropic API key. The LLM is only an optional coordinator.
"""
from .orchestrator import orchestrate
from .subagent_math import run_subagent_math
from .subagent_cnn import run_subagent_cnn
from .subagent_depth_mesh import run_subagent_depth_mesh

__all__ = [
    "orchestrate",
    "run_subagent_math",
    "run_subagent_cnn",
    "run_subagent_depth_mesh",
]
