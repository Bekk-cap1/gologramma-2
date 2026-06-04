"""Layer 1.3 - Fourier / power-spectrum analysis."""
from __future__ import annotations

import numpy as np

from ..common import to_gray


def _radial_profile(power: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, w = power.shape
    cy, cx = h / 2.0, w / 2.0
    y, x = np.indices((h, w))
    r = np.sqrt((x - cx) ** 2 + (y - cy) ** 2).astype(int)
    rmax = r.max()
    tbin = np.bincount(r.ravel(), power.ravel())
    nr = np.bincount(r.ravel())
    radial = tbin / np.maximum(nr, 1)
    freqs = np.arange(len(radial))
    return freqs, radial


def _beta_to_hint(beta: float) -> str:
    if beta < 1.5:
        return "random"
    if beta < 2.0:
        return "escape_time"     # Mandelbrot class ~1.8
    if beta < 2.5:
        return "IFS"             # Sierpinski / Koch ~2.2
    return "geometric"


def analyze_fourier(image, generate_images: bool = False) -> dict:
    gray = to_gray(image)
    gray = gray - gray.mean()
    F = np.fft.fftshift(np.fft.fft2(gray))
    power = np.abs(F) ** 2

    freqs, radial = _radial_profile(power)
    # fit slope on log-log, skip DC and the highest frequencies
    lo, hi = 2, max(3, len(radial) - 2)
    f = freqs[lo:hi]
    s = radial[lo:hi]
    valid = (f > 0) & (s > 0)
    if valid.sum() < 4:
        result = {
            "spectral_exponent": 0.0,
            "symmetry_order": 0,
            "dominant_frequencies": [],
            "confidence": 0.0,
            "fractal_hint": "random",
        }
        if generate_images:
            result["images"] = []
        return result
    lf = np.log(f[valid])
    ls = np.log(s[valid])
    A = np.vstack([lf, np.ones_like(lf)]).T
    (slope, intercept), *_ = np.linalg.lstsq(A, ls, rcond=None)
    beta = float(-slope)
    y_pred = slope * lf + intercept
    ss_res = np.sum((ls - y_pred) ** 2)
    ss_tot = np.sum((ls - ls.mean()) ** 2)
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0

    # angular analysis for rotational symmetry order
    h, w = power.shape
    cy, cx = h / 2.0, w / 2.0
    y, x = np.indices((h, w))
    theta = np.arctan2(y - cy, x - cx)
    rr = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    ring = (rr > 5) & (rr < min(h, w) / 2 - 2)
    nbins = 180
    ang_hist = np.zeros(nbins)
    tb = ((theta[ring] + np.pi) / (2 * np.pi) * nbins).astype(int) % nbins
    np.add.at(ang_hist, tb, power[ring])
    # detect symmetry order via autocorrelation of angular histogram
    ang_hist = ang_hist - ang_hist.mean()
    spec = np.abs(np.fft.rfft(ang_hist))
    spec[0] = 0
    sym_order = int(np.argmax(spec[:13]))  # check up to 12-fold
    sym_order = sym_order if sym_order in (3, 4, 6, 8, 12) else 0

    dominant = [int(freqs[lo + i]) for i in np.argsort(radial[lo:hi])[-5:][::-1]]

    result = {
        "spectral_exponent": round(beta, 4),
        "symmetry_order": sym_order,
        "dominant_frequencies": dominant,
        "confidence": float(np.clip(r2, 0.0, 1.0)),
        "fractal_hint": _beta_to_hint(beta),
    }

    if generate_images:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from ..utils.image_utils import (
                array_to_base64, plot_to_base64, dark_axes,
                colorize, DARK_BG, TEXT,
            )

            images = []

            # --- Image A: fft_magnitude ---
            # Re-compute from the original gray (before mean-subtraction stored in F)
            gray_orig = to_gray(image)
            F_orig = np.fft.fftshift(np.fft.fft2(gray_orig))
            mag = np.log1p(np.abs(F_orig))
            mn, mx = mag.min(), mag.max()
            mag_norm = (mag - mn) / (mx - mn + 1e-10)
            rgb = colorize(mag_norm, cmap="inferno")
            images.append({
                "id": "fft_magnitude",
                "title": "2D FFT (log-спектр)",
                "description": "Логарифмический спектр амплитуд 2D FFT (colormap inferno)",
                "data": array_to_base64(rgb),
            })

            # --- Image B: radial_spectrum ---
            fig, ax = plt.subplots(figsize=(5, 4), facecolor=DARK_BG)
            # use valid freqs/radial for log-log plot
            fv = f[valid]
            sv = s[valid]
            ax.plot(np.log(fv), np.log(sv), color="#06b6d4", linewidth=1.5)
            dark_axes(ax, title=f"Радиальный спектр S(f)  β={beta:.3f}")
            ax.set_xlabel("log(f)", color=TEXT, fontsize=9)
            ax.set_ylabel("log S(f)", color=TEXT, fontsize=9)
            fig.tight_layout()
            images.append({
                "id": "radial_spectrum",
                "title": "Радиальный спектр S(f)",
                "description": f"Лог-лог радиальный профиль мощности, β={beta:.3f}",
                "data": plot_to_base64(fig),
            })

            result["images"] = images
        except Exception:
            result["images"] = []

    return result
