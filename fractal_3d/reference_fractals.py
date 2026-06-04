"""Deterministic reference fractal generators (for tests / demos)."""
from __future__ import annotations

import numpy as np


def sierpinski_triangle(size: int = 256, n_points: int = 200000, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    verts = np.array([[0.0, 0.0], [1.0, 0.0], [0.5, 1.0]])
    p = np.array([0.5, 0.3])
    img = np.zeros((size, size), dtype=np.float32)
    for i in range(n_points):
        v = verts[rng.integers(3)]
        p = (p + v) / 2.0
        if i > 50:
            x = int(p[0] * (size - 1))
            y = int((1 - p[1]) * (size - 1))
            img[y, x] = 1.0
    return img


def sierpinski_carpet(size: int = 243, level: int = 4) -> np.ndarray:
    def carpet(n):
        if n == 0:
            return np.ones((1, 1), dtype=np.float32)
        sub = carpet(n - 1)
        h = sub.shape[0]
        out = np.zeros((h * 3, h * 3), dtype=np.float32)
        for i in range(3):
            for j in range(3):
                if (i, j) != (1, 1):
                    out[i*h:(i+1)*h, j*h:(j+1)*h] = sub
        return out
    img = carpet(level)
    from PIL import Image
    return np.asarray(Image.fromarray((img * 255).astype(np.uint8)).resize((size, size))) / 255.0


def koch_snowflake(size: int = 256, depth: int = 4) -> np.ndarray:
    def koch(p1, p2, d):
        if d == 0:
            return [p1]
        p1, p2 = np.array(p1), np.array(p2)
        a = p1 + (p2 - p1) / 3
        b = p1 + 2 * (p2 - p1) / 3
        ang = np.deg2rad(-60)
        rot = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
        peak = a + rot @ (b - a)
        return (koch(p1, a, d-1) + koch(a, peak, d-1) +
                koch(peak, b, d-1) + koch(b, p2, d-1))
    pts = [(0.1, 0.3), (0.9, 0.3), (0.5, 0.3 + 0.8 * np.sqrt(3)/2 * 0.8), (0.1, 0.3)]
    verts = [(0.15, 0.35), (0.85, 0.35), (0.5, 0.95)]
    path = []
    for i in range(3):
        path += koch(verts[i], verts[(i+1) % 3], depth)
    path.append(verts[0])
    path = np.array(path)
    img = np.zeros((size, size), dtype=np.float32)
    from PIL import Image, ImageDraw
    pim = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(pim)
    coords = [(float(x*(size-1)), float((1-y)*(size-1))) for x, y in path]
    draw.line(coords, fill=255, width=2)
    return np.asarray(pim, dtype=np.float32) / 255.0


def mandelbrot(size: int = 256, max_iter: int = 100) -> np.ndarray:
    x = np.linspace(-2.2, 0.8, size)
    y = np.linspace(-1.5, 1.5, size)
    X, Y = np.meshgrid(x, y)
    C = X + 1j * Y
    Z = np.zeros_like(C)
    div = np.zeros(C.shape, dtype=float)
    mask = np.ones(C.shape, dtype=bool)
    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + C[mask]
        esc = np.abs(Z) > 2
        div[esc & mask] = i
        mask &= ~esc
    div = div / div.max() if div.max() > 0 else div
    return div.astype(np.float32)


def julia(size: int = 256, c=complex(-0.7, 0.27015), max_iter: int = 100) -> np.ndarray:
    x = np.linspace(-1.6, 1.6, size)
    y = np.linspace(-1.6, 1.6, size)
    X, Y = np.meshgrid(x, y)
    Z = X + 1j * Y
    div = np.zeros(Z.shape, dtype=float)
    mask = np.ones(Z.shape, dtype=bool)
    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + c
        esc = np.abs(Z) > 2
        div[esc & mask] = i
        mask &= ~esc
    div = div / div.max() if div.max() > 0 else div
    return div.astype(np.float32)


GENERATORS = {
    "sierpinski_triangle": sierpinski_triangle,
    "sierpinski_carpet": sierpinski_carpet,
    "koch_snowflake": koch_snowflake,
    "mandelbrot": mandelbrot,
    "julia": julia,
}
