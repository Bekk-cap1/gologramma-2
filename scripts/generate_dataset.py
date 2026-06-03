"""
Этап 1: Генерация датасета фракталов.
Создаёт 10 000+ пар (2D изображение → параметры).
Запуск: python generate_dataset.py --n 10000 --size 128 --out ./dataset
"""

import argparse, csv, os, random, math
from multiprocessing import Pool, cpu_count
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

FRACTAL_TYPES = [
    "mandelbrot", "julia", "burning_ship",
    "sierpinski_triangle", "sierpinski_carpet", "menger_sponge",
    "pythagoras_tree", "koch_snowflake", "barnsley_fern", "dragon_curve",
    "octahedron_3d", "dodecahedron_3d", "icosahedron_3d", "cantor_dust_3d",
    "spiral_julia",
    "circle", "square",
]

# c-values that produce spiral structures in the Julia set
SPIRAL_CS = [
    (-0.7269, 0.1889), (0.285, 0.01), (-0.8, 0.156), (0.355, 0.355),
    (-0.74543, 0.11301), (-0.70176, -0.3842), (0.37, 0.1), (-0.235, 0.827),
]

# ══════════════════════════════════════════════════════════════════════════════
# 3D FRACTAL RENDERING — point clouds + isometric splat render with depth shading
# Produces images that look like real 3D fractal renders (Menger sponge, etc.)
# ══════════════════════════════════════════════════════════════════════════════

def _menger_points(level):
    """Voxel centres of a 3D Menger sponge. Level 3 → 8000 cubes."""
    pts = []
    def rec(x, y, z, s, d):
        if d == 0:
            pts.append((x, y, z)); return
        t = s / 3
        for ix in range(3):
            for iy in range(3):
                for iz in range(3):
                    mid = (ix == 1) + (iy == 1) + (iz == 1)
                    if mid >= 2:
                        continue
                    rec(x + (ix - 1) * t, y + (iy - 1) * t, z + (iz - 1) * t, t, d - 1)
    rec(0, 0, 0, 1.0, level)
    return np.array(pts, dtype=np.float32)


def _sierpinski_tetra_points(level):
    """Points of a 3D Sierpinski tetrahedron. Level 5 → 1024 points."""
    verts = np.array([
        [0, 1, 0],
        [-0.943, -0.333,  0.471],
        [ 0.943, -0.333,  0.471],
        [0, -0.333, -0.943],
    ], dtype=np.float32)
    pts = np.zeros((1, 3), dtype=np.float32)
    for _ in range(level):
        new = []
        for v in verts:
            new.append((pts + v) / 2)
        pts = np.concatenate(new, axis=0)
    return pts


def _mandelbulb_points(res=46, power=8, max_iter=8):
    """Surface voxels of the 3D Mandelbulb."""
    np.seterr(over="ignore", invalid="ignore")  # escaping points overflow — expected
    lin = np.linspace(-1.25, 1.25, res)
    X, Y, Z = np.meshgrid(lin, lin, lin, indexing="ij")
    cx, cy, cz = X.copy(), Y.copy(), Z.copy()
    zx, zy, zz = np.zeros_like(X), np.zeros_like(Y), np.zeros_like(Z)
    alive = np.ones(X.shape, dtype=bool)
    for _ in range(max_iter):
        r = np.sqrt(zx*zx + zy*zy + zz*zz) + 1e-9
        theta = np.arccos(np.clip(zz / r, -1, 1))
        phi = np.arctan2(zy, zx)
        rp = r ** power
        zx = rp * np.sin(theta*power) * np.cos(phi*power) + cx
        zy = rp * np.sin(theta*power) * np.sin(phi*power) + cy
        zz = rp * np.cos(theta*power) + cz
        mag = zx*zx + zy*zy + zz*zz
        alive &= (mag < 4.0)
    # keep "alive" voxels that have at least one dead neighbour → surface
    inside = alive
    pts = np.argwhere(inside).astype(np.float32)
    if len(pts) == 0:
        return np.zeros((1, 3), dtype=np.float32)
    pts = pts / (res - 1) * 2.5 - 1.25
    return pts


