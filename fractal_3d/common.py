"""Shared helpers: image loading, binarization, logging."""
from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

_logger_configured = False


def get_logger(name: str = "fractal_3d") -> logging.Logger:
    global _logger_configured
    logger = logging.getLogger(name)
    if not _logger_configured:
        logger.setLevel(logging.INFO)
        fh = logging.FileHandler(LOG_DIR / "pipeline.log", encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        sh = logging.StreamHandler()
        sh.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(fh)
        logger.addHandler(sh)
        _logger_configured = True
    return logger


def to_gray(image) -> np.ndarray:
    """Accept path / PIL.Image / ndarray -> float32 grayscale [0,1]."""
    if isinstance(image, (str, os.PathLike)):
        image = Image.open(image).convert("L")
    if isinstance(image, Image.Image):
        arr = np.asarray(image.convert("L"), dtype=np.float32)
    else:
        arr = np.asarray(image, dtype=np.float32)
        if arr.ndim == 3:
            arr = arr.mean(axis=2)
    if arr.max() > 1.0:
        arr = arr / 255.0
    return arr


def otsu_threshold(gray: np.ndarray) -> float:
    """Compute Otsu threshold on a [0,1] grayscale image."""
    hist, edges = np.histogram(gray.ravel(), bins=256, range=(0.0, 1.0))
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total == 0:
        return 0.5
    centers = (edges[:-1] + edges[1:]) / 2.0
    w_b = np.cumsum(hist)
    w_f = total - w_b
    cum_mean = np.cumsum(hist * centers)
    total_mean = cum_mean[-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        mean_b = cum_mean / w_b
        mean_f = (total_mean - cum_mean) / w_f
        between = w_b * w_f * (mean_b - mean_f) ** 2
    between[~np.isfinite(between)] = 0
    idx = int(np.argmax(between))
    return float(centers[idx])


def binarize(gray: np.ndarray) -> np.ndarray:
    """Return boolean foreground mask. Fractal ink is assumed to be the minority class."""
    g = to_gray(gray)
    t = otsu_threshold(g)
    fg_dark = g < t      # dark ink on light background
    fg_light = g >= t    # light ink on dark background
    # foreground = whichever class is the minority (the structure, not the background)
    mask = fg_dark if fg_dark.mean() <= 0.5 else fg_light
    return mask
