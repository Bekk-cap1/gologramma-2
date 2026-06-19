"""
Split the slide '3. INDIKATOR FUNKSIYANING GRADIENTI' into 3 separate pictures,
all text in BLACK:
  1) formula  — Sigmoidning hosilasi  (+ derivative bell curve)
  2) formula  — F ning gradienti
  3) graph    — bottom row: Indikator F, |grad F| normasi, Gradient vektorlari
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from skimage import measure

plt.rcParams.update({
    "text.color": "black", "axes.labelcolor": "black",
    "xtick.color": "black", "ytick.color": "black",
    "axes.edgecolor": "black", "mathtext.fontset": "cm",
})

# ─────────────────────── PICTURE 1 : Sigmoid derivative formula ───────────────
fig = plt.figure(figsize=(5.6, 3.6), facecolor="white")
fig.text(0.5, 0.92, "Sigmoidning hosilasi", ha="center", va="top",
         fontsize=18, fontweight="bold", color="black")
fig.text(0.5, 0.66,
         r"$\frac{d\sigma(t)}{dt} = a\,\sigma(t)\,(1-\sigma(t))$",
         ha="center", va="center", fontsize=22, color="black")
axc = fig.add_axes([0.18, 0.10, 0.66, 0.34])
t = np.linspace(-6, 6, 400)
s = 1 / (1 + np.exp(-t))
axc.plot(t, s * (1 - s), color="#6A1B9A", linewidth=2.5)
axc.axhline(0, color="black", linewidth=0.8)
axc.set_xticks([0]); axc.set_yticks([0])
axc.set_xlabel("t", color="black"); axc.set_ylabel(r"$d\sigma/dt$", color="black")
for sp in ["top", "right"]:
    axc.spines[sp].set_visible(False)
fig.savefig("docs/grad_1_formula_sigmoid.png", dpi=200, facecolor="white",
            bbox_inches="tight")
plt.close(fig)

# ─────────────────────── PICTURE 2 : gradient formula ─────────────────────────
fig = plt.figure(figsize=(6.6, 3.6), facecolor="white")
fig.text(0.5, 0.93, "F ning gradienti (ixtiyoriy nuqtada)", ha="center", va="top",
         fontsize=17, fontweight="bold", color="black")
fig.text(0.5, 0.60,
         r"$\frac{\partial F}{\partial x} = \sum_{i=1}^{4}"
         r"\left[\, a_i\, a\, \sigma_i\,(1-\sigma_i)\, \prod_{j\neq i}\sigma_j \,\right]$",
         ha="center", va="center", fontsize=22, color="black")
fig.text(0.5, 0.30,
         r"$\sigma_i = \sigma(a_i x + b_i y + c_i z + d_i)$",
         ha="center", va="center", fontsize=19, color="black")
fig.text(0.5, 0.08, "Gradient chegaralar (yuzalar) yaqinida katta bo‘ladi",
         ha="center", va="center", fontsize=13, fontstyle="italic", color="black")
fig.savefig("docs/grad_2_formula_gradient.png", dpi=200, facecolor="white",
            bbox_inches="tight")
plt.close(fig)

# ─────────────────────── PICTURE 3 : bottom graph (3 panels) ──────────────────
ALPHA = 6.0
V = np.array([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], float)
CENT = V.mean(0)
FACES_IDX = [(1, 2, 3), (0, 3, 2), (0, 1, 3), (0, 2, 1)]
planes = []
for (i, j, k) in FACES_IDX:
    a, b, c = V[i], V[j], V[k]
    n = np.cross(b - a, c - a)
    if np.dot(n, CENT - a) < 0:
        n = -n
    n = n / np.linalg.norm(n)
    planes.append((n, -np.dot(n, a)))


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def F_field(X, Y, Z):
    F = np.ones_like(X)
    for n, d in planes:
        F = F * sigmoid(ALPHA * (n[0] * X + n[1] * Y + n[2] * Z + d))
    return F


GREEN = "#43A047"
LIM = 1.7

N = 64
g = np.linspace(-LIM, LIM, N)
X, Y, Z = np.meshgrid(g, g, g, indexing="ij")
F = F_field(X, Y, Z)
verts, faces, _, _ = measure.marching_cubes(F, level=0.5)
verts = verts / (N - 1) * (2 * LIM) - LIM

fig = plt.figure(figsize=(15.5, 5.0), facecolor="white")

# panel 1 : indikator F
ax1 = fig.add_subplot(1, 3, 1, projection="3d")
m1 = Poly3DCollection(verts[faces], alpha=0.95)
m1.set_facecolor(GREEN); m1.set_edgecolor((0, 0, 0, 0.12))
ax1.add_collection3d(m1)
ax1.set_xlim(-LIM, LIM); ax1.set_ylim(-LIM, LIM); ax1.set_zlim(-LIM, LIM)
ax1.set_box_aspect((1, 1, 1)); ax1.view_init(elev=20, azim=-58)
ax1.set_title("Indikator  F(x, y, z)", color="black", fontsize=15, fontweight="bold")
sm = plt.cm.ScalarMappable(cmap="Greens", norm=plt.Normalize(0, 1))
cb = fig.colorbar(sm, ax=ax1, shrink=0.55, pad=0.10, ticks=[0, 1])
cb.ax.tick_params(colors="black")

# panel 2 : |grad F| normasi
ax2 = fig.add_subplot(1, 3, 2)
M = 400
gx = np.linspace(-LIM, LIM, M)
XX, YY = np.meshgrid(gx, gx, indexing="xy")
Fs = F_field(XX, YY, np.zeros_like(XX))
dy, dx = np.gradient(Fs, gx, gx)
gradnorm = np.sqrt(dx ** 2 + dy ** 2)
im = ax2.imshow(gradnorm, origin="lower", extent=[-LIM, LIM, -LIM, LIM],
                cmap="jet", aspect="equal")
ax2.set_title("|∇F|  (gradient normasi)", color="black", fontsize=15, fontweight="bold")
ax2.set_xlabel("x", color="black"); ax2.set_ylabel("y", color="black")
cb2 = fig.colorbar(im, ax=ax2, shrink=0.85, ticks=[gradnorm.min(), gradnorm.max()])
cb2.ax.set_yticklabels(["Past", "Yuqori"]); cb2.ax.tick_params(colors="black")

# panel 3 : gradient vektorlari
ax3 = fig.add_subplot(1, 3, 3, projection="3d")
m3 = Poly3DCollection(verts[faces], alpha=0.16)
m3.set_facecolor(GREEN); m3.set_edgecolor((0, 0, 0, 0.0))
ax3.add_collection3d(m3)
s = np.linspace(-LIM * 0.85, LIM * 0.85, 6)
xs, ys, zs = np.meshgrid(s, s, s, indexing="ij")
h = 1e-2
Fx = (F_field(xs + h, ys, zs) - F_field(xs - h, ys, zs)) / (2 * h)
Fy = (F_field(xs, ys + h, zs) - F_field(xs, ys - h, zs)) / (2 * h)
Fz = (F_field(xs, ys, zs + h) - F_field(xs, ys, zs - h)) / (2 * h)
mag = np.sqrt(Fx ** 2 + Fy ** 2 + Fz ** 2)
msk = mag > mag.max() * 0.04
ax3.quiver(xs[msk], ys[msk], zs[msk], Fx[msk], Fy[msk], Fz[msk],
           length=0.55, normalize=True, color="#1A237E", linewidth=1.0, arrow_length_ratio=0.4)
ax3.set_xlim(-LIM, LIM); ax3.set_ylim(-LIM, LIM); ax3.set_zlim(-LIM, LIM)
ax3.set_box_aspect((1, 1, 1)); ax3.view_init(elev=20, azim=-58)
ax3.set_title("Gradient vektorlari", color="black", fontsize=15, fontweight="bold")

fig.tight_layout()
fig.savefig("docs/grad_3_graph_bottom.png", dpi=200, facecolor="white")
plt.close(fig)

print("OK: 3 pictures saved -> docs/grad_1_formula_sigmoid.png, grad_2_formula_gradient.png, grad_3_graph_bottom.png")
