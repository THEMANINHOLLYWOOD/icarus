#!/usr/bin/env python3
# Finish a thread video from tools/reel7.js frames: spoken orders laid on as captions where they were said, an end card in
# the game's red title style, and a slice of the theme under it all. Not deployed.
#   python3 tools/threadcut.py <name>    (settings per video in CUTS below)
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP, THEME, SFX = os.path.join(ROOT, 'tools/cap'), os.path.join(ROOT, 'music/icarus-theme.mp3'), os.path.join(ROOT, 'tools/takes/sfx')
FB, FR = os.path.expanduser('~/Library/Fonts/IBMPlexMono-SemiBold.ttf'), os.path.expanduser('~/Library/Fonts/IBMPlexMono-Regular.ttf')
FPS, W, H = 60, 1920, 1080

# name: frames prefix, the theme from (s), end card lines, caption kind, extra overlays [(t0, t1, text)], sfx hits [(file, at, dB)]
CUTS = {
  'voice':  dict(pre='v2_', music=118.0, card=('NO BUTTONS.', 'JUST SAY IT.'), captions='say', drop=[(1.95, 2.55)]),
  'gods':   dict(pre='v3_', music=60.0, card=('EVERY GOD', 'IS AN AGENT.'), captions='lines'),
  'ascii':  dict(pre='v4_', music=150.0, card=('A REAL 3D WORLD.', 'DRAWN IN LETTERS.'), captions=None, drop=[(0, 1.6)]),
  'stack':  dict(pre='v5_', music=30.0, card=('THREE.JS · VERCEL', 'SUPABASE · AI'), captions='lines'),
  'friends': dict(pre='v6_', music=186.0, card=('ONE WORLD.', 'EVERYONE IN IT.'), captions='lines'),
}

def spaced(d, xy, text, font, track, fill):
    x, y = xy
    for c in text: d.text((x, y), c, font=font, fill=fill); x += font.getlength(c) + track
def spaced_w(text, font, track): return sum(font.getlength(c) for c in text) + track * (len(text) - 1)

def glow(mask, core, halo):
    m = np.asarray(mask, np.float32)[..., None] / 255
    rgb = m * np.array(core, np.float32)
    for r, c, k in halo:
        rgb = rgb + np.asarray(mask.filter(ImageFilter.GaussianBlur(r)), np.float32)[..., None] / 255 * np.array(c, np.float32) * k
    return rgb, np.clip(m + sum(np.asarray(mask.filter(ImageFilter.GaussianBlur(r)), np.float32)[..., None] / 255 * k * 0.6 for r, c, k in halo), 0, 1)

def caption_layer(text, kind):
    """A spoken order: an ember dot and the words in quotes, low in the frame; a god's line: plain white, a little smaller."""
    mask = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mask)
    if kind == 'say':
        f = ImageFont.truetype(FB, 58); s = f'“{text}”'; tw = spaced_w(s, f, 3)
        x = (W - tw) / 2 + 30; y = H - 210
        d.ellipse((x - 62, y + 22, x - 34, y + 50), fill=255)
        spaced(d, (x, y), s, f, 3, 255)
        rgb, a = glow(mask, (1.0, 0.92, 0.82), [(8, (1.0, 0.35, 0.1), 1.1), (26, (1.0, 0.2, 0.05), 0.8)])
    elif kind == 'title':
        f = ImageFont.truetype(FB, 120); tw = spaced_w(text, f, 0.3 * 120)
        spaced(d, ((W - tw) / 2, H / 2 - 80), text, f, 0.3 * 120, 255)
        rgb, a = glow(mask, (1.0, 0.64, 0.42), [(10, (1.0, 0.30, 0.10), 1.2), (34, (1.0, 0.22, 0.06), 1.2)])
    else:
        # "WHO  words…": the speaker's name in ember, the words in white, wrapped to two or three lines
        who, _, words = text.partition('|')
        f = ImageFont.truetype(FR, 44); fw = ImageFont.truetype(FB, 30)
        lines, cur = [], ''
        for w_ in words.split():
            if f.getlength(cur + ' ' + w_) > 1500 and cur: lines.append(cur); cur = w_
            else: cur = (cur + ' ' + w_).strip()
        if cur: lines.append(cur)
        y0 = H - 120 - 60 * len(lines)
        nm = Image.new('L', (W, H), 0); dn = ImageDraw.Draw(nm)
        spaced(dn, ((W - spaced_w(who, fw, 9)) / 2, y0 - 50), who, fw, 9, 255)
        for i, ln in enumerate(lines): spaced(d, ((W - spaced_w(ln, f, 1)) / 2, y0 + i * 60), ln, f, 1, 255)
        rgb, a = glow(mask, (1.0, 0.97, 0.92), [(6, (0, 0, 0), 1.6)])
        r2, a2 = glow(nm, (1.0, 0.62, 0.40), [(8, (1.0, 0.3, 0.1), 1.0)])
        rgb, a = rgb + r2, np.clip(a + a2, 0, 1)
    shade = Image.new('L', (W, H), 0); ImageDraw.Draw(shade).rectangle((0, H - 360, W, H) if kind != 'title' else (0, 0, W, H), fill=150 if kind != 'title' else 120)
    shade = np.asarray(shade.filter(ImageFilter.GaussianBlur(90)), np.float32)[..., None] / 255
    return rgb, a, shade

