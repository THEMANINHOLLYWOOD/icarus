#!/usr/bin/env python3
# The thread's opener: the storm cut (clips/icarus-leap-storm.mp4) with Icarus actually saying "I have to let go" on the
# tower. The old burned-in subtitle (it carried the player's name) is blurred away and the line is laid on in the
# thread's minimal style: small lowercase words and a live waveform of his voice. Not deployed.
#   python3 tools/opener.py   → clips/icarus-x-opener.mp4
import os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, VO = os.path.join(ROOT, 'clips/icarus-leap-storm.mp4'), os.path.join(ROOT, 'voice/letgo.mp3')
OUT = os.path.join(ROOT, 'clips/icarus-x-opener.mp4')
WORK = '/private/tmp/icarus-thread/opener'
FPS, W, H, SR = 60, 1920, 1080, 48000
SUB0, SUB1 = 3.3, 7.9           # the old subtitle is on screen between these
SAY = 3.55                      # when he says it
BOX = (700, 925, 1220, 1045)    # where the old subtitle sits

def load(p):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2)

vo = load(VO); m = np.abs(vo).mean(1); n = SR // FPS
env = np.array([m[i:i + n].mean() for i in range(0, len(m), n)])
os.makedirs(WORK, exist_ok=True)
for f in os.listdir(WORK): os.remove(os.path.join(WORK, f))
font = ImageFont.truetype(os.path.expanduser('~/Library/Fonts/IBMPlexMono-Regular.ttf'), 30)
g = np.clip((np.arange(H) - (H - 330)) / 330, 0, 1) ** 1.6 * 90
shade_a = np.repeat(g[:, None], W, 1)
from PIL import ImageFilter
x0b, y0b, x1b, y1b = BOX   # a soft dark pool over where the old subtitle was, feathered so it has no edge
pool = Image.new('L', (W, H), 0); ImageDraw.Draw(pool).rounded_rectangle((x0b - 10, y0b - 5, x1b + 10, y1b + 10), radius=40, fill=235)
pool = np.asarray(pool.filter(ImageFilter.GaussianBlur(28)), np.float32)
N = int((SUB1 - SUB0) * FPS)
for i in range(N):
    t = SUB0 + i / FPS
    a = min(1, (t - SUB0) / 0.25, (SUB1 - t) / 0.4)
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    x0, y0 = 96, H - 120
    j = int((t - SAY) * FPS)
    for b in range(14):
        k = j - (13 - b) * 2
        v = env[k] if 0 <= k < len(env) else 0
        h = 4 + min(36, v * 260)
        d.rounded_rectangle((x0 + b * 7, y0 + 18 - h / 2, x0 + b * 7 + 3, y0 + 18 + h / 2), radius=1.5, fill=(255, 236, 214, int(230 * a)))
    d.text((x0 + 14 * 7 + 22, y0), 'i have to let go', font=font, fill=(255, 250, 244, int(235 * a)))
    sh = Image.fromarray((shade_a * a).astype(np.uint8))
    base = Image.new('RGBA', (W, H), (0, 0, 0, 0)); base.putalpha(sh)
    Image.alpha_composite(base, lay).save(os.path.join(WORK, f'{i:05d}.png'))

x0, y0, x1, y1 = BOX
ZOOM_END = 9.02   # the strike's white flash hides the change back to the full frame
fc = (f"[0:v]split[a][b];[b]crop=1584:891:168:20,scale={W}:{H}:flags=lanczos[z];"
      f"[a][z]overlay=0:0:enable='lt(t,{ZOOM_END})'[v1];"
      f"[2:v]setpts=PTS-STARTPTS+{SUB0}/TB,format=rgba[cap];[v1][cap]overlay=0:0:eof_action=pass,format=yuv420p[v];"
      f"[0:a]volume='if(between(t,{SAY - 0.2},{SAY + 3.3}),0.55,1)':eval=frame[bed];"
      f"[1:a]aresample={SR},volume=1.6,adelay={int(SAY * 1000)}|{int(SAY * 1000)}[vo];"
      f"[bed][vo]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]")
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', SRC, '-i', VO, '-framerate', str(FPS), '-i', os.path.join(WORK, '%05d.png'),
                '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
                '-r', str(FPS), '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', OUT], check=True)
print('done', OUT)
