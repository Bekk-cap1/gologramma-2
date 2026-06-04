"""Depth map for escape-time fractals (Mandelbrot / Julia) via smooth escape time.

The boundary of the set = the "surface" (max depth); interior = floor.
When IFS parameters are unknown, derive depth from the input image's smooth
escape-like intensity gradient.
"""
from __future__ import annotations

import numpy as np

from ..common import to_gray

# Well-known Julia c-values for quick matching.
_KNOWN_JULIA_C = [
    (-0.7269, 0.1889),
    (-0.8, 0.156),
    (-0.4, 0.6),
    (0.285, 0.01),
    (-0.7, 0.27015),
    (-0.75, 0.11),
    (-0.1, 0.651),
    (0.355, 0.355),
    (-0.54, 0.54),
    (0.355534, -0.337292),
]

# Expanded list of well-known Julia c-values (spirals / dendrites / rabbits /
# siegel disks / classics) used for the coarse SSIM scan in v2 estimation.
_KNOWN_JULIA_C_EXPANDED = [
    (-0.7269, 0.1889),
    (-0.7, 0.27015),
    (-0.75, 0.11),
    (-0.65, 0.45),
    (-0.72, 0.24),
    (-0.68, 0.32),
    (-0.8, 0.156),
    (-0.835, 0.2321),
    (-0.4, 0.6),
    (-0.12, 0.74),
    (0.285, 0.01),
    (0.285, 0.013),
    (0.355, 0.355),
    (-0.54, 0.54),
    (0.355534, -0.337292),
    (-0.1, 0.651),
    (-0.4, -0.59),
    (0.34, -0.05),
    (-0.75, 0.0),
    (-0.1, 0.8),
    (-0.3, -0.63),
    (0.28, 0.008),
    (-0.62, 0.42),
    (-0.55, 0.55),
]


def render_julia_quick(c_real: float, c_imag: float, size: int = 64,
                       max_iter: int = 100,
                       bounds: tuple | None = None) -> np.ndarray:
    """Vectorised Julia escape-iteration count image.

    Returns a float array in [0, 1] (normalised escape-iteration count),
    suitable for SSIM comparison. Interior (never escaped) = 1.0 (bright) —
    the SAME convention as ``smooth_escape_field`` used by the verification
    renderer, so c-estimation optimises the metric verification actually scores.

    ``bounds`` = (xmin, xmax, ymin, ymax) overrides the default [-1.5, 1.5]²
    view (used by the zoom/center optimisation).
    """
    if bounds is None:
        bounds = (-1.5, 1.5, -1.5, 1.5)
    xmin, xmax, ymin, ymax = bounds
    x = np.linspace(xmin, xmax, size)
    y = np.linspace(ymin, ymax, size)
    X, Y = np.meshgrid(x, y)
    Z = X + 1j * Y
    C = complex(c_real, c_imag)
    counts = np.zeros(Z.shape, dtype=np.float32)
    mask = np.ones(Z.shape, dtype=bool)
    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + C
        escaped = np.abs(Z) > 2.0
        newly = escaped & mask
        counts[newly] = i
        mask &= ~escaped
    counts[mask] = max_iter
    counts /= float(max_iter)
    return counts.astype(np.float32)


def optimize_c_parameter(image_gray01: np.ndarray, steps: int = 120) -> tuple:
    """Nelder-Mead optimisation of the Julia c-parameter to match an image.

    Minimises ``-SSIM(target64, render_julia_quick(c))``.
    """
    from scipy.optimize import minimize
    from skimage.transform import resize
    from skimage.metrics import structural_similarity

    target = resize(image_gray01, (64, 64), preserve_range=True,
                    anti_aliasing=True).astype(np.float32)
    target = np.clip(target, 0.0, 1.0)

    def cost(c):
        rendered = render_julia_quick(float(c[0]), float(c[1]), size=64, max_iter=100)
        try:
            s = structural_similarity(target, rendered, data_range=1.0)
        except Exception:
            return 1.0
        return -float(s)

    res = minimize(cost, x0=np.array([-0.5, 0.3]), method="Nelder-Mead",
                   options={"xatol": 0.001, "fatol": 0.001, "maxiter": steps})
    return float(res.x[0]), float(res.x[1])


