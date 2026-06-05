"""Tests for selectable neural-depth unary sources and fractal-aware CRF."""
import numpy as np

from fractal_3d.neural_depth.dcnf_crf import run_dcnf_crf
from fractal_3d.neural_depth.estimator import (
    estimate_depth,
    estimate_depth_ablation,
    estimate_depth_compare,
)
from fractal_3d.neural_depth.postprocess import shape_from_shading_depth
from fractal_3d.reference_fractals import sierpinski_triangle


def _rgb_sierpinski(size=96):
    gray = (sierpinski_triangle(size=size) * 255).astype(np.uint8)
    return np.stack([gray, gray, gray], axis=2)


def test_shape_from_shading_unary_source_estimate_depth():
    img = _rgb_sierpinski()
    res = estimate_depth(
        img,
        method="pseudo",
        unary_source="shape_from_shading",
        crf_strength="none",
        target_size=64,
    )

    assert res["depth_map"].shape == (64, 64)
    assert res["method_used"] == "shape_from_shading"
    assert res["params"]["unary_source"] == "shape_from_shading"


def test_fractal_aware_crf_reports_extended_formula():
    img = _rgb_sierpinski()
    unary = shape_from_shading_depth(img)
    res = run_dcnf_crf(
        img,
        unary,
        segments=40,
        crf_strength="full",
        fractal_aware=True,
        eta=0.6,
    )

    params = res["params"]
    assert params["fractal_aware"] is True
    assert "eta*h" in params["crf_formula"]
    assert res["fractal_prior"] is not None


def test_compare_and_ablation_surface_unary_metadata():
    img = _rgb_sierpinski()
    cmp = estimate_depth_compare(
        img,
        method="pseudo",
        unary_source="shape_from_shading",
        segments=40,
    )
    assert cmp["unary_source"] == "shape_from_shading"
    assert cmp["depth_unary"].shape == cmp["depth_crf"].shape

    rows = estimate_depth_ablation(
        img,
        segments=40,
        unary_source="shape_from_shading",
        include_fractal=True,
    )
    names = [row["name"] for row in rows]
    assert "Unary only (smooth)" in names
    assert "Our method (Liu DCNF-CRF)" in names
    assert "Our method + fractal prior" in names
    assert all(row["unary_source"] == "shape_from_shading" for row in rows)
