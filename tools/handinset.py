#!/usr/bin/env python3
# The hand-tracking video's inset: what the webcam would be seeing, drawn the way the game's own camera box draws it (blue
# dots for the shoulders, elbows and wrists, orange for every finger joint), from the same per-frame pose tools/handreel.js
# fed the game. Seen from in front, the same way round as he is on screen. Writes <out>00000.jpg… next to the takes, for tools/threadcut2.py. Not deployed.
#   python3 tools/handinset.py <pre> <out>
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

CAP = os.environ.get('THREAD_CAP', '/private/tmp/icarus-cap')
FONT = os.path.expanduser('~/Library/Fonts/IBMPlexMono-Regular.ttf')
pre, out = sys.argv[1], sys.argv[2]
log = [e for e in json.load(open(os.path.join(CAP, pre + 'log.json'))) if e[0] == 'p']
n = len([f for f in os.listdir(CAP) if f.startswith(pre) and f[len(pre):-4].isdigit() and f.endswith('.jpg')])
W, H = Image.open(os.path.join(CAP, f'{pre}00000.jpg')).size
PW, PH, M, SS = 440, 330, 44, 2             # the panel, its margin, supersampling
S = (PH - 34) / 1.2 * SS                    # metres → pixels
X0, Y0 = PW * SS / 2, 20 * SS                # where x = 0 and y = 2.25 m fall
BLUE, ORANGE, BONE = (127, 200, 255), (255, 176, 96), (255, 214, 170)

def nrm(a): a = np.asarray(a, float); return a / (np.linalg.norm(a) + 1e-9)
def proj(p):   # his frame (−x his left, +y up, −z ahead) → the panel, seen from in front like the game's lens: his right on our left
    k = 1 / (1 + p[2] * 0.35)
    return (X0 - p[0] * S * k, Y0 + (2.25 - p[1]) * S * k)

def hand_points(W0, fd, ac, curl, side, sc=1.5):
    fd = nrm(fd); ac = nrm(np.asarray(ac) - fd * np.dot(ac, fd)); nv = np.cross(fd, ac) * (-1 if side == 'R' else 1)
    pts = [W0]
    # the thumb: out from the heel of the hand, curling across the palm
    base = W0 + (fd * 0.025 + ac * 0.028) * sc; d0 = nrm(ac * 0.8 + fd * 0.6 + nv * 0.25); across = nrm(nv * 0.6 - ac * 0.5)
    p, a = base, 0; pts.append(p)
    for L, b in zip([0.034, 0.028, 0.024], [0.5, 0.7, 0.8]):
        a += curl[0] * b; p = p + (d0 * np.cos(a) + across * np.sin(a)) * L * sc; pts.append(p)
    pts = pts[:5]
    for i, (off, ln) in enumerate([(0.03, 0.085), (0.01, 0.09), (-0.01, 0.085), (-0.03, 0.075)]):
        p = W0 + (fd * ln + ac * off) * sc; pts.append(p); a = 0
        for L, b in zip([0.04, 0.026, 0.022] if i < 3 else [0.032, 0.02, 0.018], [1.2, 1.4, 1.0]):
            a += curl[i + 1] * b; p = p + (fd * np.cos(a) + nv * np.sin(a)) * L * sc; pts.append(p)
    return pts   # 21, in MediaPipe's order

HAND_LINES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15), (15, 16), (13, 17), (0, 17), (17, 18), (18, 19), (19, 20)]
font = ImageFont.truetype(FONT, 17 * SS)
mask = Image.new('L', (PW, PH), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, PW - 1, PH - 1), radius=14, fill=255)
rng = np.random.default_rng(3)