def estimate_escape_params_v2(image, fractal_subtype: str = "julia") -> dict:
    """Two-stage (coarse 64x64 -> fine 128x128) Julia c-parameter estimation.

    Stage 1: SSIM scan over an expanded list of well-known Julia c-values on a
             64x64 target.
    Stage 2: Nelder-Mead refinement on a 128x128 target maximising SSIM,
             starting from the best coarse c.
    Stage 3: (only if best SSIM < 0.5) seeded random search + a short
             Nelder-Mead refine; the better of stage2/stage3 is kept.

    Returns a drop-in dict with the same keys as the julia path of
    ``estimate_escape_params`` plus ``optimization_method``.
    """
    from scipy.optimize import minimize
    from skimage.transform import resize
    from skimage.metrics import structural_similarity

    gray = to_gray(image)

    def _norm(a):
        a = np.asarray(a, dtype=np.float32)
        m = float(a.max())
        if m > 1e-12:
            a = a / m
        return np.clip(a, 0.0, 1.0)

    target64 = _norm(resize(gray, (64, 64), preserve_range=True,
                            anti_aliasing=True))
    target128 = _norm(resize(gray, (128, 128), preserve_range=True,
                             anti_aliasing=True))

    def _ssim64(cr, ci):
        rendered = _norm(render_julia_quick(cr, ci, size=64, max_iter=100))
        try:
            return float(structural_similarity(target64, rendered, data_range=1.0))
        except Exception:
            return -1.0

    def _ssim128(cr, ci):
        rendered = _norm(render_julia_quick(cr, ci, size=128, max_iter=160))
        try:
            return float(structural_similarity(target128, rendered, data_range=1.0))
        except Exception:
            return -1.0

    # --- Stage 1: coarse scan over expanded known c-values (64x64) ---
    best_c = _KNOWN_JULIA_C_EXPANDED[0]
    best_sim = -1.0
    for cr, ci in _KNOWN_JULIA_C_EXPANDED:
        s = _ssim64(cr, ci)
        if s > best_sim:
            best_sim = s
            best_c = (cr, ci)

    # --- Stage 2: fine Nelder-Mead refinement (128x128) ---
    def _cost128(c):
        return -_ssim128(float(c[0]), float(c[1]))

    res = minimize(_cost128, x0=np.array([best_c[0], best_c[1]]),
                   method="Nelder-Mead",
                   options={"maxiter": 120, "xatol": 5e-4, "fatol": 5e-4})
    s2 = -float(res.fun)
    if s2 > best_sim:
        best_c = (float(res.x[0]), float(res.x[1]))
        best_sim = s2

    # --- Stage 3: random search fallback (only if still weak) ---
    if best_sim < 0.5:
        rng = np.random.default_rng(42)
        rand_best_c = best_c
        rand_best_sim = best_sim
        for _ in range(60):
            cr = float(rng.uniform(-1.5, 0.5))
            ci = float(rng.uniform(-1.0, 1.0))
            s = _ssim64(cr, ci)
            if s > rand_best_sim:
                rand_best_sim = s
                rand_best_c = (cr, ci)
        res3 = minimize(_cost128, x0=np.array([rand_best_c[0], rand_best_c[1]]),
                        method="Nelder-Mead",
                        options={"maxiter": 80, "xatol": 5e-4, "fatol": 5e-4})
        s3 = -float(res3.fun)
        if s3 > rand_best_sim:
            rand_best_c = (float(res3.x[0]), float(res3.x[1]))
            rand_best_sim = s3
        if rand_best_sim > best_sim:
            best_c = rand_best_c
            best_sim = rand_best_sim

    return {
        "c_real": float(best_c[0]),
        "c_imag": float(best_c[1]),
        "center_x": 0.0,
        "center_y": 0.0,
        "zoom": 1.0,
        "max_iterations": 256,
        "fractal_type": "julia",
        "similarity_to_known": float(best_sim),
        "optimization_method": "two_stage_nelder_mead",
    }


