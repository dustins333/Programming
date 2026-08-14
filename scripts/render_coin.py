#!/usr/bin/env python3
"""Ray-trace the Kova coin: a real 3D cylinder with the logo on both caps,
baked to the 12x10 sprite sheet components/auth/KovaCoin.js plays. Run from
the repo root: python3 scripts/render_coin.py

Geometry: cylinder radius R=1, half-thickness H, axis along coin-local w.
The coin is rotated by theta about the vertical (y) axis; camera is
orthographic looking along -z. For each pixel we intersect the ray with the
two caps and the lateral surface, take the nearest hit, and shade:
  - front cap: the logo texture, white ring at the lip
  - back cap: inverted logo, sampled mirrored (a real coin's reverse)
  - lateral: brushed steel - diffuse + specular from a fixed key light
"""
import numpy as np
from PIL import Image, ImageOps

FRAMES = 120
FRAME = 300          # output px per frame
SS = 2               # supersample factor
COIN_D = 270         # coin diameter in output px (rest is margin)
H = 0.145            # half-thickness relative to R=1  (T/D = 20/140 -> chunky)
RING = 0.045         # cap lip width as fraction of R

logo = np.asarray(Image.open("assets/kova-logo.jpg").convert("RGB"), dtype=np.float32) / 255.0
logo_inv = np.asarray(ImageOps.invert(Image.open("assets/kova-logo.jpg").convert("RGB")), dtype=np.float32) / 255.0
LH, LW = logo.shape[:2]

# key light: upper-left, toward camera
L = np.array([-0.45, -0.55, 0.72]); L /= np.linalg.norm(L)
VIEW = np.array([0.0, 0.0, 1.0])
HALF = L + VIEW; HALF /= np.linalg.norm(HALF)

N = FRAME * SS
half_pix = (COIN_D * SS) / 2.0
# pixel grid in coin units (x right, y DOWN in image; flip y for math)
xs = (np.arange(N) - N / 2 + 0.5) / half_pix
px, py = np.meshgrid(xs, xs)
y = -py  # math y up

def sample_tex(tex, u, v):
    """u,v in [-1,1] cap coordinates -> texture pixels."""
    tx = np.clip(((u + 1) / 2 * (LW - 1)).astype(int), 0, LW - 1)
    ty = np.clip(((1 - (v + 1) / 2) * (LH - 1)).astype(int), 0, LH - 1)
    return tex[ty, tx]

def render(theta):
    st, ct = np.sin(theta), np.cos(theta)
    rgb = np.zeros((N, N, 3), dtype=np.float32)
    alpha = np.zeros((N, N), dtype=np.float32)
    depth = np.full((N, N), -1e9, dtype=np.float32)

    # Ray: world (px, y, z), z from +inf toward -inf.
    # coin-space: u = px*ct - z*st ; v = y ; w = px*st + z*ct
    def put(mask, z, color):
        m = mask & (z > depth)
        if not m.any():
            return
        depth[m] = z[m]
        rgb[m] = color[m]
        alpha[m] = 1.0

    # --- caps: w = +-H  ->  z = (H_signed - px*st) / ct   (ct != 0)
    if abs(ct) > 1e-6:
        for sign, tex, mirror in ((+1.0, logo, False), (-1.0, logo_inv, True)):
            zc = (sign * H - px * st) / ct
            u = px * ct - zc * st
            v = y
            rr = np.sqrt(u * u + v * v)
            inside = rr <= 1.0
            # cap must face the camera: coin-space normal (0,0,sign) -> world z component = sign*ct
            if sign * ct <= 0:
                continue
            uu = -u if mirror else u
            col = sample_tex(tex, uu, v).copy()
            # white lip on the cap edge
            lip = rr >= (1.0 - RING)
            col[lip] = np.array([1.0, 1.0, 1.0], dtype=np.float32)
            # slight grazing falloff so the face dims a touch as it turns away
            col *= (0.80 + 0.20 * abs(ct))
            put(inside, zc, col)

    # --- lateral surface: (px*ct - z*st)^2 + y^2 = 1, |w| <= H
    if abs(st) > 1e-6:
        a = st * st
        b = -2.0 * px * ct * st
        c = (px * ct) ** 2 + y * y - 1.0
        disc = b * b - 4 * a * c
        hit = disc >= 0
        sq = np.sqrt(np.where(hit, disc, 0.0))
        for root in (+1.0, -1.0):
            z = (-b + root * sq) / (2 * a)
            u = px * ct - z * st
            w = px * st + z * ct
            m = hit & (np.abs(w) <= H)
            # world normal of the side at this point: coin (u, v, 0) rotated by theta
            nx = u * ct  # + 0*st (w-component of normal is 0)
            ny = y
            nz = u * st * -1.0  # rotate (u,0) by theta about y: world z = -u*sin? check sign below
            # world = R_y(theta) . coin ; R_y: x' = x ct + w st ; z' = -x st + w ct
            nx = u * ct
            nz = -u * st
            # only surface points facing the camera
            m = m & (nz * 1.0 + 0.0 >= -1.0)  # keep both; depth test resolves
            nlen = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9
            nxn, nyn, nzn = nx / nlen, ny / nlen, nz / nlen
            diff = np.clip(nxn * L[0] + nyn * L[1] + nzn * L[2], 0, None)
            spec = np.clip(nxn * HALF[0] + nyn * HALF[1] + nzn * HALF[2], 0, None) ** 30
            base = 0.58  # steel gray
            val = base * (0.30 + 0.85 * diff) + 1.1 * spec
            col = np.stack([val, val, val], axis=-1).astype(np.float32)
            put(m, z, col)

    img = np.concatenate([np.clip(rgb, 0, 1), alpha[..., None]], axis=-1)
    frame = Image.fromarray((img * 255).astype(np.uint8), "RGBA")
    return frame.resize((FRAME, FRAME), Image.LANCZOS)

COLS, ROWS = 12, 10
grid = Image.new("RGBA", (FRAME * COLS, FRAME * ROWS), (0, 0, 0, 0))
for i in range(FRAMES):
    f = render(2 * np.pi * i / FRAMES)
    grid.paste(f, ((i % COLS) * FRAME, (i // COLS) * FRAME))
    print(f"frame {i+1}/{FRAMES}", flush=True)

grid.save("assets/kova-coin-sheet.webp", "WEBP", quality=92, method=6)
import os
print("sheet bytes:", os.path.getsize("assets/kova-coin-sheet.webp"))
