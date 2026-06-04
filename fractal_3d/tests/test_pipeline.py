"""End-to-end pipeline tests: analyze() and reconstruct()."""
import os

import pytest

from fractal_3d.pipeline import analyze, reconstruct


DECISION_KEYS = {
    "final_type",
    "final_category",
    "final_confidence",
    "is_escape_time",
    "ifs_transforms",
    "all_votes",
    "agreement_score",
    "low_confidence_flag",
}


def test_analyze_decision_keys(generated_image):
    """analyze() on each reference generator returns a well-formed decision."""
    out = analyze(generated_image, use_cnn=False)
    assert "decision" in out and "methods" in out
    decision = out["decision"]
    assert DECISION_KEYS.issubset(decision.keys())
    assert isinstance(decision["final_type"], str)
    assert 0.0 <= decision["final_confidence"] <= 1.0
    # all five math methods should have run
    for m in ("box_counting", "ifs_recovery", "fourier",
              "lacunarity", "multifractal"):
        assert m in out["methods"]


@pytest.mark.slow
def test_reconstruct_sierpinski_fast(sierpinski):
    """Full fast reconstruction produces a valid mesh, files and verification."""
    res = reconstruct(
        sierpinski,
        quality="fast",
        basename="pytest_reconstruct_tmp",
        use_cnn=False,
    )
    assert isinstance(res["decision"]["final_type"], str)

    obj = res["files"]["obj"]
    assert os.path.exists(obj)
    assert os.path.getsize(obj) > 0

    assert res["mesh"]["n_faces"] > 0

    sim = res["verification"]["similarity"]
    assert 0.0 <= sim <= 1.0

    assert "elapsed_sec" in res
    assert "low_confidence" in res