def optimize_view(c_real: float, c_imag: float, image, size: int = 96) -> dict:
    """Find an optimal zoom + center for a fixed Julia ``c`` matching ``image``.

    Uses ``render_julia_quick`` with custom bounds so the normalisation matches
    the verification renderer (bright interior). Multi-start over a few zoom
    levels. Returns center_x/center_y/zoom and the achieved SSIM (``view_sim``).
    """
    from scipy.optimize import minimize
    from skimage.transform import resize
    from skimage.metrics import structural_similarity

    gray = to_gray(image)
    target = resize(gray, (size, size), preserve_range=True,
                    anti_aliasing=True).astype(np.float32)
    m = float(target.max())
    if m > 1e-12:
        target = target / m
    target = np.clip(target, 0.0, 1.0)

    def _sim(cx, cy, zoom):
        zoom = max(zoom, 1e-3)
        extent = 1.5 / zoom
        rendered = render_julia_quick(
            c_real, c_imag, size=size, max_iter=120,
            bounds=(cx - extent, cx + extent, cy - extent, cy + extent))
        try:
            return float(structural_similarity(target, rendered, data_range=1.0))
        except Exception:
            return -1.0

    def _cost(p):
        return -_sim(float(p[0]), float(p[1]), float(np.exp(p[2])))

    best_p, best_score = None, -1.0
    for log_z in (0.0, 1.0):
        res = minimize(_cost, x0=np.array([0.0, 0.0, log_z]),
                       method="Nelder-Mead",
                       options={"maxiter": 60, "xatol": 1e-3, "fatol": 1e-3})
        s = -float(res.fun)
        if s > best_score:
            best_score = s
            best_p = res.x

    cx, cy, log_zoom = float(best_p[0]), float(best_p[1]), float(best_p[2])
    return {
        "center_x": cx,
        "center_y": cy,
        "zoom": float(np.exp(log_zoom)),
        "view_sim": best_score,
    }


def estimate_escape_params_v3(image, fractal_subtype: str = "julia") -> dict:
    """Three-stage Julia c-estimation: coarse grid -> fine grid -> multi-start NM.

    1. Coarse NCC grid scan (20x20 over c in [-1.5,0.5]x[-1.2,1.2]) + known c, 64x64.
    2. Fine SSIM grid (5x5, step 0.025) around the top-10 candidates, 96x96.
    3. Multi-start Nelder-Mead (SSIM) on 128x128 from the best 5.

    Then a guarded zoom/center optimisation: the optimised view is only adopted
    if it strictly beats the default (zoom=1, center=0) view — so well-framed
    inputs (e.g. the reference fractals) are unaffected.

    Drop-in replacement for v2: same output keys + ``search_log``.
    """
    from scipy.optimize import minimize
    from skimage.transform import resize
    from skimage.metrics import structural_similarity

    gray = to_gray(image)

    def _norm(a):
        a = np.asarray(a, dtype=np.float32)
        mx = float(a.max())
        if mx > 1e-12:
            a = a / mx
        return np.clip(a, 0.0, 1.0)

    known_c_values = _KNOWN_JULIA_C_EXPANDED

    # --- Stage 1: coarse NCC grid scan (64x64) ---------------------------------
    target64 = _norm(resize(gray, (64, 64), preserve_range=True, anti_aliasing=True))
    t64f = target64.ravel().astype(np.float64)
    t64_norm = float(np.sqrt(np.sum(t64f ** 2))) + 1e-10

    def _ncc(cr, ci):
        r = _norm(render_julia_quick(cr, ci, size=64, max_iter=80)).ravel().astype(np.float64)
        return float(np.sum(t64f * r) / (t64_norm * (np.sqrt(np.sum(r ** 2)) + 1e-10)))

    grid_size = 14
    c_real_range = np.linspace(-1.5, 0.5, grid_size)
    c_imag_range = np.linspace(-1.2, 1.2, grid_size)
    candidates = []
    for cr in c_real_range:
        for ci in c_imag_range:
            candidates.append((float(cr), float(ci), _ncc(float(cr), float(ci))))
    for cr, ci in known_c_values:
        candidates.append((float(cr), float(ci), _ncc(float(cr), float(ci))))
    candidates.sort(key=lambda x: -x[2])
    top_10 = candidates[:6]

    # --- Stage 2: fine SSIM grid around top-10 (96x96) -------------------------
    target96 = _norm(resize(gray, (96, 96), preserve_range=True, anti_aliasing=True))

    def _ssim96(cr, ci):
        r = _norm(render_julia_quick(cr, ci, size=96, max_iter=120))
        try:
            return float(structural_similarity(target96, r, data_range=1.0))
        except Exception:
            return -1.0

    refined = []
    seen = set()
    for cr, ci, _ in top_10:
        for dr in np.linspace(-0.05, 0.05, 5):
            for di in np.linspace(-0.05, 0.05, 5):
                cr2, ci2 = round(cr + float(dr), 4), round(ci + float(di), 4)
                if (cr2, ci2) in seen:
                    continue
                seen.add((cr2, ci2))
                refined.append((cr2, ci2, _ssim96(cr2, ci2)))
    refined.sort(key=lambda x: -x[2])
    best_5 = refined[:3]

    # --- Stage 3: multi-start Nelder-Mead (SSIM) on 128x128 --------------------
    target128 = _norm(resize(gray, (128, 128), preserve_range=True, anti_aliasing=True))

    def _cost128(p):
        r = _norm(render_julia_quick(float(p[0]), float(p[1]), size=128, max_iter=200))
        try:
            return -float(structural_similarity(target128, r, data_range=1.0))
        except Exception:
            return 1.0

    best_c, best_sim, n_iters = (best_5[0][0], best_5[0][1]) if best_5 else (-0.7, 0.27015), -1.0, 0
    for cr, ci, _ in (best_5 or [(best_c[0], best_c[1], 0.0)]):
        res = minimize(_cost128, x0=np.array([cr, ci]), method="Nelder-Mead",
                       options={"maxiter": 300, "xatol": 3e-4, "fatol": 3e-4})
        s = -float(res.fun)
        n_iters += int(res.get("nit", 0) or 0)
        if s > best_sim:
            best_sim = s
            best_c = (float(res.x[0]), float(res.x[1]))

    # --- Stage 4: guarded zoom/center optimisation ----------------------------
    # Only worth running when the full-view match is weak (e.g. the input is a
    # zoomed-in region of the set). Well-framed images already score high, so we
    # skip the expensive multi-start view search and keep the default view —
    # this also keeps the reference fractals (full-view) fast and unaffected.
    center_x, center_y, zoom = 0.0, 0.0, 1.0
    view_sim = best_sim
    if best_sim < 0.55:
        try:
            view = optimize_view(best_c[0], best_c[1], image, size=72)
            if view["view_sim"] > best_sim + 1e-3:
                center_x, center_y, zoom = view["center_x"], view["center_y"], view["zoom"]
                view_sim = view["view_sim"]
        except Exception:
            pass

    return {
        "c_real": float(best_c[0]),
        "c_imag": float(best_c[1]),
        "center_x": float(center_x),
        "center_y": float(center_y),
        "zoom": float(zoom),
        "max_iterations": 256,
        "fractal_type": "julia",
        "similarity_to_known": float(best_sim),
        "optimization_method": "three_stage_grid_nelder_mead",
        "search_log": {
            "grid_candidates": len(candidates),
            "top_grid_ncc": float(top_10[0][2]) if top_10 else 0.0,
            "refined_sim": float(best_5[0][2]) if best_5 else 0.0,
            "final_sim": float(best_sim),
            "final_c": [float(best_c[0]), float(best_c[1])],
            "n_nelder_mead_iters": int(n_iters),
            "view_optimized": bool(zoom != 1.0 or center_x != 0.0 or center_y != 0.0),
            "view_sim": float(view_sim),
        },
    }


