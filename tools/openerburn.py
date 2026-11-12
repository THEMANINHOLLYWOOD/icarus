#!/usr/bin/env python3
# The opener, with the game's own title: the leap clip re-scored as in leapscore.py, but at the cut the bird flies on
# through the night storm while ICARUS burns across the whole screen (the game's titleBurn, recorded by tools/reel7.js as
# tb_*.jpg), and the theme comes in loud from the top of its first sung "Icarus", the way the game plays it.
# Was: re-score the leap clip: no spoken lines, a real storm on the tower, the red ICARUS card cut in where the bird levels out,
# and the theme's big drop slammed in as the picture comes back, so the bird flies out into the dawn on the music.
#   python3 tools/leapscore.py   → clips/icarus-leap-storm.mp4 (+ -small.mp4)
# Picture: clips/icarus-leap-oldlook.mp4 (its old soundtrack is thrown away). Sounds: tools/takes/sfx, music/icarus-theme.mp3.
import os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'clips/icarus-leap-oldlook.mp4')
SFX, THEME = os.path.join(ROOT, 'tools/takes/sfx'), os.path.join(ROOT, 'music/icarus-theme.mp3')
WORK = os.environ.get('TITLE_FRAMES', '/private/tmp/icarus-cap')
OUT = '/private/tmp/icarus-thread/leap-burn'
FONT = os.path.expanduser('~/Library/Fonts/IBMPlexMono-SemiBold.ttf')
FONT_SUB = os.path.expanduser('~/Library/Fonts/IBMPlexMono-Regular.ttf')
FPS, W, H = 60, 1920, 1080
CUT = 20.5          # where the card goes in (the bird has just levelled out, still in the dark)
CARD = 6.6          # the title shot: 0.5 s of flight, the 5.6 s burn, a beat after
SONG_AT = 6.15      # where the song comes in: its first sung "Icarus" (the game's VOCAL_AT is 6.2)
BURN = 0.5          # the title starts burning this far into the title shot
SRC_LEN = 40.0
TOTAL = SRC_LEN + CARD

# ---------- the sound ----------
def sfx(n): return os.path.join(SFX, n + '.mp3')
LUFS = {'thunder-1': -23.4, 'thunder-2': -18.9, 'thunder-3': -30.2, 'crack-1': -15.0, 'crack-2': -13.1, 'rainloop-1': -18.1, 'rainloop-2': -15.5,
        'windloop-1': -24.5, 'windloop-2': -20.9, 'fallloop-2': -23.5, 'diveloop-2': -8.9, 'whoosh-1': -21.5, 'whoosh-3': -24.5, 'ignite-1': -6.8,
        'surge-1': -11.3, 'wingsopen-1': -18.6, 'wingsopen-2': -18.9, 'flap-2': -17.3}
REV = 'aecho=0.8:0.6:90|210|420:0.35|0.22|0.12'           # a big sky to bounce off
hits = []   # (name, at, target LUFS, extra filter)
def hit(n, at, lufs, fx=''): hits.append((n, at, lufs, fx))
# lightning on the tower (the flashes in the picture): near ones crack at once, far ones roll in late
for at, kind, lufs in [(0.5, 'crack-1', -17), (1.9, 'thunder-2', -21), (3.8, 'crack-2', -18), (5.4, 'crack-1', -16), (7.1, 'thunder-1', -21), (8.0, 'crack-2', -19)]:
    hit(kind, at + (0.55 if kind.startswith('thunder') else 0.03), lufs, REV)
    if kind.startswith('crack'): hit('thunder-2' if at < 4 else 'thunder-1', at + 0.35, lufs - 4, REV + ',lowpass=f=900')
# the strike that sets him alight
hit('crack-2', 9.0, -11, REV); hit('thunder-2', 9.15, -14, REV + ',lowpass=f=700'); hit('ignite-1', 9.05, -13); hit('surge-1', 9.3, -17)
hit('thunder-1', 10.6, -22, REV + ',lowpass=f=800'); hit('thunder-3', 12.4, -23, REV + ',lowpass=f=600')
# the fall, the wings, the turn
hit('fallloop-2', 9.8, -19, 'afade=t=in:d=1.2,afade=t=out:st=5.4:d=1.6')
hit('wingsopen-1', 15.0, -18); hit('whoosh-1', 16.6, -20); hit('flap-2', 18.2, -21); hit('whoosh-3', 19.3, -21)
# the title: one huge clap as the name ignites
hit('crack-2', CUT + BURN, -10, REV); hit('thunder-2', CUT + BURN + 0.1, -15, REV + ',lowpass=f=600'); hit('ignite-1', CUT + BURN, -12)
# back into the picture on the drop: rush of air as the bird comes out of the cloud
B = CUT + CARD
hit('whoosh-1', B - 0.25, -17); hit('wingsopen-2', B + 0.9, -20); hit('flap-2', B + 4.2, -24)

