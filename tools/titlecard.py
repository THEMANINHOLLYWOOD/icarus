# The title-card loop: tools/reel6.js's frames (the bird down from Olympus) with the title laid over them, made seamless and
# encoded. Not deployed.
#   python3 tools/titlecard.py   → clips/icarus-title-loop-1080.mp4, -720.mp4, .gif, -still-1080.jpg (+ -clean-1080.mp4, no card)
# Needs tools/cap/t00000.jpg… (one loop plus half a second) and tools/cap/tcard.png, thint.png (reel6.js ?card=1).
# The last half second is laid over the first, fading from the end into the beginning, so the loop has no seam.
import glob, os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP, OUT, WORK = os.path.join(ROOT, 'tools/cap'), os.path.join(ROOT, 'clips'), os.path.join(ROOT, 'tools/cap-title')
FPS, T, PREFIX, NAME = 60, float(os.environ.get('T', '9')), os.environ.get('PREFIX', 't'), os.environ.get('NAME', 'icarus-title-loop')
OW, OH = 1920, 1080
os.makedirs(OUT, exist_ok=True)

frames = sorted(glob.glob(os.path.join(CAP, PREFIX + '[0-9]*.jpg')))
N = int(round(T * FPS)); X = len(frames) - N
if X < 6: sys.exit(f'need {N + 6}+ frames, have {len(frames)}')
print(f'{len(frames)} frames: loop {N}, overlap {X}')

def layer(name):   # a transparent overlay at the frame's size, scaled with its alpha premultiplied (no dark fringes)
    im = Image.open(os.path.join(CAP, PREFIX + name)).convert('RGBa').resize((OW, OH), Image.LANCZOS).convert('RGBA')
    a = np.asarray(im, dtype=np.float32) / 255.0
    return a[..., :3], a[..., 3:4]
card_rgb, card_a = layer('card.png')
hint_rgb, hint_a = layer('hint.png')

# SPACE TO FLY blinks as the page has it: @keyframes blink { 50% { opacity: .35 } } over 1.8 s, each half eased (CSS 'ease')
def css_ease(x):
    # cubic-bezier(.25, .1, .25, 1): solve for the curve's parameter, then read its y
    lo, hi = 0.0, 1.0
    for _ in range(40):
        t = (lo + hi) / 2
        bx = 3 * (1 - t) ** 2 * t * 0.25 + 3 * (1 - t) * t * t * 0.25 + t ** 3
        lo, hi = (t, hi) if bx < x else (lo, t)
    t = (lo + hi) / 2
    return 3 * (1 - t) ** 2 * t * 0.1 + 3 * (1 - t) * t * t * 1.0 + t ** 3
def blink(sec):
    x = (sec % 1.8) / 1.8
    return 1 - 0.65 * css_ease(x / 0.5) if x < 0.5 else 0.35 + 0.65 * css_ease((x - 0.5) / 0.5)

def over(base, rgb, a, k=1.0):
    return base * (1 - a * k) + rgb * a * k

for d in [WORK, WORK + '-clean']:
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, '*.png')): os.remove(f)
for i in range(N):
    a = Image.open(frames[i]).convert('RGB').resize((OW, OH), Image.LANCZOS)
    if i < X:   # the head of the loop takes over from the tail of the recording, gradually
        b = Image.open(frames[N + i]).convert('RGB').resize((OW, OH), Image.LANCZOS)
        w = (i + 0.5) / X
        a = Image.blend(b, a, w * w * (3 - 2 * w))
    a.save(os.path.join(WORK + '-clean', f'{i:05d}.png'))
    px = np.asarray(a, dtype=np.float32) / 255.0
    px = over(px, card_rgb, card_a)
    px = over(px, hint_rgb, hint_a, blink(i / FPS))
    Image.fromarray(np.clip(px * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(WORK, f'{i:05d}.png'))
    if i % 60 == 0: print('frame', i)

def ff(*args): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], check=True)
src = ['-framerate', str(FPS), '-i', os.path.join(WORK, '%05d.png')]
ff(*src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(OUT, f'{NAME}-1080.mp4'))
ff(*src, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(OUT, f'{NAME}-720.mp4'))
ff(*src, '-vf', 'fps=20,scale=640:360:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', '-loop', '0', os.path.join(OUT, f'{NAME}.gif'))
ff('-framerate', str(FPS), '-i', os.path.join(WORK + '-clean', '%05d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(OUT, f'{NAME}-clean-1080.mp4'))
# the still: the bird on the face of the mountain beside the sun, the card over it
pick = int(os.environ.get('STILL_AT', str(int(FPS * 5.3))))
Image.open(os.path.join(WORK, f'{pick:05d}.png')).save(os.path.join(OUT, f'{NAME}-still-1080.jpg'), quality=92)
for f in [f'{NAME}-1080.mp4', f'{NAME}-720.mp4', f'{NAME}.gif', f'{NAME}-still-1080.jpg', f'{NAME}-clean-1080.mp4']:
    print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1e6, 2), 'MB')
