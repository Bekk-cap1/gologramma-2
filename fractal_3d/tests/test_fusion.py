"""Tests for the weighted-voting fusion layer."""
from fractal_3d.layer3_fusion import vote


REQUIRED_KEYS = {
    "final_type",
    "final_category",
    "final_confidence",
    "is_escape_time",
    "ifs_transforms",
    "all_votes",
    "agreement_score",
    "low_confidence_flag",
}


def test_vote_result_has_required_keys():
    res = vote({})
    assert REQUIRED_KEYS.issubset(res.keys())


def test_strong_ifs_consensus():
    """Most methods vote IFS with high confidence -> clear IFS decision."""
    results = {
        "box_counting": {"confidence": 0.99, "fractal_type_hint": "IFS"},
        "ifs_recovery": {
            "confidence": 0.92,
            "ifs_type": "geometric",
            "transforms": [{"matrix": [[0.5, 0], [0, 0.5]]}],
        },
        "fourier": {
            "confidence": 0.90,
            "fractal_hint": "IFS",
            "spectral_exponent": 2.5,
        },
        "lacunarity": {"confidence": 0.85, "fractal_hint": "IFS"},
        "multifractal": {
            "confidence": 0.90,
            "fractal_hint": "IFS",
            "spectrum_shape": "symmetric",
            "alpha_width": 0.5,
        },
    }
    res = vote(results)
    assert res["final_category"] == "IFS"
    assert res["is_escape_time"] is False
    assert res["low_confidence_flag"] is False
    assert res["ifs_transforms"]  # transforms propagated through


def test_escape_time_with_cnn_mandelbrot():
    """Escape-time hints + CNN class 'mandelbrot' -> escape-time decision."""
    results = {
        "fourier": {
            "confidence": 0.9,
            "fractal_hint": "escape_time",
            "spectral_exponent": 1.8,
        },
        "multifractal": {
            "confidence": 0.9,
            "fractal_hint": "escape_time",
            "spectrum_shape": "right_skewed",
            "alpha_width": 1.5,
        },
        "cnn": {"available": True, "class": "mandelbrot", "confidence": 0.95},
    }
    res = vote(results)
    assert res["is_escape_time"] is True
    assert res["final_category"] == "escape_time"
    assert res["final_type"] == "mandelbrot"


def test_empty_results_low_confidence():
    res = vote({})
    assert res["low_confidence_flag"] is True
    assert res["final_type"] == "unknown"
