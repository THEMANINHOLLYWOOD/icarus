# Turns the reel's frames (tools/cap/r*.jpg, from tools/reel.js) into the finished loop and the share image. Not deployed.
#   python3 tools/reelmake.py            → clips/icarus-loop-1080.mp4, -720.mp4, icarus-loop.gif, icarus-share-*.jpg, og/…
# The recording is one loop (8 s) plus half a second. That extra half second is laid over the first half second, fading
# from the end into the beginning, so the last frame flows into the first with no seam.
import glob, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP, OUT, OG = os.path.join(ROOT, 'tools/cap'), os.path.join(ROOT, 'clips'), os.path.join(ROOT, 'og')
WORK = os.path.join(ROOT, 'tools/cap-reel')
FPS = 60
T = float(os.environ.get('T', '8'))                      # loop length in seconds
PREFIX = os.environ.get('PREFIX', 'r')                    # frame names from the recorder (r: the rise, s: across the sun)
NAME = os.environ.get('NAME', 'icarus-loop')              # output file stem
TEXT = os.environ.get('TEXT', '1') == '1'                 # words on the share image, or the picture alone
CROP_TOP = float(os.environ.get('CROP_TOP', '0.28'))      # where the 1200x630 card is cut from the square
os.makedirs(OUT, exist_ok=True); os.makedirs(OG, exist_ok=True); os.makedirs(WORK, exist_ok=True)

frames = sorted(glob.glob(os.path.join(CAP, PREFIX + '[0-9]*.jpg')))
N = int(round(T * FPS)); X = len(frames) - N          # loop length, and the overlap
if X < 6: sys.exit(f'need {N + 6}+ frames, have {len(frames)}')
print(f'{len(frames)} frames: loop {N}, overlap {X}')

# 1. the loop, 1080 square, with the seam blended away (and every frame scaled down once, from 2160, for a sharper picture)
for f in glob.glob(os.path.join(WORK, '*.png')): os.remove(f)
OW, OH = [int(v) for v in os.environ.get('SIZE', '1080x1080').split('x')]   # output size (the recording is twice this)
for i in range(N):
    a = Image.open(frames[i]).convert('RGB').resize((OW, OH), Image.LANCZOS)
    if i < X:   # the head of the loop takes over from the tail of the recording, gradually
        b = Image.open(frames[N + i]).convert('RGB').resize((OW, OH), Image.LANCZOS)
        w = (i + 0.5) / X
        a = Image.blend(b, a, w * w * (3 - 2 * w))
    a.save(os.path.join(WORK, f'{i:05d}.png'))
print('frames blended')

def ff(*args): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], check=True)
src = ['-framerate', str(FPS), '-i', os.path.join(WORK, '%05d.png')]
ff(*src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(OUT, f'{NAME}-1080.mp4'))
ff(*src, '-vf', 'scale=-2:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(OUT, f'{NAME}-720.mp4'))
if os.environ.get('GIF', '1') == '1':
  # the GIF, 25 a second, its own palette
  ff(*src, '-vf', 'fps=20,scale=400:400:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', '-loop', '0', os.path.join(OUT, f'{NAME}.gif'))
print('videos encoded')

# 2. the share image, 1200 x 630: the strongest frame, wide, with the name across it in the game's own mono letters
def mono(size, bold=True):
    for p in ['/System/Library/Fonts/Menlo.ttc', '/System/Library/Fonts/SFNSMono.ttf', '/Library/Fonts/Courier New Bold.ttf']:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size, index=1 if bold and p.endswith('.ttc') else 0)
            except Exception: pass
    return ImageFont.load_default()
pick = int(os.environ.get('SHARE_AT', str(int(FPS * 2.6))))    # whole, red, flying at the sun
full = Image.open(frames[pick]).convert('RGB')                 # 2160 square
W, H = 1200, 630
top = int(full.height * CROP_TOP)   # (the rise: bird and sun in the upper half, the words below)
crop = full.crop((0, top, full.width, top + int(full.width * H / W))).resize((W, H), Image.LANCZOS)
img = crop.copy()
if TEXT:
  # a dark band along the bottom so the words read over anything
  shade = Image.new('L', (W, H), 0); d = ImageDraw.Draw(shade)
  for y in range(H): d.line([(0, y), (W, y)], fill=int(225 * min(1, max(0, (y - H * 0.5) / (H * 0.38))) ** 1.3))
  img = Image.composite(Image.new('RGB', (W, H), (5, 7, 13)), img, shade)
  d = ImageDraw.Draw(img)
  def spaced(text, font, y, fill, gap):
      widths = [d.textlength(ch, font=font) for ch in text]; total = sum(widths) + gap * (len(text) - 1); x = (W - total) / 2
      for ch, w in zip(text, widths): d.text((x, y), ch, font=font, fill=fill); x += w + gap
  title, sub, url = mono(92), mono(22, False), mono(24)
  # the name, with a red glow under it
  glow = Image.new('RGB', (W, H), (0, 0, 0)); gd = ImageDraw.Draw(glow)
  wt = [gd.textlength(ch, font=title) for ch in 'ICARUS']; x = (W - (sum(wt) + 30 * 5)) / 2
  for ch, w in zip('ICARUS', wt): gd.text((x, 418), ch, font=title, fill=(255, 40, 14)); x += w + 30
  glow = glow.filter(ImageFilter.GaussianBlur(14))
  img = Image.fromarray(np.clip(np.asarray(img, dtype='int16') + np.asarray(glow, dtype='int16'), 0, 255).astype('uint8'))
  d = ImageDraw.Draw(img)
  spaced('ICARUS', title, 418, (255, 236, 214), 30)
  spaced('THE LAST EMBER', sub, 528, (255, 176, 96), 11)
  spaced('justkeepflying.com', url, 572, (232, 220, 200), 3)
SITE = os.environ.get('OG', '1') == '1'   # (OG=0: leave the site's share files alone)
for p in [os.path.join(OUT, f'{NAME}-share-1200x630.jpg')] + ([os.path.join(OG, 'icarus-share.jpg')] if SITE else []): img.save(p, quality=90, optimize=True, progressive=True)
# and a square still of the same moment, for posts
Image.open(os.path.join(WORK, f'{min(pick, N - 1):05d}.png')).save(os.path.join(OUT, f'{NAME}-still-1080.jpg'), quality=92)
# the loop for the page's own share card (small enough to serve)
import shutil
if SITE: shutil.copy(os.path.join(OUT, f'{NAME}-720.mp4'), os.path.join(OG, 'icarus-loop.mp4'))
for f in [f'{NAME}-1080.mp4', f'{NAME}-720.mp4', f'{NAME}.gif', f'{NAME}-share-1200x630.jpg', f'{NAME}-still-1080.jpg']:
    print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1e6, 2), 'MB')
