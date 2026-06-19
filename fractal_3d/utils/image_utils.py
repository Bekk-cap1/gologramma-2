"""Image / plot → base64 helpers for the visual debug pipeline.

All matplotlib usage goes through the non-interactive ``Agg`` backend so the
plots render safely inside the (threaded) API server with no display attached.

Shared image-dict contract used everywhere in the visual pipeline::

    {"id": str, "title": str, "description": str (optional), "data": <data-uri>}
"""
from __future__ import annotations

import base64
import io

import numpy as np

import matplotlib
matplotlib.use("Agg")  # noqa: E402  (must precede pyplot import)
import matplotlib.pyplot as plt  # noqa: E402

# Dark theme palette (matches the frontend).
DARK_BG = "#0a0e1a"
PANEL_BG = "#111827"
GRID = "#334155"
TEXT = "#e2e8f0"
MUTED = "#94a3b8"

# Cap raster images so each base64 payload stays small (<~100KB).
_MAX_DIM = 256


def array_to_base64(arr: np.ndarray, fmt: str = "PNG") -> str:
    """numpy array (HxW gray or HxWx3/4) → ``data:image/...;base64,`` URI."""
    from PIL import Image

    a = np.asarray(arr)
    if a.dtype in (np.float64, np.float32):
        a = (np.clip(a, 0.0, 1.0) * 255.0).astype(np.uint8)
    elif a.dtype != np.uint8:
        a = np.clip(a, 0, 255).astype(np.uint8)

    if a.ndim == 2:
        img = Image.fromarray(a, mode="L")
    elif a.shape[2] == 4:
        img = Image.fromarray(a, mode="RGBA")
    else:
        img = Image.fromarray(a[:, :, :3], mode="RGB")

    # downscale large rasters to keep payloads small
    w, h = img.size
    scale = _MAX_DIM / float(max(w, h))
    if scale < 1.0:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))))

    buf = io.BytesIO()
    img.save(buf, format=fmt, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/{fmt.lower()};base64,{b64}"


def plot_to_base64(fig, facecolor: str = DARK_BG) -> str:
    """matplotlib figure → base64 data URI (closes the figure)."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight",
                facecolor=facecolor, edgecolor="none", dpi=90)
    plt.close(fig)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def dark_axes(ax, title: str | None = None) -> None:
    """Apply the dark theme to a matplotlib Axes."""
    ax.set_facecolor(PANEL_BG)
    ax.tick_params(colors=MUTED, labelsize=8)
    for spine in ax.spines.values():
        spine.set_color(GRID)
    if title:
        ax.set_title(title, color=TEXT, fontsize=10)


def colorize(arr01: np.ndarray, cmap: str = "viridis") -> np.ndarray:
    """Map a float [0,1] HxW array to an RGB uint8 image via a colormap."""
    a = np.asarray(arr01, dtype=np.float64)
    mn, mx = float(a.min()), float(a.max())
    norm = (a - mn) / (mx - mn + 1e-10)
    return (matplotlib.colormaps[cmap](norm)[:, :, :3] * 255).astype(np.uint8)
