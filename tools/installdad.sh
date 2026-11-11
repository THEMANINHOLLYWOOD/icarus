#!/bin/sh
# Turn chosen raw takes into the clips the game plays: trimmed, pushed into a strained shout, set outdoors, levelled.
# Usage: sh installdad.sh <outdir> pd0=<wav> pd1=<wav> ...   (outdir is tools/takes/new to audition, or ../voice to install)
out="$1"; shift
for kv in "$@"; do
  n="${kv%%=*}"; f="${kv#*=}"
  # pd4 is the scream as his son falls: a longer tail, as if across open water
  if [ "$n" = pd4 ]; then echo='aecho=0.8:0.55:140|330:0.26|0.14'; else echo='aecho=0.85:0.5:50|120:0.15|0.08'; fi
  ffmpeg -hide_banner -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse,highpass=f=95,acompressor=threshold=-24dB:ratio=5:attack=4:release=140:makeup=6,volume=5dB,asoftclip=type=tanh:threshold=0.75,equalizer=f=2600:t=q:w=1.1:g=3.5,equalizer=f=240:t=q:w=1:g=-2,lowpass=f=8500,$echo,loudnorm=I=-19:TP=-2:LRA=9" -ac 1 -ar 44100 -b:a 128k "$out/$n.mp3"
  printf "%s %s s\n" "$n" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/$n.mp3")"
done
