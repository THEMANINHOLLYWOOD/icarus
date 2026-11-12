#!/usr/bin/env python3
# The ASCII video's picture, built from two takes of every frame (tools/reel7.js REEL.recDual): <pre>b = the raw 3D render,
# <pre>a = the game's own picture through the letters. Where a cut says so, a glowing line sweeps across the frame and the
# raw world turns into letters behind it. Writes <out>00000.jpg… next to the takes, for tools/threadcut2.py. Not deployed.
#   python3 tools/onion.py <pre> <out> '<json: [[t0, t1, "raw" | "game" | "wipe"], …]>'
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

CAP = os.environ.get('THREAD_CAP', '/private/tmp/icarus-cap')
pre, out, plan = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
FPS = 60
n = len([f for f in os.listdir(CAP) if f.startswith(pre + 'a') and f.endswith('.jpg')])
W, H = Image.open(os.path.join(CAP, f'{pre}a00000.jpg')).size
xs = np.arange(W)[None, :, None].astype(np.float32)
glow_col = np.array([255, 196, 120], np.float32)
for i in range(n):
    t = i / FPS
    mode = next((m for t0, t1, m in plan if t0 <= t < t1), 'game')
    a = np.asarray(Image.open(os.path.join(CAP, f'{pre}a{i:05d}.jpg')).convert('RGB'), np.float32)
    if mode == 'game': px = a
    else:
        b = np.asarray(Image.open(os.path.join(CAP, f'{pre}b{i:05d}.jpg')).convert('RGB'), np.float32)
        if mode == 'raw': px = b
        else:   # wipe: the letters take over left to right behind a line of ember light
            t0, t1 = next((t0, t1) for t0, t1, m in plan if t0 <= t < t1 and m == mode)
            u = (t - t0) / (t1 - t0); u = u * u * (3 - 2 * u); x = -60 + u * (W + 120)
            k = np.clip((x - xs) / 24, 0, 1)            # 1 = letters
            px = b * (1 - k) + a * k
            g = np.exp(-((xs - x) / 10) ** 2) + 0.35 * np.exp(-((xs - x) / 60) ** 2)
            px = px + g * glow_col * 0.9
    Image.fromarray(np.clip(px, 0, 255).astype(np.uint8)).save(os.path.join(CAP, f'{out}{i:05d}.jpg'), quality=94)
print('onion frames', n, W, H)