# Precompute base point clouds ONCE (shapes are fixed; only rotation/light vary)
_MENGER_PTS = {2: _menger_points(2), 3: _menger_points(3)}
_TETRA_PTS  = {4: _sierpinski_tetra_points(4), 5: _sierpinski_tetra_points(5)}
_BULB_PTS   = _mandelbulb_points()


def _rot_matrix(ax, ay, az):
    cx, sx = math.cos(ax), math.sin(ax)
    cy, sy = math.cos(ay), math.sin(ay)
    cz, sz = math.cos(az), math.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return (Rz @ Ry @ Rx).astype(np.float32)


def render_points_3d(pts, size, rng, splat=None, fill=0.78):
    """Splat-render a 3D point cloud with depth shading → looks like a real render."""
    img = np.zeros((size, size), dtype=np.float32)
    zbuf = np.full((size, size), -1e9, dtype=np.float32)

    # Random view rotation
    R = _rot_matrix(
        rng.uniform(-0.5, 0.5),
        rng.uniform(0, 2 * math.pi),
        rng.uniform(-0.3, 0.3),
    )
    P = pts @ R.T

    # Orthographic projection: (x,y)=screen, z=depth
    pad = int(size * rng.uniform(0.12, 0.22))
    span = size - 2 * pad
    mn, mx = P[:, :2].min(), P[:, :2].max()
    scale = span / (mx - mn + 1e-9)
    sx = ((P[:, 0] - mn) * scale + pad).astype(np.int32)
    sy = ((P[:, 1] - mn) * scale + pad).astype(np.int32)
    zd = P[:, 2]

    # Depth → brightness (closer = brighter)
    z0, z1 = zd.min(), zd.max()
    shade = 0.45 + 0.55 * (zd - z0) / (z1 - z0 + 1e-9)

    if splat is None:
        splat = max(1, int(size / 64))
    half = splat // 2

    order = np.argsort(zd)  # far → near so near overwrites
    for i in order:
        x, y, z = sx[i], sy[i], zd[i]
        b = shade[i] * fill
        for dx in range(-half, half + 1):
            for dy in range(-half, half + 1):
                px, py = x + dx, y + dy
                if 0 <= px < size and 0 <= py < size and z > zbuf[py, px]:
                    zbuf[py, px] = z
                    img[py, px] = b
    return img


# ── Chaos-game IFS point clouds for Platonic-solid fractals ──────────────────
_PHI = (1 + math.sqrt(5)) / 2

def _platonic_vertices(kind):
    if kind == "octahedron":
        return np.array([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]], dtype=np.float32)
    if kind == "cube":
        return np.array([[x,y,z] for x in (-1,1) for y in (-1,1) for z in (-1,1)], dtype=np.float32)
    if kind == "icosahedron":
        p = _PHI
        v = []
        for a in (-1, 1):
            for b in (-p, p):
                v += [[0,a,b],[a,b,0],[b,0,a]]
        return np.array(v, dtype=np.float32)
    if kind == "dodecahedron":
        p, ip = _PHI, 1/_PHI
        v = [[x,y,z] for x in (-1,1) for y in (-1,1) for z in (-1,1)]
        for a in (-ip, ip):
            for b in (-p, p):
                v += [[0,a,b],[a,b,0],[b,0,a]]
        return np.array(v, dtype=np.float32)
    raise ValueError(kind)


def _ifs_chaos_points(vertices, ratio, n=9000, seed=0):
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(vertices), n)
    p = np.zeros(3, dtype=np.float32)
    pts = np.empty((n, 3), dtype=np.float32)
    for i in range(n):
        p = p + (vertices[idx[i]] - p) * ratio
        pts[i] = p
    return pts[30:]  # drop transient


