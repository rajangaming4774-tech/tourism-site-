"""
Descent of the Ganges / Arjuna's Penance — base boulder geometry.

Builds the two monolithic granite masses at true scale with the natural
vertical fissure between them. The front (carved) face is left planar and
UV-mapped for an orthographic photo projection — the relief itself is a
texture + displacement job, not modelled geometry.

Local space:  X = along the relief (0 .. 29.26 m)
              Y = up (0 = ground)
              Z = into the rock (0 = carved face, +Z = back)

Real dimensions: 29.26 m across, 13.1 m at the highest point.
"""

import os

import numpy as np
import trimesh

# ---------------------------------------------------------------- parameters

TOTAL_W = 29.26
MAX_H = 13.10
CLEFT = 0.56          # natural fissure the sculptors used as the river

WEST = dict(w=15.10, h=11.40, d=9.00, seed=17)
EAST = dict(w=13.60, h=13.10, d=10.20, seed=43)

SUBDIV = 5            # 12 * 4^5 = 12,288 tris per mass
FACE_RELIEF = 0.14    # shallow undulation left on the carved face
BACK_RELIEF = 1.15    # boulder irregularity on back and sides


# -------------------------------------------------------------------- noise

def _hash_dir(seed, i):
    rng = np.random.default_rng(seed * 977 + i)
    v = rng.normal(size=3)
    return v / np.linalg.norm(v)


def value_noise(p, seed, octaves=4, base_freq=0.11):
    """Deterministic sum-of-sines noise. No external noise dependency."""
    out = np.zeros(len(p))
    amp, freq = 1.0, base_freq
    norm = 0.0
    for o in range(octaves):
        for k in range(3):
            d = _hash_dir(seed + o * 31, k)
            phase = (seed * 0.37 + o * 1.7 + k * 2.3)
            out += amp * np.sin(p @ d * freq * 2 * np.pi + phase)
        norm += amp * 3
        amp *= 0.52
        freq *= 2.13
    return out / norm


def smoothstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------- mass build

def build_mass(w, h, d, seed, x_offset):
    box = trimesh.creation.box(extents=[w, h, d])
    v, f = box.vertices.copy(), box.faces.copy()
    for _ in range(SUBDIV):
        v, f = trimesh.remesh.subdivide(v, f)

    # move to corner-origin: x in [0,w], y in [0,h], z in [0,d]
    v[:, 0] += w / 2.0
    v[:, 1] += h / 2.0
    v[:, 2] += d / 2.0

    x, y, z = v[:, 0], v[:, 1], v[:, 2]

    # boulder rounding: taper depth and width toward the top.
    # z is scaled multiplicatively so the carved face (z=0) never moves.
    ny = np.clip(y / h, 0, 1)
    taper = 1.0 - 0.30 * ny ** 2.4
    v[:, 2] = z * taper
    cx = w / 2.0
    v[:, 0] = cx + (x - cx) * (1.0 - 0.14 * ny ** 3.0)

    # displacement amplitude ramps from the flat carved face into the mass
    t = smoothstep(v[:, 2] / (d * 0.45))
    amp = FACE_RELIEF + (BACK_RELIEF - FACE_RELIEF) * t

    n = value_noise(v * 1.0, seed, octaves=4, base_freq=0.09)
    n2 = value_noise(v * 1.0, seed + 5, octaves=3, base_freq=0.31)
    disp = amp * (0.72 * n + 0.28 * n2)

    # push mostly along Z (into/out of the rock), some along X
    v[:, 2] += disp
    v[:, 0] += disp * 0.35 * t
    v[:, 1] += disp * 0.22 * t

    # keep the carved face planar and the base flat on the ground
    face_mask = v[:, 2] < FACE_RELIEF * 1.6
    v[face_mask, 2] = np.clip(v[face_mask, 2], 0.0, FACE_RELIEF)
    v[:, 1] = np.maximum(v[:, 1], 0.0)
    v[:, 2] = np.maximum(v[:, 2], 0.0)

    v[:, 0] += x_offset
    return v, f


# ------------------------------------------------------------------ assemble

west_v, west_f = build_mass(**WEST, x_offset=0.0)
east_v, east_f = build_mass(**EAST, x_offset=WEST["w"] + CLEFT)

verts = np.vstack([west_v, east_v])
faces = np.vstack([west_f, east_f + len(west_v)])

# planar UV projection from the front, matched to a 29.26 x 13.10 photo plate
u = verts[:, 0] / TOTAL_W
w_ = 1.0 - (verts[:, 1] / MAX_H)
uv = np.column_stack([u, w_])

mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
mesh.visual = trimesh.visual.TextureVisuals(uv=uv)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "models", "arjunas-penance-base.glb")
mesh.export(out)

print(f"vertices   {len(mesh.vertices):,}")
print(f"triangles  {len(mesh.faces):,}")
lo, hi = mesh.bounds
print(f"bounds     {hi[0]-lo[0]:.2f} x {hi[1]-lo[1]:.2f} x {hi[2]-lo[2]:.2f} m (W x H x D)")
print(f"written    {out}")
