"""make_splat360.py — CLI for the 360° splatting pipeline.

Usage
-----
# Branch A: mesh → synthetic orbit + PLY
  python scripts/make_splat360.py --mesh path/to/mesh.obj --out path/to/out_dir/

# Branch B: photo → Replicate 3D (needs REPLICATE_API_TOKEN + pip install replicate)
  python scripts/make_splat360.py --image path/to/photo.png --out path/to/out_dir/ [--provider auto]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Ensure repo root is on sys.path so `fractal_3d` package is importable
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _progress(frac: float, msg: str) -> None:
    bar_len = 30
    filled = int(bar_len * frac)
    bar = "#" * filled + "-" * (bar_len - filled)
    print(f"\r[{bar}] {frac * 100:5.1f}%  {msg}", end="", flush=True)
    if frac >= 1.0:
        print()


def _print_manifest(manifest: dict) -> None:
    import json
    print("\n=== Manifest ===")
    print(json.dumps(manifest, indent=2))


def _print_produced_files(out_dir: Path) -> None:
    print("\n=== Produced files ===")
    files = sorted(out_dir.rglob("*"))
    total_bytes = 0
    for f in files:
        if f.is_file():
            sz = f.stat().st_size
            total_bytes += sz
            rel = f.relative_to(out_dir)
            print(f"  {rel}  ({sz:,} bytes)")
    print(f"\nTotal: {total_bytes:,} bytes across {sum(1 for f in files if f.is_file())} files")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="360° splatting pipeline — Branch A (mesh) or Branch B (photo)."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--mesh", metavar="OBJ", help="Source mesh file (Branch A).")
    group.add_argument("--image", metavar="PNG", help="Source photo (Branch B).")

    parser.add_argument("--out", metavar="DIR", required=True,
                        help="Output directory.")
    parser.add_argument("--provider", default="auto",
                        help="Replicate provider for Branch B (default: auto).")
    parser.add_argument("--n-views", type=int, default=60,
                        help="Number of orbit views (Branch A, default 60).")
    parser.add_argument("--img-size", type=int, default=800,
                        help="Render image size in pixels (Branch A, default 800).")

    args = parser.parse_args()
    out_dir = Path(args.out)

    if args.mesh:
        mesh_path = Path(args.mesh)
        if not mesh_path.exists():
            print(f"ERROR: mesh not found: {mesh_path}", file=sys.stderr)
            sys.exit(1)

        from fractal_3d.splat360 import build_synthetic

        print(f"Branch A — synthetic orbit from mesh: {mesh_path}")
        manifest = build_synthetic(
            mesh_path=mesh_path,
            out_dir=out_dir,
            n_views=args.n_views,
            img_size=args.img_size,
            progress=_progress,
        )

    else:
        image_path = Path(args.image)
        if not image_path.exists():
            print(f"ERROR: image not found: {image_path}", file=sys.stderr)
            sys.exit(1)

        from fractal_3d.splat360 import build_photo

        print(f"Branch B — photo pipeline: {image_path}")
        manifest = build_photo(
            image_path=image_path,
            out_dir=out_dir,
            provider=args.provider,
            progress=_progress,
        )

    _print_manifest(manifest)
    _print_produced_files(out_dir)


if __name__ == "__main__":
    main()