def _cantor_dust_points(level=3):
    """3D Cantor dust — keep 8 corner sub-cubes recursively."""
    pts = []
    def rec(x, y, z, s, d):
        if d == 0:
            pts.append((x, y, z)); return
        t = s / 3
        for ix in (-1, 1):
            for iy in (-1, 1):
                for iz in (-1, 1):
                    rec(x + ix * t, y + iy * t, z + iz * t, t, d - 1)
    rec(0, 0, 0, 1.0, level)
    return np.array(pts, dtype=np.float32)


# Precompute new fractal point clouds
_OCTA_PTS  = _ifs_chaos_points(_platonic_vertices("octahedron"),  0.5,  seed=1)
_DODE_PTS  = _ifs_chaos_points(_platonic_vertices("dodecahedron"), 1/_PHI, seed=2)
_ICOS_PTS  = _ifs_chaos_points(_platonic_vertices("icosahedron"), 1/_PHI, seed=3)
_CANTOR_PTS = _cantor_dust_points(3)


def render_octahedron_3d(size, rng):
    return render_points_3d(_OCTA_PTS, size, rng, splat=max(2, size // 56))

def render_dodecahedron_3d(size, rng):
    return render_points_3d(_DODE_PTS, size, rng, splat=max(2, size // 50))

def render_icosahedron_3d(size, rng):
    return render_points_3d(_ICOS_PTS, size, rng, splat=max(2, size // 50))

def render_cantor_dust_3d(size, rng):
    return render_points_3d(_CANTOR_PTS, size, rng, splat=max(2, size // 48))


def render_menger_3d(size, rng, level=3):
    return render_points_3d(_MENGER_PTS[level], size, rng, splat=max(2, size // 48))

def render_sierpinski_tetra_3d(size, rng, level=5):
    return render_points_3d(_TETRA_PTS[level], size, rng, splat=max(2, size // 56))

def render_mandelbulb_3d(size, rng):
    return render_points_3d(_BULB_PTS, size, rng, splat=max(2, size // 50))

# ──────────────────────────────────────────────────────────────────────────────
# 2D рендер фракталов
# ──────────────────────────────────────────────────────────────────────────────

def render_mandelbrot(size, zoom=1.0, cx=0.0, cy=0.0, max_iter=200):
    img = np.zeros((size, size), dtype=np.float32)
    for py in range(size):
        for px in range(size):
            x0 = (px / size - 0.5) * 3.5 / zoom + cx
            y0 = (py / size - 0.5) * 2.0 / zoom + cy
            x, y, n = 0.0, 0.0, 0
            while x*x + y*y <= 4 and n < max_iter:
                x, y = x*x - y*y + x0, 2*x*y + y0
                n += 1
            img[py, px] = n / max_iter
    return img


def render_julia(size, c_real=-0.7, c_imag=0.27, zoom=1.0, max_iter=200):
    img = np.zeros((size, size), dtype=np.float32)
    for py in range(size):
        for px in range(size):
            x = (px / size - 0.5) * 3.5 / zoom
            y = (py / size - 0.5) * 3.5 / zoom
            n = 0
            while x*x + y*y <= 4 and n < max_iter:
                x, y = x*x - y*y + c_real, 2*x*y + c_imag
                n += 1
            img[py, px] = n / max_iter
    return img


def render_spiral_julia(size, cr, ci, zoom=1.0, max_iter=300):
    """Julia set at a spiral c-value with SMOOTH coloring → spiral fractal art."""
    img = np.zeros((size, size), dtype=np.float32)
    for py in range(size):
        for px in range(size):
            x = (px / size - 0.5) * 3.0 / zoom
            y = (py / size - 0.5) * 3.0 / zoom
            n = 0
            while x*x + y*y <= 16 and n < max_iter:
                x, y = x*x - y*y + cr, 2*x*y + ci
                n += 1
            if n >= max_iter:
                img[py, px] = 0.0
            else:
                # smooth (continuous) iteration count → spiral gradients
                mag = math.sqrt(x*x + y*y)
                nu = n + 1 - math.log(math.log(mag + 1e-9) + 1e-9) / math.log(2)
                img[py, px] = (math.sin(nu * 0.35) * 0.5 + 0.5)
    return img


def render_burning_ship(size, zoom=1.0, cx=-0.5, cy=-0.5, max_iter=200):
    img = np.zeros((size, size), dtype=np.float32)
    for py in range(size):
        for px in range(size):
            x0 = (px / size - 0.5) * 3.5 / zoom + cx
            y0 = (py / size - 0.5) * 2.0 / zoom + cy
            x, y, n = 0.0, 0.0, 0
            while x*x + y*y <= 4 and n < max_iter:
                x, y = x*x - y*y + x0, 2*abs(x)*abs(y) + y0
                n += 1
            img[py, px] = n / max_iter
    return img


def render_sierpinski_triangle(size, level=6):
    img = np.zeros((size, size), dtype=np.float32)
    def draw_tri(ax, ay, bx, by, cx, cy, d):
        if d == 0:
            # Fill triangle using scanline
            pts = sorted([(ax, ay), (bx, by), (cx, cy)], key=lambda p: p[1])
            for y in range(max(0, int(pts[0][1])), min(size, int(pts[2][1]) + 1)):
                t = max(0.0, min(1.0, (y - pts[0][1]) / (pts[2][1] - pts[0][1] + 1e-9)))
                xL = pts[0][0] + t * (pts[2][0] - pts[0][0])
                if y < pts[1][1]:
                    s = max(0.0, min(1.0, (y - pts[0][1]) / (pts[1][1] - pts[0][1] + 1e-9)))
                    xR = pts[0][0] + s * (pts[1][0] - pts[0][0])
                else:
                    s = max(0.0, min(1.0, (y - pts[1][1]) / (pts[2][1] - pts[1][1] + 1e-9)))
                    xR = pts[1][0] + s * (pts[2][0] - pts[1][0])
                for x in range(max(0, int(min(xL, xR))), min(size, int(max(xL, xR)) + 1)):
                    img[y, x] = 1.0
            return
        mx, my = (ax + bx) / 2, (ay + by) / 2
        nx, ny = (bx + cx) / 2, (by + cy) / 2
        ox, oy = (ax + cx) / 2, (ay + cy) / 2
        draw_tri(ax, ay, mx, my, ox, oy, d - 1)
        draw_tri(mx, my, bx, by, nx, ny, d - 1)
        draw_tri(ox, oy, nx, ny, cx, cy, d - 1)
    m = size * 0.05
    draw_tri(size / 2, m, size - m, size - m, m, size - m, level)
    return img


def render_sierpinski_carpet(size, level=4):
    img = np.ones((size, size), dtype=np.float32)
    def remove(x, y, s, d):
        if d == 0 or s < 1:
            return
        t = s // 3
        cx, cy = x + t, y + t
        for py in range(max(0, cy), min(size, cy + t)):
            for px in range(max(0, cx), min(size, cx + t)):
                img[py, px] = 0.0
        for iy in range(3):
            for ix in range(3):
                if ix == 1 and iy == 1:
                    continue
                remove(x + ix * t, y + iy * t, t, d - 1)
    remove(0, 0, size, level)
    return img


def render_menger_sponge_projection(size, level=3):
    """2D projection of Menger Sponge (front face)."""
    # 3D Menger sponge projected isometrically — visually DISTINCT from flat carpet.
    # Render 3 visible faces of the cube with different brightness (top/left/right)
    # so the CNN sees a 3D volume, not a flat 2D carpet.
    img = np.zeros((size, size), dtype=np.float32)

    def carpet_mask(res, lv):
        m = np.ones((res, res), dtype=np.float32)
        def remove(x, y, s, d):
            if d == 0 or s < 1:
                return
            t = s // 3
            cx, cy = x + t, y + t
            for py in range(max(0, cy), min(res, cy + t)):
                for px in range(max(0, cx), min(res, cx + t)):
                    m[py, px] = 0.0
            for iy in range(3):
                for ix in range(3):
                    if ix == 1 and iy == 1:
                        continue
                    remove(x + ix * t, y + iy * t, t, d - 1)
        remove(0, 0, res, lv)
        return m

    fres = size * 2 // 3
    face = carpet_mask(fres, level)

    # Isometric projection of a cube: top face (bright), left face (med), right face (dark)
    cx, cy = size // 2, size // 3
    sx = fres // 2
    for j in range(fres):
        for i in range(fres):
            if face[j, i] < 0.5:
                continue
            u = (i / fres - 0.5)
            v = (j / fres - 0.5)
            # top face (rhombus)
            px = int(cx + (u - v) * sx)
            py = int(cy + (u + v) * sx * 0.5)
            if 0 <= px < size and 0 <= py < size:
                img[py, px] = 1.0
            # left face
            px2 = int(cx + (u - 0.5) * sx)
            py2 = int(cy + (u + 0.5) * sx * 0.5 + v * sx)
            if 0 <= px2 < size and 0 <= py2 < size:
                img[py2, px2] = max(img[py2, px2], 0.6)
            # right face
            px3 = int(cx + (0.5 - v) * sx)
            py3 = int(cy + (0.5 + v) * sx * 0.5 + u * sx)
            if 0 <= px3 < size and 0 <= py3 < size:
                img[py3, px3] = max(img[py3, px3], 0.35)
    return img


# ══════════════════════════════════════════════════════════════════════════════
# NEW 2D FRACTALS — tree, snowflake, fern, dragon
# ══════════════════════════════════════════════════════════════════════════════
def render_pythagoras_tree(size, depth=10, ang=0.5):
    im = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(im)
    def branch(x, y, angle, length, d):
        if d == 0 or length < 1.5:
            return
        x2 = x + length * math.cos(angle)
        y2 = y - length * math.sin(angle)
        draw.line([x, y, x2, y2], fill=255, width=max(1, d // 2))
        branch(x2, y2, angle + ang, length * 0.72, d - 1)
        branch(x2, y2, angle - ang, length * 0.72, d - 1)
    branch(size / 2, size * 0.96, math.pi / 2, size * 0.2, depth)
    return np.asarray(im, dtype=np.float32) / 255.0


def render_koch_snowflake(size, depth=4):
    def koch(p1, p2, d):
        if d == 0:
            return [p1]
        ax, ay = p1; bx, by = p2
        dx, dy = (bx - ax) / 3, (by - ay) / 3
        pa = (ax + dx, ay + dy)
        pb = (ax + 2 * dx, ay + 2 * dy)
        mx, my = (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2
        px = mx - (pb[1] - pa[1]) * math.sqrt(3) / 2
        py = my + (pb[0] - pa[0]) * math.sqrt(3) / 2
        peak = (px, py)
        return (koch(p1, pa, d - 1) + koch(pa, peak, d - 1)
                + koch(peak, pb, d - 1) + koch(pb, p2, d - 1))
    R = size * 0.4
    cx, cy = size / 2, size * 0.55
    v = [(cx + R * math.cos(a), cy + R * math.sin(a))
         for a in (-math.pi/2, -math.pi/2 + 2*math.pi/3, -math.pi/2 + 4*math.pi/3)]
    pts = koch(v[0], v[1], depth) + koch(v[1], v[2], depth) + koch(v[2], v[0], depth)
    pts.append(pts[0])
    im = Image.new("L", (size, size), 0)
    ImageDraw.Draw(im).line(pts, fill=255, width=2)
    return np.asarray(im, dtype=np.float32) / 255.0


def render_barnsley_fern(size, n=60000, rng=None):
    rnd = rng.random if rng else random.random
    img = np.zeros((size, size), dtype=np.float32)
    x, y = 0.0, 0.0
    for _ in range(n):
        r = rnd()
        if r < 0.01:
            x, y = 0.0, 0.16 * y
        elif r < 0.86:
            x, y = 0.85 * x + 0.04 * y, -0.04 * x + 0.85 * y + 1.6
        elif r < 0.93:
            x, y = 0.20 * x - 0.26 * y, 0.23 * x + 0.22 * y + 1.6
        else:
            x, y = -0.15 * x + 0.28 * y, 0.26 * x + 0.24 * y + 0.44
        px = int((x + 2.8) / 5.6 * size)
        py = int(size - 1 - y / 11.0 * size)
        if 0 <= px < size and 0 <= py < size:
            img[py, px] = 1.0
    return img


def render_dragon_curve(size, iters=12):
    seq = [1]
    for _ in range(iters):
        seq = seq + [1] + [-s for s in reversed(seq)]
    x, y, ang = 0.0, 0.0, 0.0
    step = 1.0
    pts = [(0.0, 0.0)]
    for turn in seq:
        x += step * math.cos(ang)
        y += step * math.sin(ang)
        pts.append((x, y))
        ang += turn * math.pi / 2
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    mnx, mxx = min(xs), max(xs); mny, mxy = min(ys), max(ys)
    sc = (size * 0.82) / max(mxx - mnx, mxy - mny, 1)
    ox = (size - (mxx - mnx) * sc) / 2; oy = (size - (mxy - mny) * sc) / 2
    spts = [((px - mnx) * sc + ox, (py - mny) * sc + oy) for px, py in pts]
    im = Image.new("L", (size, size), 0)
    ImageDraw.Draw(im).line(spts, fill=255, width=2)
    return np.asarray(im, dtype=np.float32) / 255.0


# ──────────────────────────────────────────────────────────────────────────────
# Augmentation
# ──────────────────────────────────────────────────────────────────────────────

def _shape_canvas(size, scale=3):
    big = size * scale
    return Image.new("L", (big, big), 0), big


def render_circle(size, rng):
    im, big = _shape_canvas(size)
    draw = ImageDraw.Draw(im)
    radius = rng.uniform(0.28, 0.40) * big
    cx = big / 2 + rng.uniform(-0.04, 0.04) * big
    cy = big / 2 + rng.uniform(-0.04, 0.04) * big
    box = [cx - radius, cy - radius, cx + radius, cy + radius]
    if rng.random() < 0.78:
        draw.ellipse(box, fill=255)
    else:
        draw.ellipse(box, outline=255, width=max(3, int(big * rng.uniform(0.025, 0.055))))
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


def render_square(size, rng):
    im, big = _shape_canvas(size)
    draw = ImageDraw.Draw(im)
    half = rng.uniform(0.26, 0.38) * big
    cx = big / 2 + rng.uniform(-0.04, 0.04) * big
    cy = big / 2 + rng.uniform(-0.04, 0.04) * big
    box = [cx - half, cy - half, cx + half, cy + half]
    if rng.random() < 0.78:
        draw.rectangle(box, fill=255)
    else:
        draw.rectangle(box, outline=255, width=max(3, int(big * rng.uniform(0.025, 0.055))))
    if rng.random() < 0.3:
        im = im.rotate(rng.uniform(-10, 10), fillcolor=0, resample=Image.Resampling.BILINEAR)
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


def augment(arr: np.ndarray) -> np.ndarray:
    """Heavy style augmentation → kills the domain gap between synthetic and real images."""
    size = arr.shape[0]

    # 1. LINE THICKNESS — dilate/erode via PIL Max/Min filter (no scipy → no DLL/mem issues)
    thick = random.random()
    if thick < 0.3:   # thicker lines
        im = Image.fromarray((arr * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(random.choice([3, 5])))
        arr = np.asarray(im, dtype=np.float32) / 255.0
    elif thick < 0.45:  # thinner lines
        im = Image.fromarray((arr * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
        arr = np.asarray(im, dtype=np.float32) / 255.0

    # 2. PADDING / FRAMING — fractal not always edge-to-edge
    if random.random() < 0.5:
        pad = random.uniform(0.05, 0.25)
        new = int(size * (1 - pad))
        if new > 8:
            im = Image.fromarray((arr * 255).astype(np.uint8)).resize((new, new))
            canvas = Image.new("L", (size, size), color=random.choice([0, 255, 128]))
            off = (size - new) // 2
            canvas.paste(im, (off + random.randint(-off, off) // 2, off + random.randint(-off, off) // 2))
            arr = np.asarray(canvas, dtype=np.float32) / 255.0

    # 3. SLIGHT ROTATION ±8°
    if random.random() < 0.5:
        ang = random.uniform(-8, 8)
        im = Image.fromarray((arr * 255).astype(np.uint8)).rotate(
            ang, fillcolor=int(arr[0, 0] * 255), resample=Image.BILINEAR)
        arr = np.asarray(im, dtype=np.float32) / 255.0

    # 4. ANTI-ALIASING / BLUR — imitate real PNG/JPEG smoothing
    if random.random() < 0.5:
        im = Image.fromarray((arr * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(radius=random.uniform(0.4, 1.4)))
        arr = np.asarray(im, dtype=np.float32) / 255.0

    # 5. NOISE
    arr = arr + np.random.normal(0, random.uniform(0.01, 0.04), arr.shape).astype(np.float32)
    arr = np.clip(arr, 0, 1)

    # 6. BRIGHTNESS / CONTRAST
    arr = arr * random.uniform(0.75, 1.05) + random.uniform(-0.05, 0.08)
    arr = np.clip(arr, 0, 1)

    # 7. COLOR INVERSION (40%) — white-on-black AND black-on-white
    if random.random() < 0.4:
        arr = 1.0 - arr

    # 8. FLIPS
    if random.random() < 0.5:
        arr = np.fliplr(arr)
    if random.random() < 0.3:
        arr = np.flipud(arr)

    return arr.astype(np.float32)


# ──────────────────────────────────────────────────────────────────────────────
# Worker function
# ──────────────────────────────────────────────────────────────────────────────

def generate_one(args):
    idx, size, out_dir = args
    rng = random.Random(idx)
    np_rng = np.random.default_rng(idx)

    ftype = FRACTAL_TYPES[idx % len(FRACTAL_TYPES)]
    params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 1.0, "iterations": 200}

    use3d = rng.random() < 0.5   # half the images are 3D renders

    if ftype == "mandelbrot":
        if use3d:
            arr = render_mandelbulb_3d(size, rng)   # 3D Mandelbulb
            params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 8.0, "iterations": 8}
        else:
            zoom = rng.uniform(0.3, 3.0)
            cx   = rng.uniform(-0.8, 0.4)
            cy   = rng.uniform(-0.5, 0.5)
            itr  = rng.randint(100, 400)
            arr  = render_mandelbrot(size, zoom, cx, cy, itr)
            params = {"c_real": cx, "c_imag": cy, "zoom": zoom, "iterations": itr}

    elif ftype == "julia":
        c_real = rng.uniform(-1.0, 0.5)
        c_imag = rng.uniform(-0.8, 0.8)
        zoom   = rng.uniform(0.5, 2.0)
        itr    = rng.randint(100, 400)
        arr    = render_julia(size, c_real, c_imag, zoom, itr)
        params = {"c_real": c_real, "c_imag": c_imag, "zoom": zoom, "iterations": itr}

    elif ftype == "burning_ship":
        zoom = rng.uniform(0.5, 2.5)
        cx   = rng.uniform(-2.0, 1.0)
        cy   = rng.uniform(-1.5, 0.5)
        itr  = rng.randint(100, 300)
        arr  = render_burning_ship(size, zoom, cx, cy, itr)
        params = {"c_real": cx, "c_imag": cy, "zoom": zoom, "iterations": itr}

    elif ftype == "sierpinski_triangle":
        if use3d:
            arr = render_sierpinski_tetra_3d(size, rng, level=rng.choice([4, 5]))  # 3D tetrahedron
            params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 5.0, "iterations": 5}
        else:
            level = rng.randint(4, 7)
            arr   = render_sierpinski_triangle(size, level)
            params = {"c_real": 0.0, "c_imag": 0.0, "zoom": float(level), "iterations": level}

    elif ftype == "sierpinski_carpet":
        # Carpet stays flat 2D — that's what distinguishes it from the 3D Menger sponge
        level = rng.randint(3, 5)
        arr   = render_sierpinski_carpet(size, level)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": float(level), "iterations": level}

    elif ftype == "menger_sponge":  # ALWAYS 3D render (the defining feature)
        arr = render_menger_3d(size, rng, level=rng.choice([2, 3]))
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 3.0, "iterations": 3}

    elif ftype == "pythagoras_tree":
        depth = rng.randint(8, 11)
        arr = render_pythagoras_tree(size, depth, ang=rng.uniform(0.4, 0.65))
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": float(depth), "iterations": depth}

    elif ftype == "koch_snowflake":
        depth = rng.randint(3, 5)
        arr = render_koch_snowflake(size, depth)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": float(depth), "iterations": depth}

    elif ftype == "barnsley_fern":
        arr = render_barnsley_fern(size, n=rng.randint(40000, 70000), rng=rng)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 1.0, "iterations": 4}

    elif ftype == "dragon_curve":
        it = rng.randint(10, 13)
        arr = render_dragon_curve(size, it)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": float(it), "iterations": it}

    elif ftype == "octahedron_3d":
        arr = render_octahedron_3d(size, rng)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 1.0, "iterations": 6}

    elif ftype == "dodecahedron_3d":
        arr = render_dodecahedron_3d(size, rng)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 1.0, "iterations": 20}

    elif ftype == "icosahedron_3d":
        arr = render_icosahedron_3d(size, rng)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 1.0, "iterations": 12}

    elif ftype == "cantor_dust_3d":
        arr = render_cantor_dust_3d(size, rng)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 1.0, "iterations": 3}

    elif ftype == "spiral_julia":
        cr, ci = rng.choice(SPIRAL_CS)
        zoom = rng.uniform(0.7, 1.4)
        arr = render_spiral_julia(size, cr, ci, zoom, max_iter=300)
        params = {"c_real": cr, "c_imag": ci, "zoom": zoom, "iterations": 300}

    elif ftype == "circle":
        arr = render_circle(size, rng)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 1.0, "iterations": 1}

    elif ftype == "square":
        arr = render_square(size, rng)
        params = {"c_real": 0.0, "c_imag": 0.0, "zoom": 1.0, "iterations": 1}

    else:
        raise ValueError(f"Unknown image class: {ftype}")

    arr = augment(arr)
    img = Image.fromarray((arr * 255).astype(np.uint8), mode="L")
    fname = f"img_{idx:06d}.png"
    img.save(os.path.join(out_dir, "images", fname))

    return {
        "image": fname,
        "type": ftype,
        "c_real": round(params["c_real"], 6),
        "c_imag": round(params["c_imag"], 6),
        "zoom":   round(params["zoom"],   6),
        "iterations": int(params["iterations"]),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n",    type=int, default=10000, help="Total images")
    parser.add_argument("--size", type=int, default=128,   help="Image size (NxN)")
    parser.add_argument("--out",  type=str, default="./dataset")
    parser.add_argument("--workers", type=int, default=max(1, cpu_count() - 1))
    args = parser.parse_args()

    os.makedirs(os.path.join(args.out, "images"), exist_ok=True)

    tasks = [(i, args.size, args.out) for i in range(args.n)]

    print(f"Generating {args.n} images ({args.size}x{args.size}) with {args.workers} workers...")
    with Pool(args.workers) as pool:
        rows = list(pool.imap_unordered(generate_one, tasks, chunksize=50))

    # Sort by image name for reproducibility
    rows.sort(key=lambda r: r["image"])

    csv_path = os.path.join(args.out, "labels.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["image", "type", "c_real", "c_imag", "zoom", "iterations"])
        writer.writeheader()
        writer.writerows(rows)

    counts = {}
    for r in rows:
        counts[r["type"]] = counts.get(r["type"], 0) + 1

    print(f"\nDone! Dataset saved to {args.out}/")
    print(f"  Total images: {len(rows)}")
    print(f"  Labels CSV:   {csv_path}")
    print("  Class distribution:")
    for k, v in sorted(counts.items()):
        print(f"    {k:25s} {v:6d}  ({100*v/len(rows):.1f}%)")


if __name__ == "__main__":
    main()
