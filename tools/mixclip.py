#!/usr/bin/env python3
# Finish a recorded clip: lay real thunder over the game's own soundtrack wherever lightning struck (from meta.json),
# put the spoken line on screen, fade in and out, and encode a full-quality and a posting-size MP4.
# Usage: python3 tools/mixclip.py tools/cap clips/icarus-leap-cinematic
import json, subprocess, sys, os
cap, out = sys.argv[1], sys.argv[2]
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'takes', 'sfx')
meta = json.load(open(os.path.join(cap, 'meta.json')))
log = {k: v for k, v, *_ in meta['log']}
secs = len([f for f in os.listdir(cap) if f.startswith('f') and f.endswith('.jpg')]) / 60
cracks, rolls = [f'{T}/crack-1.mp3', f'{T}/crack-2.mp3'], [f'{T}/thunder-2.mp3', f'{T}/thunder-1.mp3', f'{T}/thunder-3.mp3']
# how loud each take is, so one gain rule fits them all
def lufs(f):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float([l for l in r.splitlines() if l.strip().startswith('I:')][-1].split()[1])
level = {f: lufs(f) for f in cracks + rolls}
hits, last, ci, ri = [], -9, 0, 0
for s in meta['strikes']:
    t, d, big = s['t'], s['d'], s['big']
    if t - last < 0.45 and d > 300: continue   # don't pile far ones on top of each other
    last = t
    if d < 260: f = cracks[ci % 2]; ci += 1; delay = t + d / 343; db = -14 + 6 * big
    else: f = rolls[ri % 3]; ri += 1; delay = t + min(d / 343, 2.2); db = -16 - d / 220 + 4 * big
    hits.append((f, delay, db - (level[f] + 14)))   # gain relative to a take at -14 LUFS
inputs = ['-framerate', '60', '-i', f'{cap}/f%05d.jpg', '-i', f'{cap}/audio.wav', '-loop', '1', '-framerate', '60', '-i', f'{cap}/sub.png']
fx = ['[0:v]fade=t=in:st=0:d=0.6,fade=t=out:st=%.2f:d=1.4' % (secs - 1.4)]
e = log.get('edge', 3.15) + 0.2
fx = [f"[2:v]format=rgba,fade=t=in:st={e:.2f}:d=0.4:alpha=1,fade=t=out:st={e + 3.2:.2f}:d=0.5:alpha=1[s]",
      f"[0:v][s]overlay=0:0:eof_action=pass,fade=t=in:st=0:d=0.6,fade=t=out:st={secs - 1.4:.2f}:d=1.4,format=yuv420p[v]"]
mix = ['[1:a]volume=0.8[base]']
for i, (f, at, g) in enumerate(hits):
    inputs += ['-i', f]
    ms = int(at * 1000)
    mix.append(f'[{3 + i}:a]aresample=48000,aformat=channel_layouts=stereo,volume={g:.1f}dB,adelay={ms}|{ms}[h{i}]')
mix.append('[base]' + ''.join(f'[h{i}]' for i in range(len(hits))) + f'amix=inputs={len(hits) + 1}:normalize=0:duration=first,alimiter=limit=0.95,loudnorm=I=-14:TP=-1:LRA=14,afade=t=in:st=0:d=0.3,afade=t=out:st={secs - 1.6:.2f}:d=1.6[a]')
cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(fx + mix), '-map', '[v]', '-map', '[a]', '-frames:v', str(int(secs * 60)),
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '60', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', f'{secs:.2f}', '-movflags', '+faststart', out + '.mp4']
print(len(hits), 'thunder hits:', [(os.path.basename(f), round(a, 2), round(g, 1)) for f, a, g in hits])
subprocess.run(cmd, check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', out + '.mp4', '-c:v', 'libx264', '-preset', 'slow', '-b:v', '5000k', '-maxrate', '6200k', '-bufsize', '12000k',
                '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out + '-small.mp4'], check=True)
print('done', out + '.mp4', out + '-small.mp4')
