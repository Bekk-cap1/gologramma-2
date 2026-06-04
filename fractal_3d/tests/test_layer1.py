"""Tests for layer1 mathematical fractal analysis methods."""
import math

import numpy as np
import pytest

from fractal_3d.layer1_math import (
    compute_box_counting,
    recover_ifs,
    analyze_fourier,
    compute_lacunarity,
    compute_multifractal,
)


# (method, required keys beyond "confidence")
METHODS = {
    "box_counting": (
        compute_box_counting,
        ["dimension", "fractal_type_hint", "box_sizes", "box_counts"],
    ),
    "ifs_recovery": (
        recover_ifs,
        ["transforms", "num_transforms", "ifs_type"],
    ),
    "fourier": (
        analyze_fourier,
        ["spectral_exponent", "symmetry_order", "fractal_hint"],
    ),
    "lacunarity": (
        compute_lacunarity,
        ["lacunarity_curve", "mean_lacunarity", "lacunarity_slope", "fractal_hint"],
    ),
    "multifractal": (
        compute_multifractal,
        ["alpha_width", "spectrum_shape", "f_alpha_max", "alpha_at_max",
         "singularity_spectrum", "fractal_hint"],
    ),
}


def test_box_counting_dimension_sierpinski(sierpinski):
    """Box-counting dimension of Sierpinski triangle (theory 1.585)."""
    res = compute_box_counting(sierpinski)
    dim = res["dimension"]
    assert 1.45 <= dim <= 1.75, f"dimension {dim} outside expected range"
    # confidence is the R^2 of the log-log fit
    assert res["confidence"] > 0.95, f"R^2 {res['confidence']} too low"


@pytest.mark.parametrize("img_fixture", ["sierpinski", "mandel"])
@pytest.mark.parametrize("method_name", list(METHODS.keys()))
def test_methods_return_confidence_and_keys(method_name, img_fixture, request):
    """Every method returns a confidence in [0,1] plus its required keys."""
    img = request.getfixturevalue(img_fixture)
    func, required = METHODS[method_name]
    res = func(img)
    assert isinstance(res, dict)
    assert "confidence" in res
    conf = res["confidence"]
    assert math.isfinite(conf)
    assert 0.0 <= conf <= 1.0, f"{method_name} confidence {conf} not in [0,1]"
    for key in required:
        assert key in res, f"{method_name} missing key {key}"


def test_recover_ifs_sierpinski(sierpinski):
    res = recover_ifs(sierpinski)
    assert res["num_transforms"] >= 2
    assert res["num_transforms"] == len(res["transforms"])
    assert res["confidence"] > 0.0


def test_fourier_spectral_exponent_positive(sierpinski):
    res = analyze_fourier(sierpinski)
    assert res["spectral_exponent"] > 0.0


@pytest.mark.parametrize("edge_fixture", ["blank", "filled"])
@pytest.mark.parametrize("method_name", list(METHODS.keys()))
def test_methods_handle_edge_cases(method_name, edge_fixture, request):
    """Methods must not crash on all-zero / all-one images and return finite confidence."""
    img = request.getfixturevalue(edge_fixture)
    func, _ = METHODS[method_name]
    res = func(img)  # must not raise
    assert isinstance(res, dict)
    conf = res.get("confidence")
    assert conf is not None
    assert math.isfinite(conf)
    assert 0.0 <= conf <= 1.0
