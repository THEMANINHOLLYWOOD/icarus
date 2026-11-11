#!/bin/sh
# Install ElevenLabs takes as the clips the game plays: leading silence trimmed, levelled, otherwise untouched.
# Usage: sh installel.sh pd0=takes/el/pd0-2.mp3 pd1=takes/el/pd1-1.mp3 ...
for kv in "$@"; do
  n="${kv%%=*}"; f="${kv#*=}"
  ffmpeg -hide_banner -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,loudnorm=I=-20:TP=-2:LRA=11" -ac 1 -ar 44100 -b:a 128k "../voice/$n.mp3"
  printf "%s %s s\n" "$n" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "../voice/$n.mp3")"
done