def card_frames(lines, n, out_dir, start_idx):
    big = ImageFont.truetype(FB, 96)
    mask = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mask)
    for i, ln in enumerate(lines):
        tw = spaced_w(ln, big, 0.18 * 96); spaced(d, ((W - tw) / 2, H / 2 - 120 + i * 130), ln, big, 0.18 * 96, 255)
    rgb, _ = glow(mask, (1.0, 0.64, 0.42), [(10, (1.0, 0.30, 0.10), 1.2), (34, (1.0, 0.22, 0.06), 1.2), (100, (0.9, 0.12, 0.03), 0.9)])
    for k in range(n):
        t = k / FPS; a = min(1, t / 0.25); s = 1.12 - 0.12 * (1 - (1 - min(1, t / 0.5)) ** 4)
        im = Image.fromarray(np.clip(rgb * a * 255 / 3, 0, 255).astype(np.uint8))
        im = im.transform((W, H), Image.AFFINE, (1 / s, 0, W / 2 * (1 - 1 / s), 0, 1 / s, H / 2 * (1 - 1 / s)), Image.BICUBIC)
        px = np.asarray(im, np.float32) * 3 / 255 + np.array([0.02, 0.024, 0.04], np.float32)
        Image.fromarray(np.clip(px * 255, 0, 255).astype(np.uint8)).save(os.path.join(out_dir, f'{start_idx + k:05d}.jpg'), quality=94)

def main(name):
    C = CUTS[name]; pre = C['pre']
    frames = sorted(f for f in os.listdir(CAP) if f.startswith(pre) and f[len(pre):len(pre) + 5].isdigit())
    log = json.load(open(os.path.join(CAP, pre + 'log.json'))) if os.path.exists(os.path.join(CAP, pre + 'log.json')) else []
    # cut out bad stretches: frames dropped, and the times logged after them pulled earlier
    for a, b in sorted(C.get('drop', []), reverse=True):
        frames = [f for i, f in enumerate(frames) if not (a * FPS <= i < b * FPS)]
        log = [[e[0], e[1] - (b - a) if e[1] >= b else e[1], *e[2:]] for e in log]
    extra = C.get('extra', [])
    caps = []   # (t0, t1, text, kind)
    if C['captions'] == 'say':
        for e in log:
            if e[0] == 'say': caps.append((e[1], e[1] + 1.9, e[2], 'say'))
    for e in log:
        if e[0] in ('line', 'title'): caps.append((e[1], e[1] + e[3], e[2], e[0]))
    out_dir = os.path.join(ROOT, 'tools', 'cap-' + name)
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir): os.remove(os.path.join(out_dir, f))
    layers = {}
    for i, f in enumerate(frames):
        t = i / FPS
        im = Image.open(os.path.join(CAP, f)).convert('RGB')
        live = [c for c in caps if c[0] - 0.12 <= t <= c[1] + 0.25]
        fl = sum(0.8 * np.exp(-(t - e[1]) / 0.1) for e in log if e[0] == 'flash' and 0 <= t - e[1] < 0.6)
        if fl > 0.01:
            im = Image.fromarray(np.clip(np.asarray(im, np.float32) + fl * 255, 0, 255).astype(np.uint8))
        if live:
            px = np.asarray(im, np.float32) / 255
            for t0, t1, text, kind in live:
                key = (text, kind)
                if key not in layers: layers[key] = caption_layer(text, kind)
                rgb, a, shade = layers[key]
                k = min(1, (t - t0 + 0.12) / 0.12, (t1 + 0.25 - t) / 0.25)
                px = px * (1 - shade * 0.55 * k)
                px = px * (1 - a * k) + rgb * k
            im = Image.fromarray(np.clip(px * 255, 0, 255).astype(np.uint8))
        im.save(os.path.join(out_dir, f'{i:05d}.jpg'), quality=94)
    n = len(frames); NC = int(2.2 * FPS)
    card_frames(C['card'], NC, out_dir, n)
    total = (n + NC) / FPS
    out = os.path.join(ROOT, 'clips', f'icarus-x-{name}')
    m0 = C['music']
    af = (f'[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total:.3f},afade=t=in:d=0.4,'
          f'afade=t=out:st={total - 1.6:.2f}:d=1.6,loudnorm=I=-12:TP=-1:LRA=9[a]')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(out_dir, '%05d.jpg'),
                    '-ss', f'{m0:.3f}', '-i', THEME, '-filter_complex',
                    '[0:v]fade=t=in:st=0:d=0.35,format=yuv420p[v0];' + af,
                    '-map', '[v0]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS),
                    '-c:a', 'aac', '-b:a', '192k', '-t', f'{total:.3f}', '-movflags', '+faststart', out + '.mp4'], check=True)
    print('done', out + '.mp4', round(total, 2), 's', len(caps), 'captions')

if __name__ == '__main__': main(sys.argv[1])
