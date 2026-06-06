"""Render the .dot flowcharts to vector (SVG/EMF) + 300-DPI PNG fallback.

    python docs/diagrams/render.py

Output goes to docs/diagrams/out/. For each <name>.dot:
  - <name>.svg   via  dot -Tsvg            (vector, always if Graphviz present)
  - <name>.emf   via  libreoffice/inkscape (vector for Word; if a converter exists)
  - <name>.png   via  dot -Tpng -Gdpi=300  (300-DPI raster fallback)

EMF is the best format to paste into Word (scales without blur, editable).
Requires Graphviz (`dot`). For EMF also LibreOffice or Inkscape.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
DOTS = ["depth_crf", "fractal_ifs"]


def _run(cmd):
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False


def _svg_to_emf(svg, emf):
    """Try LibreOffice, then Inkscape, to convert SVG → EMF (vector)."""
    soffice = shutil.which("libreoffice") or shutil.which("soffice")
    if soffice and _run([soffice, "--headless", "--convert-to", "emf",
                         "--outdir", OUT, svg]):
        return os.path.exists(emf)
    inkscape = shutil.which("inkscape")
    if inkscape and _run([inkscape, svg, "--export-type=emf", f"--export-filename={emf}"]):
        return os.path.exists(emf)
    return False


def main():
    dot = shutil.which("dot")
    if not dot:
        print("ERROR: Graphviz 'dot' not found. Install it:")
        print("  Windows:  winget install graphviz   (or: choco install graphviz)")
        print("  Then re-run:  python docs/diagrams/render.py")
        sys.exit(1)

    os.makedirs(OUT, exist_ok=True)
    for name in DOTS:
        src = os.path.join(HERE, f"{name}.dot")
        svg = os.path.join(OUT, f"{name}.svg")
        png = os.path.join(OUT, f"{name}.png")
        emf = os.path.join(OUT, f"{name}.emf")
        _run([dot, "-Tsvg", src, "-o", svg])
        _run([dot, "-Tpng", "-Gdpi=300", src, "-o", png])
        emf_ok = _svg_to_emf(svg, emf) if os.path.exists(svg) else False
        made = [os.path.basename(p) for p in (svg, emf, png) if os.path.exists(p)]
        note = "" if emf_ok else "  (EMF skipped — install LibreOffice or Inkscape for vector Word)"
        print(f"{name}: {', '.join(made)}{note}")

    print(f"\nDone → {OUT}")
    print("For Word: insert the .emf (vector, crisp at any zoom); else the 300-DPI .png.")


if __name__ == "__main__":
    main()