def panel(i, t, pose, head):
    im = Image.new('RGBA', (PW * SS, PH * SS), (10, 12, 16, 0)); d = ImageDraw.Draw(im)
    sh = {'L': np.array([-0.19, 1.45, 0.0]), 'R': np.array([0.19, 1.45, 0.0])}
    hip = {'L': np.array([-0.12, 0.92, 0.0]), 'R': np.array([0.12, 0.92, 0.0])}
    line = lambda a, b, c, w: d.line([proj(a), proj(b)], fill=c, width=w * SS)
    dot = lambda a, c, r: (lambda x, y: d.ellipse((x - r * SS, y - r * SS, x + r * SS, y + r * SS), fill=c))(*proj(a))
    # the body, faint: shoulders, torso, a head
    for a, b in [(sh['L'], sh['R']), (sh['L'], hip['L']), (sh['R'], hip['R']), (hip['L'], hip['R'])]: line(a, b, (*BONE, 70), 2)
    hx, hy = proj(np.array([0, 1.67, 0])); r = 0.115 * S
    d.ellipse((hx - r, hy - r * 1.15, hx + r, hy + r * 1.15), outline=(*BONE, 90), width=2 * SS)
    nose = np.array([np.sin(head.get('yaw', 0)) * 0.07, 1.64 - head.get('pitch', 0) * 0.05, -0.1]); dot(nose, (*BLUE, 255), 4)
    for s in 'LR':
        q = pose[s]; E = sh[s] + nrm(q['up']) * 0.28; Wr = E + nrm(q['fo']) * 0.26
        line(sh[s], E, (*BLUE, 200), 3); line(E, Wr, (*BLUE, 200), 3)
        hp = hand_points(Wr, q['fd'], q['ac'], q['curl'], s)
        for a, b in HAND_LINES: line(hp[a], hp[b], (*ORANGE, 170), 2)
        for p in hp: dot(p, (*ORANGE, 255), 3.5)
        for p in (sh[s], E, Wr): dot(p, (*BLUE, 255), 6)
    im = im.resize((PW, PH), Image.LANCZOS)
    # the camera's own look: dark, a little noise, a label and a recording light
    bg = np.full((PH, PW, 3), (14, 16, 20), np.float32) + rng.normal(0, 5, (PH, PW, 1))
    g = np.clip(1 - (np.hypot(np.arange(PW)[None] - PW / 2, (np.arange(PH)[:, None] - PH / 2) * 1.3) / (PW * 0.7)), 0.55, 1)[..., None]
    base = Image.fromarray(np.clip(bg * g * 1.6, 0, 255).astype(np.uint8)).convert('RGBA')
    base = Image.alpha_composite(base, im); dd = ImageDraw.Draw(base)
    f2 = ImageFont.truetype(FONT, 15)
    if int(t * 1.6) % 2 == 0: dd.ellipse((14, 15, 23, 24), fill=(255, 70, 60, 255))
    dd.text((30, 10), 'camera', font=f2, fill=(255, 236, 214, 210))
    dd.text((PW - 128, PH - 26), 'hand tracking', font=f2, fill=(255, 236, 214, 120))
    base.putalpha(mask.point(lambda v: int(v * 0.92)))
    return base

ONLY = [int(x) for x in os.environ['ONLY'].split(',')] if os.environ.get('ONLY') else None   # (a few frames, to look at)
for i in (ONLY or range(n)):
    t = i / 60
    e = log[min(i, len(log) - 1)]; pose, head = e[2], e[3] or {}
    fr = Image.open(os.path.join(CAP, f'{pre}{i:05d}.jpg')).convert('RGBA')
    a = min(1, t / 0.5)
    pn = panel(i, t, pose, head)
    if a < 1: pn.putalpha(pn.getchannel('A').point(lambda v: int(v * a)))
    sh = Image.new('RGBA', (PW + 40, PH + 40), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((20, 24, PW + 20, PH + 24), radius=16, fill=(0, 0, 0, int(110 * a)))
    from PIL import ImageFilter
    fr.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)), (W - PW - M - 20, H - PH - M - 20))
    fr.alpha_composite(pn, (W - PW - M, H - PH - M))
    fr.convert('RGB').save(os.path.join(CAP, f'{out}{i:05d}.jpg'), quality=94)
print('inset frames', n, W, H)
