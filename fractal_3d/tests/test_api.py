"""Tests for the FastAPI server."""
import base64
import io

import numpy as np
import pytest

# TestClient requires httpx; skip gracefully if it is missing.
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from fractal_3d.api_server import app  # noqa: E402
from fractal_3d.reference_fractals import sierpinski_triangle  # noqa: E402


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def sierpinski_png_b64():
    """A base64-encoded PNG of a Sierpinski triangle."""
    from PIL import Image

    img = (sierpinski_triangle() * 255).astype(np.uint8)
    pil = Image.fromarray(img)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"


def test_predict_sierpinski(client, sierpinski_png_b64):
    resp = client.post("/predict", json={"image": sierpinski_png_b64})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "type" in body
    assert isinstance(body["type"], str)
    assert body["type"]  # non-empty