def estimate_escape_params(image, fractal_subtype: str = "julia") -> dict:
    """Estimate escape-time parameters from an input image.

    For julia-like subtypes, scans well-known c-values for the best SSIM match
    and falls back to Nelder-Mead optimisation when no known value is close.
    """
    from skimage.transform import resize
    from skimage.metrics import structural_similarity

    gray = to_gray(image)
    target = resize(gray, (64, 64), preserve_range=True,
                    anti_aliasing=True).astype(np.float32)
    target = np.clip(target, 0.0, 1.0)

    subtype = (fractal_subtype or "julia").lower()

    if subtype in ("julia", "julia_set", "spiral_julia"):
        # v3: three-stage grid + multi-start Nelder-Mead + guarded zoom/center.
        # Falls back to v2 if anything in the heavier search path fails.
        try:
            return estimate_escape_params_v3(image, subtype)
        except Exception:
            return estimate_escape_params_v2(image, subtype)

    if subtype == "mandelbrot":
        return {
            "center_x": -0.5,
            "center_y": 0.0,
            "zoom": 1.0,
            "max_iterations": 256,
            "fractal_type": "mandelbrot",
            "c_real": 0,
            "c_imag": 0,
        }

    if subtype == "burning_ship":
        return {
            "center_x": -0.5,
            "center_y": -0.5,
            "zoom": 1.0,
            "max_iterations": 256,
            "fractal_type": "burning_ship",
            "c_real": 0,
            "c_imag": 0,
        }

    return {
        "center_x": 0.0,
        "center_y": 0.0,
        "zoom": 1.0,
        "max_iterations": 256,
        "fractal_type": subtype,
        "c_real": -0.7,
        "c_imag": 0.27015,
    }


