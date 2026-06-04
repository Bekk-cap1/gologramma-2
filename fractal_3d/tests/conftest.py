"""Shared fixtures for the fractal 2D->3D reconstruction test suite."""
import numpy as np
import pytest

from fractal_3d.reference_fractals import (
    GENERATORS,
    sierpinski_triangle,
    mandelbrot,
)


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (full reconstruction pipeline)"
    )


@pytest.fixture(scope="session")
def sierpinski():
    """A Sierpinski triangle grayscale image (256x256, float32 in [0,1])."""
    return sierpinski_triangle()


@pytest.fixture(scope="session")
def mandel():
    """A Mandelbrot set grayscale image."""
    return mandelbrot()


@pytest.fixture(scope="session")
def blank():
    """All-zeros edge-case image."""
    return np.zeros((256, 256), dtype=np.float32)


@pytest.fixture(scope="session")
def filled():
    """All-ones edge-case image."""
    return np.ones((256, 256), dtype=np.float32)


@pytest.fixture(params=sorted(GENERATORS.keys()))
def generator_name(request):
    return request.param


@pytest.fixture
def generated_image(generator_name):
    return GENERATORS[generator_name]()