inputs, chains, labels = [], [], []
def add_input(args):
    inputs.extend(args); return len([a for a in inputs if a == '-i']) - 1
# the storm bed: two rain takes looped against each other, wind gusting under them; it thins out once the sun is up
r1 = add_input(['-stream_loop', '-1', '-i', sfx('rainloop-1')]); r2 = add_input(['-stream_loop', '-1', '-i', sfx('rainloop-2')])
w1 = add_input(['-stream_loop', '-1', '-i', sfx('windloop-2')])
bed_end = B + 3.0
chains.append(f'[{r1}:a]aresample=48000,aformat=channel_layouts=stereo,volume={-20 - LUFS["rainloop-1"]:.1f}dB,atrim=0:{TOTAL}[ra]')
chains.append(f'[{r2}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=5.5,asetpts=PTS-STARTPTS,volume={-21 - LUFS["rainloop-2"]:.1f}dB,atrim=0:{TOTAL}[rb]')
chains.append(f'[{w1}:a]aresample=48000,aformat=channel_layouts=stereo,volume={-22 - LUFS["windloop-2"]:.1f}dB,'
              f"volume='1+0.6*sin(2*PI*t/6.5)':eval=frame,atrim=0:{TOTAL}[wd]")
chains.append(f'[ra][rb][wd]amix=inputs=3:normalize=0,afade=t=in:d=0.8,afade=t=out:st={CUT + BURN:.2f}:d=3.0,atrim=0:{TOTAL}[bed]')
labels.append('[bed]')
# a low sub-boom under the strike and under the card slam (the takes are thin in the bottom end)
for j, at in enumerate([9.0, CUT + BURN]):
    chains.append(f"aevalsrc='0.9*sin(2*PI*(32+40*exp(-t*5))*t)*exp(-t*1.4)|0.9*sin(2*PI*(32+40*exp(-t*5))*t)*exp(-t*1.4)':s=48000:d=4,"
                  f'volume=-6dB,adelay={int(at * 1000)}|{int(at * 1000)}[sub{j}]')
    labels.append(f'[sub{j}]')
for j, (n, at, lufs, fx) in enumerate(hits):
    k = add_input(['-i', sfx(n)]); ms = int(at * 1000)
    chains.append(f'[{k}:a]aresample=48000,aformat=channel_layouts=stereo,volume={lufs - LUFS[n]:.1f}dB{"," + fx if fx else ""},adelay={ms}|{ms}[h{j}]')
    labels.append(f'[h{j}]')
# the score: in hard and loud from its first sung "Icarus", as the name burns, and on through the flight
mstart = CUT + BURN
m = add_input(['-ss', f'{SONG_AT:.3f}', '-i', THEME])
chains.append(f'[{m}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{TOTAL - mstart:.3f},'
              f"volume=4dB,afade=t=in:d=0.04,afade=t=out:st={TOTAL - mstart - 2.6:.2f}:d=2.6,"
              f'adelay={int(mstart * 1000)}|{int(mstart * 1000)}[mus]')
labels.append('[mus]')
chains.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0:duration=longest,atrim=0:{TOTAL},'
              f'alimiter=limit=0.89:attack=3:release=60,afade=t=out:st={TOTAL - 0.6:.2f}:d=0.6[a]')

# picture: tower → card → back to the bird, a white flash on the drop
cardin = add_input(['-framerate', str(FPS), '-i', os.path.join(WORK, 'tb_%05d.jpg')])
v = add_input(['-i', SRC])
chains += [f'[{v}:v]split[va][vb]',
           f'[va]trim=0:{CUT},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.6,format=yuv420p,setsar=1[p1]',
           f'[{cardin}:v]scale={W}:{H},format=yuv420p,setsar=1,fps={FPS}[p2]',
           f'color=c=0xfff2e0:s={W}x{H}:r={FPS}:d=0.5,format=rgba,fade=t=out:st=0:d=0.45:alpha=1[wf]',
           f'[vb]trim={CUT}:{SRC_LEN},setpts=PTS-STARTPTS[vb2]',
           f'[vb2][wf]overlay=eof_action=pass,fade=t=out:st={SRC_LEN - CUT - 1.4:.2f}:d=1.4,format=yuv420p,setsar=1[p3]',
           '[p1][p2][p3]concat=n=3:v=1:a=0[v]']
cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', '[v]', '-map', '[a]',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', str(FPS),
       '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', f'{TOTAL:.3f}', '-movflags', '+faststart', OUT + '.mp4']
subprocess.run(cmd, check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', OUT + '.mp4', '-c:v', 'libx264', '-preset', 'slow', '-b:v', '5000k', '-maxrate', '6200k',
                '-bufsize', '12000k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT + '-small.mp4'], check=True)
print('done', OUT + '.mp4', OUT + '-small.mp4')
