#!/bin/sh
# Icarus: tells the world of Icarus that one of your agents is at work, so its figure in your hamlet builds.
#
# Your agent's hooks (Claude Code, Codex) run this with one word for the kind of thing that just happened:
#   start think write run read web helpers tool wait done
# It reads nothing from the hook: not what the agent was asked, not what it did, not a file name. What it sends
# to justkeepflying.com is that one word, which agent program it was, and a name for the agent: the name of the
# project folder it is working in, or only a number if you chose that (names=plain in ~/.icarus/config).
# At most one message every minute and a half for each folder, and one every fifteen seconds for the whole computer.
#
#   Stop it for now:   touch ~/.icarus/off        (rm ~/.icarus/off to carry on)
#   Remove it:         sh ~/.icarus/install.sh remove
exec </dev/null >/dev/null 2>&1
D="${ICARUS_HOME:-$HOME/.icarus}"
[ -n "${ICARUS_OFF:-}" ] && exit 0
[ -f "$D/off" ] && exit 0
ACT="${1:-tool}"; VIA="${2:-agent}"
case "$ACT" in start|think|write|run|read|web|helpers|tool|wait|done) ;; *) ACT=tool ;; esac
case "$VIA" in claude|codex|cursor|gemini) ;; *) VIA=agent ;; esac
umask 077
dir="${CLAUDE_PROJECT_DIR:-$PWD}"; S="$D/s"
[ -d "$S" ] || mkdir -p "$S" || exit 0

# Not too often. For one folder: a start goes at once, a finished turn after a minute, a new kind of work after a
# minute and a half, the same kind after five minutes (the figure keeps building for ten after it was last heard
# from). For the whole computer: one message in fifteen seconds, however many agents are at work.
# This part runs on every hook, so it starts nothing but `date`: the folder's own file is named from its path.
o=$IFS; set -f; IFS=/; set -- $dir; IFS=_; f="$S/d$*"; IFS=$o; set +f
[ "${#f}" -gt 200 ] && f="$S/c$(printf %s "$dir" | cksum | tr -d ' \t')"
now=$(date +%s); last=0; lact=
[ -f "$f" ] && read -r last lact < "$f"
case "$last" in ''|*[!0-9]*) last=0 ;; esac
gap=$((now - last)); go=0
case "$ACT" in
  start) [ "$gap" -ge 5 ] && go=1 ;;
  done) [ "$lact" != done ] && [ "$gap" -ge 60 ] && go=1 ;;
  *) if [ "$ACT" != "$lact" ] && [ "$gap" -ge 90 ]; then go=1; elif [ "$gap" -ge 300 ]; then go=1; fi ;;
esac
[ "$go" = 1 ] || exit 0
all=0; [ -f "$S/all" ] && read -r all < "$S/all"
case "$all" in ''|*[!0-9]*) all=0 ;; esac
[ $((now - all)) -ge 15 ] || exit 0
echo "$now" > "$S/all"; printf '%s %s\n' "$now" "$ACT" > "$f"

(
  URL="${ICARUS_URL:-}"; [ -z "$URL" ] && [ -f "$D/url" ] && URL=$(cat "$D/url"); [ -z "$URL" ] && URL=https://justkeepflying.com

  # the key. If this computer has asked to be let in and not yet collected its key, ask for it (the traveller may only just have said yes)
  key=; [ -f "$D/key" ] && key=$(cat "$D/key")
  if [ -z "$key" ]; then
    [ -f "$D/pair" ] || exit 0
    c="$S/claim"; lc=0; [ -f "$c" ] && read -r lc < "$c"
    case "$lc" in ''|*[!0-9]*) lc=0 ;; esac
    at=$now; [ -f "$D/pair.at" ] && read -r at < "$D/pair.at"   # (asked for often in the first hour, then every ten minutes)
    case "$at" in ''|*[!0-9]*) at=$now ;; esac
    every=20; [ $((now - at)) -ge 3600 ] && every=600
    [ $((now - lc)) -ge "$every" ] || exit 0
    echo "$now" > "$c"
    r=$(curl -sS -m 8 -X POST "$URL/mcp" -H 'Content-Type: application/json' -d "{\"op\":\"claim\",\"s\":\"$(cat "$D/pair")\"}") || exit 0
    key=$(printf %s "$r" | sed -n 's/.*"key":"\(icarus-[0-9a-f]*-[0-9a-f]*\)".*/\1/p')
    [ -n "$key" ] || exit 0
    printf '%s\n' "$key" > "$D/key"; chmod 600 "$D/key"; rm -f "$D/pair" "$D/pair.at"
    case "$r" in *'"names":"plain"'*) echo names=plain > "$D/config" ;; *) echo names=folder > "$D/config" ;; esac
  fi

  # the name: the project's folder (a git worktree goes by its project's name), or only a number
  names=folder; [ -f "$D/config" ] && grep -q 'names=plain' "$D/config" && names=plain
  if [ -n "${ICARUS_NAME:-}" ]; then name="$ICARUS_NAME"
  elif [ "$names" = plain ]; then name="AGENT $(printf %s "$dir" | cksum | cut -c1-4)"
  else
    top="$dir"; g=$(cd "$dir" 2>/dev/null && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
    case "$g" in */.git) top="${g%/.git}" ;; esac
    name=$(basename "$top")
  fi
  name=$(printf %s "$name" | tr '[:lower:]' '[:upper:]' | tr '_.' '  ' | tr -cd 'A-Z0-9 -' | cut -c1-12)
  [ -n "$(printf %s "$name" | tr -d ' -')" ] || name=AGENT

  code=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' -X POST "$URL/mcp" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
    -d "{\"op\":\"beat\",\"name\":\"$name\",\"act\":\"$ACT\",\"via\":\"$VIA\"}")
  # the key is no longer one of the world's (its traveller is gone): stop, until install.sh is run again
  [ "$code" = 401 ] && mv -f "$D/key" "$D/key.refused"
) &
exit 0