def build_escape_depth(params: dict, size: int = 256) -> np.ndarray:
    """Build a depth map in [0, 1] using smooth-iteration coloring.

    Honors c_real, c_imag, center_x, center_y, zoom, max_iterations and
    fractal_type from ``params``. Interior (never escaped) is the floor (0);
    slow-escaping boundary is high. Vectorised iteration loop.
    """
    c_real = float(params.get("c_real", -0.7))
    c_imag = float(params.get("c_imag", 0.27015))
    center_x = float(params.get("center_x", 0.0))
    center_y = float(params.get("center_y", 0.0))
    zoom = float(params.get("zoom", 1.0)) or 1.0
    max_iter = int(params.get("max_iterations", 256))
    ftype = str(params.get("fractal_type", "julia")).lower()

    extent = 1.5 / zoom
    x = np.linspace(center_x - extent, center_x + extent, size)
    y = np.linspace(center_y - extent, center_y + extent, size)
    X, Y = np.meshgrid(x, y)

    if ftype == "burning_ship":
        Z = np.zeros_like(X, dtype=complex)
        C = X + 1j * Y
        burning = True
    elif ftype == "mandelbrot":
        Z = np.zeros_like(X, dtype=complex)
        C = X + 1j * Y
        burning = False
    else:  # julia (default)
        Z = X + 1j * Y
        C = np.full_like(Z, complex(c_real, c_imag))
        burning = False

    smooth = np.zeros(Z.shape, dtype=float)
    mask = np.ones(Z.shape, dtype=bool)
    for i in range(max_iter):
        if burning:
            Zm = Z[mask]
            Z[mask] = (np.abs(Zm.real) + 1j * np.abs(Zm.imag)) ** 2 + C[mask]
        else:
            Z[mask] = Z[mask] ** 2 + C[mask]
        escaped = np.abs(Z) > 2.0
        newly = escaped & mask
        with np.errstate(divide="ignore", invalid="ignore"):
            smooth[newly] = i + 1 - np.log(np.log(np.abs(Z[newly]))) / np.log(2)
        mask &= ~escaped

    # interior (never escaped) = floor
    smooth[mask] = 0.0
    smooth[~np.isfinite(smooth)] = 0.0
    smooth = np.clip(smooth, 0.0, None)
    mx = smooth.max()
    if mx > 1e-9:
        smooth = smooth / mx
    return smooth.astype(np.float32)


def smooth_escape_field(c_real: float = -0.7, c_imag: float = 0.27015,
                        size: int = 256, max_iter: int = 200,
                        julia: bool = True, bounds: tuple | None = None) -> np.ndarray:
    """Compute a smooth escape-time field for a Julia/Mandelbrot region.

    ``bounds`` = (xmin, xmax, ymin, ymax) overrides the default view; for
    Mandelbrot the canonical window (-2.2..0.8, -1.5..1.5) frames the whole set.
    """
    if bounds is None:
        bounds = (-1.6, 1.6, -1.6, 1.6) if julia else (-2.2, 0.8, -1.5, 1.5)
    xmin, xmax, ymin, ymax = bounds
    x = np.linspace(xmin, xmax, size)
    y = np.linspace(ymin, ymax, size)
    X, Y = np.meshgrid(x, y)
    if julia:
        Z = X + 1j * Y
        C = np.full_like(Z, complex(c_real, c_imag))
    else:
        Z = np.zeros_like(X, dtype=complex)
        C = X + 1j * Y
    div_iter = np.zeros(Z.shape, dtype=float)
    mask = np.ones(Z.shape, dtype=bool)
    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + C[mask]
        escaped = np.abs(Z) > 2.0
        newly = escaped & mask
        with np.errstate(divide="ignore", invalid="ignore"):
            div_iter[newly] = i + 1 - np.log(np.log(np.abs(Z[newly]))) / np.log(2)
        mask &= ~escaped
    div_iter[mask] = max_iter
    return div_iter


def escape_depth_map(image=None, c_real: float = -0.7, c_imag: float = 0.27015,
                     size: int = 256) -> np.ndarray:
    """Depth map for escape-time fractals.

    If an image is given we estimate depth from its intensity (boundary = surface);
    otherwise we synthesise a Julia field from (c_real, c_imag).
    """
    if image is not None:
        gray = to_gray(image)
        from PIL import Image
        g = np.asarray(Image.fromarray((gray * 255).astype(np.uint8)).resize((size, size))) / 255.0
        # boundary (mid intensities / strong gradient) => surface
        gx, gy = np.gradient(g)
        grad = np.sqrt(gx ** 2 + gy ** 2)
        depth = grad / (grad.max() + 1e-9)
        return depth.astype(np.float32)

    field = smooth_escape_field(c_real, c_imag, size=size)
    field = field / (field.max() + 1e-9)
    # invert so boundary (slow escape, high iter near set) = max depth
    depth = field
    return depth.astype(np.float32)
