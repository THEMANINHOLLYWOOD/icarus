#!/usr/bin/env python3
# The X thread videos, second pass: seamless loops (the end dissolves into the start, picture and sound), no end card,
# voices from ElevenLabs placed where they are spoken, and — only where a video wants it — a small lowercase line in the
# corner with a live waveform of the voice saying it. Not deployed.
#   python3 tools/threadcut2.py <name>
import json, os, re, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP, THEME, VO = os.environ.get('THREAD_CAP', os.path.join(ROOT, 'tools/cap')), os.path.join(ROOT, 'music/icarus-theme.mp3'), os.path.join(ROOT, 'tools/takes/thread')
FR = os.path.expanduser('~/Library/Fonts/IBMPlexMono-Regular.ttf')
FPS, W, H, SR = 60, 1920, 1080, 48000
XF = 0.9   # the loop's dissolve, seconds

def cfg(name):
    return json.load(open(os.path.join(ROOT, 'tools', 'thread', name + '.json')))

def load_audio(path):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2).copy()

def env_of(a):   # loudness of a clip, 60 times a second (for the waveform)
    m = np.abs(a).mean(1); n = SR // FPS
    return np.array([m[i:i + n].mean() if i < len(m) else 0 for i in range(0, len(m), n)])

def main(name):
    C = cfg(name); pre = C['pre']
    if C.get('clips'):   # a montage: [prefix, from s, to s] pieces in order
        frames = []
        for cp, a, b in C['clips']:
            fl = sorted(f for f in os.listdir(CAP) if re.fullmatch(re.escape(cp) + r'\d{5}\.jpg', f))
            frames += fl[int(a * FPS):int(b * FPS)]
    else:
        frames = sorted(f for f in os.listdir(CAP) if re.fullmatch(re.escape(pre) + r'\d{5}\.jpg', f))
    if C.get('keep'): frames = [f for i, f in enumerate(frames) if any(a * FPS <= i < b * FPS for a, b in C['keep'])]
    for a, b in sorted(C.get('drop', []), reverse=True):
        frames = [f for i, f in enumerate(frames) if not (a * FPS <= i < b * FPS)]
        for ev in C.get('vo', []):
            if ev['t'] >= b: ev['t'] -= b - a
    N = len(frames); X = int(C.get('xf', XF) * FPS); L = N - X; T = N / FPS
    global W, H
    W, H = Image.open(os.path.join(CAP, frames[0])).size
    # depth: the top of the frame falls out of focus, as through a long lens
    band = int(H * C.get('blur_top', 0.38)); r_top = C.get('blur_r', 7.0)
    ramp = np.clip((band - np.arange(band)) / band, 0, 1) ** 1.25
    blur_mask = Image.fromarray(np.repeat((ramp * 255)[:, None], W, 1).astype(np.uint8))
    def depth(im):
        if band <= 0: return im
        top = im.crop((0, 0, W, band)); im.paste(Image.composite(top.filter(ImageFilter.GaussianBlur(r_top)), top, blur_mask), (0, 0)); return im
    # ---- sound: the theme, the voices, then the loop's dissolve
    mus = load_audio(THEME); m0 = int(C['music'] * SR); n = int(T * SR)
    theme = mus[m0:m0 + n].copy() * (10 ** (C.get('music_db', -3) / 20))
    voices = np.zeros_like(theme); duck = np.ones(len(theme), np.float32)
    vo_env = []   # (t0, envelope, text, who) for the waveform
    for ev in C.get('vo', []):
        a = load_audio(os.path.join(ROOT, ev['dir'], ev['f'] + '.mp3') if ev.get('dir') else os.path.join(VO, ev['f'] + '.mp3')) * (10 ** (ev.get('db', 0) / 20)) if ev.get('f') else np.zeros((int(ev['dur'] * SR), 2), np.float32)
        if ev.get('len'):   # only the first part of a line, faded out
            a = a[:int(ev['len'] * SR)].copy(); fo = min(len(a), int(0.35 * SR)); a[-fo:] *= np.linspace(1, 0, fo)[:, None]
        s = int(ev['t'] * SR); e = min(n, s + len(a))
        if e > s and ev.get('f'):
            voices[s:e] += a[:e - s]
            if ev.get('duck', True): duck[max(0, s - int(0.2 * SR)):min(n, e + int(0.3 * SR))] = C.get('duck', 0.4)
        vo_env.append((ev['t'], env_of(a) if ev.get('f') else None if False else env_of(a), ev.get('text', ''), ev.get('who', '') if ev.get('f') else '\0'))
    k = np.ones(int(0.25 * SR)) / int(0.25 * SR); duck = np.convolve(duck, k, 'same')
    if 'music_at' in C:   # the theme only from this moment, in hard (before it: silence)
        ma = int(C['music_at'] * SR); theme[:] = 0
        th = mus[m0:m0 + n - ma] * (10 ** (C.get('music_db', -3) / 20)); theme[ma:ma + len(th)] = th
        theme[ma:ma + int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))[:, None]
    if C.get('music_comp'):   # make the score loud and even: a slow compressor that lifts the quiet bars
        lv = np.sqrt(np.convolve((theme ** 2).mean(1), np.ones(int(0.4 * SR)) / int(0.4 * SR), 'same')) + 1e-5
        target = np.percentile(lv[lv > 1e-3], 90) if (lv > 1e-3).any() else 0.1
        gain = np.clip((target / lv) ** 0.7, 0.6, 5.0) * (lv > 1e-4)
        theme = theme * gain[:, None]
    fx = np.zeros_like(theme)
    SFXD = os.path.join(ROOT, 'tools/takes/sfx')
    def put(path, t, db, lp=None):
        a = load_audio(path) * (10 ** (db / 20))
        s0 = int(t * SR); e0 = min(n, s0 + len(a))
        if e0 > s0: fx[s0:e0] += a[:e0 - s0]
    if C.get('bed'):   # the storm: two rain takes and a gusting wind, looped, faded out at bed_end
        b0, b1 = C['bed']
        for f, db, off in [('rainloop-1', -6, 0), ('rainloop-2', -8, 5.5), ('windloop-2', -3, 0)]:
            a = load_audio(os.path.join(SFXD, f + '.mp3')); a = np.tile(a, (int(n / len(a)) + 3, 1))[int(off * SR):][:n] * (10 ** (db / 20))
            g = np.ones(n, np.float32); i0, i1 = int(b0 * SR), int(b1 * SR)
            g[i0:] = np.clip(1 - (np.arange(n - i0) / max(1, i1 - i0)), 0, 1)
            if f.startswith('wind'): g *= 1 + 0.5 * np.sin(2 * np.pi * np.arange(n) / SR / 6.5)
            fx += a * g[:, None]
    for f, t, db in C.get('hits', []): put(os.path.join(SFXD, f + '.mp3'), t, db)
    for f, t_end, db in C.get('rev', []):   # a take played backwards so that it ends exactly on a beat (a swell sucked into it)
        a = load_audio(os.path.join(SFXD, f + '.mp3'))[::-1] * (10 ** (db / 20)); s0 = int(t_end * SR) - len(a)
        if s0 < 0: a = a[-s0:]; s0 = 0
        fx[s0:s0 + len(a)] += a[:max(0, n - s0)]
    for f, t0, t1, db, *fade in C.get('spans', []):   # a loop laid under a stretch, faded in and out
        a = load_audio(os.path.join(SFXD, f + '.mp3')); i0, i1 = int(t0 * SR), min(n, int(t1 * SR)); Ls = i1 - i0
        a = np.tile(a, (Ls // len(a) + 2, 1))[:Ls] * (10 ** (db / 20)); fi, fo = (fade + [0.4, 0.6])[:2]
        g = np.minimum(1, np.minimum(np.arange(Ls) / max(1, fi * SR), (Ls - np.arange(Ls)) / max(1, fo * SR)))
        fx[i0:i1] += a * g[:, None]
    rng = np.random.default_rng(7)
    def lowpass(x, fc):   # one-pole, per sample cutoff
        y = np.empty_like(x); z = 0.0; k = 1 - np.exp(-2 * np.pi * np.asarray(fc) / SR) * np.ones(len(x))
        for i in range(len(x)): z += k[i] * (x[i] - z); y[i] = z
        return y
    for kind, t0, *rest in C.get('synth', []):   # sounds made here: the rise into the change, the boom of it, the fire's roar
        i0 = int(t0 * SR)
        if kind == 'riser':   # noise sweeping up and swelling, with a tone climbing under it, cut dead on t1
            t1, db = rest; Ls = int((t1 - t0) * SR); u = np.arange(Ls) / Ls
            nz = rng.standard_normal(Ls); hi = lowpass(nz, 300 + 6000 * u ** 2); lo = lowpass(hi, 80 + 1200 * u ** 2)
            bnd = (hi - lo) * 3.2
            f = 70 * 2 ** (u * 3.2); ph = 2 * np.pi * np.cumsum(f) / SR
            tone = 0.35 * np.sin(ph) + 0.18 * np.sin(2 * ph + 0.3) + 0.1 * np.sin(3.01 * ph)
            sig = (bnd + tone) * u ** 2.2; st = np.stack([sig * (1 + 0.15 * np.sin(u * 40)), sig * (1 - 0.15 * np.sin(u * 40))], 1)
        elif kind == 'boom':   # a falling sub thump with a burst of noise on top
            db, = rest; Ls = int(2.4 * SR); tt = np.arange(Ls) / SR
            f = 38 + 70 * np.exp(-tt * 9); ph = 2 * np.pi * np.cumsum(f) / SR
            sub = np.sin(ph) * np.exp(-tt * 1.6) * np.minimum(1, tt / 0.004)
            nz = lowpass(rng.standard_normal(Ls), 2500) * np.exp(-tt * 5) * 0.9
            sig = np.tanh((sub * 1.3 + nz) * 1.4); st = np.stack([sig, sig], 1)
        elif kind == 'roar':   # fire: brown rumble, a breathing hiss, and crackle, swelling in and out over t0..t1
            t1, db = rest; Ls = int((t1 - t0) * SR); u = np.arange(Ls) / Ls
            br = np.cumsum(rng.standard_normal(Ls)); br = br - lowpass(br, 8); br /= np.abs(br).max() + 1e-9
            hiss = rng.standard_normal(Ls); hiss = hiss - lowpass(hiss, 1800); hiss *= 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * u * (t1 - t0) * 1.3) ** 2)
            cr = (rng.random(Ls) < 0.0016) * rng.standard_normal(Ls) * 2.2; cr = cr - lowpass(cr, 900)
            env = np.minimum(1, np.minimum(u / 0.25, (1 - u) / 0.3)).clip(0)
            sig = (br * 0.9 + hiss + cr * 0.5) * env; st = np.stack([sig, np.roll(sig, 240)], 1)
        else: continue
        st = st * (10 ** (db / 20)); e = min(n, i0 + len(st)); fx[i0:e] += st[:e - i0]
    if C.get('strikes'):   # thunder where the game's lightning struck: near ones crack, far ones roll in late
        meta = json.load(open(os.path.join(CAP, C['strikes']))); last = -9; i = 0
        for st in meta['strikes']:
            t, d, big = st['t'], st['d'], st['big']
            if t - last < 0.5 or t > C.get('strikes_until', 1e9): continue
            last = t; i += 1
            if d < 260: put(os.path.join(SFXD, f'crack-{1 + i % 2}.mp3'), t + 0.02, -9 + 4 * big)
            put(os.path.join(SFXD, f'thunder-{1 + i % 3}.mp3'), t + min(d / 343, 2.0) + 0.2, -6 - d / 250 + 3 * big)
    theme = theme * duck[:, None] if 'music_at' not in C else theme
    out = (theme * duck[:, None] if 'music_at' not in C else theme) + voices + fx * (10 ** (C.get('fx_db', 0) / 20))
    # the loop: the last XF seconds laid over the first, fading from the end into the beginning
    nL, nX = int(L / FPS * SR), int(X / FPS * SR)
    if len(out) < nL + nX: out = np.concatenate([out, np.repeat(out[-1:], nL + nX - len(out), 0)])
    w = np.linspace(0, 1, nX)[:, None]
    loop = out[:nL].copy(); loop[:nX] = out[nL:nL + nX] * (1 - w) + out[:nX] * w
    peak = np.abs(loop).max() or 1; loop = loop / peak * 0.89
    wav = os.path.join(ROOT, 'tools', 'thread', name + '.f32')
    loop.astype(np.float32).tofile(wav)
    # ---- picture
    out_dir = os.path.join(os.environ.get('THREAD_WORK', '/private/tmp/icarus-thread'), name); os.makedirs(out_dir, exist_ok=True)   # (off the Desktop: iCloud chokes on gigabytes of frames)
    AUDIO_ONLY = os.environ.get('AUDIO_ONLY') and len(os.listdir(out_dir)) == L   # (a remix: the frames from the last run are still good)
    if not AUDIO_ONLY:
        for f in os.listdir(out_dir): os.remove(os.path.join(out_dir, f))
    font = ImageFont.truetype(FR, 30)
    global SHADE, SHADE_A
    g = np.clip((np.arange(H) - (H - 330)) / 330, 0, 1) ** 1.4 * 150   # a soft fall to dark under the words
    SHADE_A = Image.fromarray(np.repeat(g[:, None], W, 1).astype(np.uint8)); SHADE = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    zooms = C.get('zoom', [])
    def frame(i):
        im = Image.open(os.path.join(CAP, frames[i])).convert('RGB')
        t = i / FPS
        for t0, t1, z0, z1 in zooms:   # a slow push-in on a held shot
            if t0 <= t < t1:
                u = (t - t0) / (t1 - t0); u = u * u * (3 - 2 * u); z = z0 + (z1 - z0) * u
                w2, h2 = W / z, H / z; x0, y0 = (W - w2) / 2, (H - h2) * 0.42
                im = im.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + w2, y0 + h2)); break
        return depth(im)
    def caption(im, t):
        live = [(t0, e, text, who) for t0, e, text, who in vo_env if text and t0 - 0.15 <= t <= t0 + max(1.6, len(e) / FPS) + 0.5]
        if not live: return im
        t0, e, text, who = live[-1]
        a = min(1, (t - t0 + 0.15) / 0.15, (t0 + max(1.6, len(e) / FPS) + 0.5 - t) / 0.4)
        lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        x0, y0 = 96, H - 120
        # the waveform: 14 thin bars, the voice's loudness just now
        j = int((t - t0) * FPS)
        bars = who != '\0'
        if not bars: who = ''
        for b in (range(14) if bars else []):
            v = e[j - (13 - b) * 2] if 0 <= j - (13 - b) * 2 < len(e) else 0
            h = 4 + min(36, v * 260)
            d.rounded_rectangle((x0 + b * 7, y0 + 18 - h / 2, x0 + b * 7 + 3, y0 + 18 + h / 2), radius=1.5, fill=(255, 236, 214, int(230 * a)))
        tx = x0 + 14 * 7 + 22 if bars else x0
        if who: d.text((tx, y0 - 26), who, font=ImageFont.truetype(FR, 18), fill=(255, 170, 110, int(200 * a)))
        d.text((tx, y0), text, font=font, fill=(255, 250, 244, int(240 * a)), stroke_width=2, stroke_fill=(0, 0, 0, int(150 * a)))
        sh = SHADE.copy(); sh.putalpha(SHADE_A.point(lambda v: int(v * a)))
        return Image.alpha_composite(Image.alpha_composite(im.convert('RGBA'), sh), lay).convert('RGB')
    for i in range(0 if not AUDIO_ONLY else L, L):
        im = caption(frame(i), i / FPS)
        if i < X:   # the head of the loop takes over from the tail
            tail = caption(frame(L + i), (L + i) / FPS)
            u = (i + 0.5) / X; u = u * u * (3 - 2 * u)
            im = Image.blend(tail, im, u)
        im.save(os.path.join(out_dir, f'{i:05d}.jpg'), quality=94)
    outp = os.path.join(ROOT, 'clips', f'icarus-x-{name}.mp4')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(out_dir, '%05d.jpg'),
                    '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', wav, '-map', '0:v', '-map', '1:a',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', str(FPS),
                    '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', outp], check=True)
    os.remove(wav)
    print('done', outp, round(L / FPS, 2), 's loop')

def ffdur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout)

if __name__ == '__main__': main(sys.argv[1])
