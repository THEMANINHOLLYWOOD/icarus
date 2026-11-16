#!/bin/sh
# Icarus: tells the world of Icarus that one of your agents is at work, so its figure in your hamlet builds; and
# hands that agent what you type to it from inside the game.
#
# Your agent's hooks (Claude Code, Codex) run this with one word for the kind of thing that just happened:
#   start think write run read web helpers tool plan task+ task- wait done listen
#
# What it sends to justkeepflying.com:
#   - that one word, which agent program it was, and a name for the agent: the name of the project folder it is
#     working in, or only a number if you chose that (names=plain in ~/.icarus/config). Anyone in the game sees those.
#   - for you alone, on your agents' panel in the game: the model, permission mode and effort level the session says
#     it is in, how many todos it has and how many are done, and how many files git tracks in the project.
# Those last are names of settings and counts, picked out of the first lines of what the hook is handed. It does not
# keep or send what the agent was asked, what it did, a file name, or a line of code.
#
# What it brings back (Claude Code only): a note you typed to this agent in the game. Only you can leave one (the game
# proves it is you by your travel code), and it is handed to the agent marked as a chat message from its owner, sent
# from the Icarus game: not as an instruction of the system's. The agent may answer you with
#   sh ~/.icarus/hook.sh reply 'a short answer'
# which goes to your own game chat and nowhere else. While you are talking to an agent that has stopped and is
# waiting, `listen` asks every twenty seconds for five minutes whether you wrote again, and wakes it if you did.
#
# At most one message every minute and a half for each folder, and one every fifteen seconds for the whole computer
# (every twenty and every eight seconds while you are talking to that agent, for ten minutes after your last note).
#
#   No notes from the game:  touch ~/.icarus/quiet     (rm ~/.icarus/quiet to hear them again)
#   Stop it all for now:     touch ~/.icarus/off       (rm ~/.icarus/off to carry on)
#   Remove it:               sh ~/.icarus/install.sh remove
D="${ICARUS_HOME:-$HOME/.icarus}"
[ -n "${ICARUS_OFF:-}" ] && exit 0
[ -f "$D/off" ] && exit 0
ACT="${1:-tool}"; VIA="${2:-agent}"
umask 077
dir="${CLAUDE_PROJECT_DIR:-$PWD}"; S="$D/s"

where() { URL="${ICARUS_URL:-}"; [ -z "$URL" ] && [ -f "$D/url" ] && URL=$(cat "$D/url"); [ -z "$URL" ] && URL=https://justkeepflying.com; }
# the name: the project's folder (a git worktree goes by its project's name), or only a number
called() {
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
}
# this folder's own file, named from its path (nothing is started to find it)
folder() {
  o=$IFS; set -f; IFS=/; set -- $dir; IFS=_; f="$S/d$*"; IFS=$o; set +f
  [ "${#f}" -gt 200 ] && f="$S/c$(printf %s "$dir" | cksum | tr -d ' \t')"
}
num() { case "$1" in ''|*[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
ask() { curl -sS -m 8 -X POST "$URL/mcp" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' -d "$1"; }
# a note as the world sent it: one line of plain letters (it names this script by its usual place)
note() { say=$(printf %s "$1" | sed -n 's/.*"say":"\([^"]*\)".*/\1/p'); [ -n "$say" ] && [ "$D" != "$HOME/.icarus" ] && say=$(printf %s "$say" | sed "s#~/\.icarus#$D#g"); }

# ── the agent itself, answering its owner (reply), or saying what goal it has taken (goal): run by hand, it says how it went
case "$ACT" in reply|goal)
  shift; t=$(printf %s "$*" | tr '\n\t' '  ' | tr -cd "A-Za-z0-9 .,'!?:;()/+_#&-" | cut -c1-280)
  [ -n "$(printf %s "$t" | tr -d ' ')" ] || { echo "Icarus: nothing to send. Like this: sh hook.sh $ACT 'a short plain line'"; exit 1; }
  key=; [ -f "$D/key" ] && key=$(cat "$D/key"); [ -n "$key" ] || { echo 'Icarus: this computer has no key yet, so nothing was sent.'; exit 1; }
  where; called
  if [ "$ACT" = reply ]; then b="{\"op\":\"reply\",\"name\":\"$name\",\"text\":\"$t\"}"; else b="{\"op\":\"report\",\"name\":\"$name\",\"goal\":\"$t\"}"; fi
  code=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' -X POST "$URL/mcp" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' -d "$b" 2>/dev/null)
  case "$code" in
    200) if [ "$ACT" = reply ]; then echo 'Icarus: sent. It is in your owner'"'"'s game chat.'; else echo 'Icarus: noted. Your owner sees it on your panel in the game.'; fi ;;
    429) echo 'Icarus: too many at once. Wait a moment and send it once more.'; exit 1 ;;
    404) echo "Icarus: the world knows no agent called $name here yet, so nothing was sent."; exit 1 ;;
    *) echo "Icarus: not sent (the world answered $code)."; exit 1 ;;
  esac
  exit 0 ;;
esac

# ── an agent that has stopped, while its owner is talking to it: ask now and then whether they wrote again, and wake
#    it with the note if they did (the hook is set to wake the agent when this ends with 2 and something on stderr)
if [ "$ACT" = listen ]; then
  exec </dev/null 3>&2 >/dev/null 2>&1
  [ "$VIA" = claude ] || exit 0
  [ -f "$D/quiet" ] && exit 0; [ -s "$D/key" ] || exit 0; [ -d "$S" ] || exit 0
  folder; now=$(date +%s); fast=0; [ -f "$f.fast" ] && read -r fast < "$f.fast"; fast=$(num "$fast")
  [ $((now - fast)) -lt 600 ] || exit 0   # (nobody has written to this one lately: nothing to wait for)
  echo $$ > "$f.l"; where; called; key=$(cat "$D/key"); i=0
  while [ "$i" -lt 14 ]; do
    sleep "${ICARUS_LISTEN_EVERY:-20}"
    me=; [ -f "$f.l" ] && read -r me < "$f.l"; [ "$me" = "$$" ] || exit 0   # (a later one has taken over, or the agent is at work again)
    [ -f "$D/off" ] && exit 0; [ -f "$D/quiet" ] && exit 0
    r=$(ask "{\"op\":\"inbox\",\"name\":\"$name\"}") || r=
    note "$r"
    if [ -n "$say" ]; then date +%s > "$f.fast"; rm -f "$f.l"; printf '%s\n' "$say" >&3; exit 2; fi
    i=$((i + 1))
  done
  rm -f "$f.l"; exit 0
fi

# ── a beat. Nothing is written anywhere but where a note for the agent goes (3); what the hook was handed is still to be read.
exec 3>&1 >/dev/null 2>&1
case "$ACT" in start|think|write|run|read|web|helpers|tool|plan|task+|task-|wait|done) ;; *) ACT=tool ;; esac
case "$VIA" in claude|codex|cursor|gemini) ;; *) VIA=agent ;; esac
[ -d "$S" ] || mkdir -p "$S" || exit 0
folder
in=; aside=
# its todos: only how many, and how many are done (a tally kept here, sent with the next message)
case "$ACT" in
  task+|task-)
    td=0; tn=0; [ -f "$f.t" ] && read -r td tn < "$f.t"; td=$(num "$td"); tn=$(num "$tn")
    if [ "$ACT" = task+ ]; then tn=$((tn + 1)); else td=$((td + 1)); [ "$td" -gt "$tn" ] && tn=$td; fi
    printf '%s %s\n' "$td" "$tn" > "$f.t"; ACT=plan; aside=1 ;;   # (not a moment the agent takes a note at)
  plan)
    if [ "$VIA" = claude ] && [ ! -t 0 ]; then
      in=$(head -c 60000 | sed 's/"tool_response".*//')
      tn=$(printf %s "$in" | grep -o '"status": *"[a-z_]*"' | wc -l | tr -d ' '); td=$(printf %s "$in" | grep -o '"status": *"completed"' | wc -l | tr -d ' ')
      [ "$(num "$tn")" -gt 0 ] && printf '%s %s\n' "$(num "$td")" "$tn" > "$f.t"
    fi ;;
  start) rm -f "$f.t" "$f.l" ;;   # (a new session: its todos start again)
  think) rm -f "$f.l" ;;          # (at work again: nobody need listen for it)
esac

# Not too often. For one folder: a start goes at once, a finished turn after a minute, a new kind of work after a
# minute and a half, the same kind after five minutes (the figure keeps building for ten after it was last heard
# from). For the whole computer: one message in fifteen seconds, however many agents are at work. While its owner is
# talking to this one (a note came through in the last ten minutes): every twenty seconds, and eight for the computer.
# This part runs on every hook, so it starts nothing but `date`.
now=$(date +%s); last=0; lact=
[ -f "$f" ] && read -r last lact < "$f"
last=$(num "$last"); gap=$((now - last)); go=0
fast=0; [ -f "$f.fast" ] && read -r fast < "$f.fast"; fast=$(num "$fast"); quick=0; [ $((now - fast)) -lt 600 ] && quick=1
case "$ACT" in
  start) [ "$gap" -ge 5 ] && go=1 ;;
  done) if [ "$lact" != done ]; then if [ "$quick" = 1 ]; then [ "$gap" -ge 20 ] && go=1; else [ "$gap" -ge 60 ] && go=1; fi; fi ;;
  *) if [ "$quick" = 1 ] && [ "$gap" -ge 20 ]; then go=1; elif [ "$ACT" != "$lact" ] && [ "$gap" -ge 90 ]; then go=1; elif [ "$gap" -ge 300 ]; then go=1; fi ;;
esac
[ "$go" = 1 ] || exit 0
all=0; [ -f "$S/all" ] && read -r all < "$S/all"
all=$(num "$all"); every=15; [ "$quick" = 1 ] && every=8
[ $((now - all)) -ge "$every" ] || exit 0
echo "$now" > "$S/all"; printf '%s %s\n' "$now" "$ACT" > "$f"

# what the session says of itself, from the first lines of what the hook was handed (Claude Code): its permission
# mode, its effort, and at the start its model. Nothing else of it is looked at, and none of it is kept.
pm=; ef=; model=; sub=
if [ "$VIA" = claude ] && [ ! -t 0 ]; then
  [ -n "$in" ] || in=$(head -c 4000)
  pm=$(printf %s "$in" | sed -n 's/.*"permission_mode": *"\([A-Za-z]*\)".*/\1/p' | head -1)
  ef=$(printf %s "$in" | sed -n 's/.*"effort": *{ *"level": *"\([a-z]*\)".*/\1/p' | head -1)
  [ "$ACT" = start ] && model=$(printf %s "$in" | sed -n 's/.*"model": *"\([A-Za-z0-9._-]*\)[^"]*".*/\1/p' | head -1 | cut -c1-40)
  case "$in" in *'"agent_id"'*) sub=1 ;; esac   # (a helper it sent out: notes are for the agent itself)
fi
in=; exec </dev/null
case "$pm" in default|plan|acceptEdits|auto|dontAsk|bypassPermissions) ;; *) pm= ;; esac
case "$ef" in low|medium|high|xhigh|max) ;; *) ef= ;; esac
if [ -n "$model" ]; then printf '%s\n' "$model" > "$f.m"; elif [ -f "$f.m" ]; then read -r model < "$f.m"; model=$(printf %s "$model" | tr -cd 'A-Za-z0-9._-' | cut -c1-40); fi
# can a note be handed on from here? (Claude Code, at a moment it takes one; not when told to be quiet)
hear=0; EV=PostToolUse
if [ "$VIA" = claude ] && [ -z "$sub" ] && [ -z "$aside" ] && [ ! -f "$D/quiet" ]; then
  case "$ACT" in start) hear=1; EV=SessionStart ;; think) hear=1; EV=UserPromptSubmit ;; write|run|read|web|helpers|tool|plan) hear=1 ;; esac
fi

send() {
  where

  # the key. If this computer has asked to be let in and not yet collected its key, ask for it (the traveller may only just have said yes)
  key=; [ -f "$D/key" ] && key=$(cat "$D/key")
  if [ -z "$key" ]; then
    [ -f "$D/pair" ] || exit 0
    c="$S/claim"; lc=0; [ -f "$c" ] && read -r lc < "$c"
    lc=$(num "$lc")
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
    case "$r" in *'"talk":"off"'*) : > "$D/quiet"; hear=0 ;; esac
  fi

  called
  # how big the project is: how many files git tracks, counted once a session (a number; no names)
  fl=; if [ "$ACT" = start ]; then fl=$(cd "$dir" 2>/dev/null && git ls-files 2>/dev/null | wc -l | tr -d ' '); fl=$(num "$fl"); if [ "$fl" -gt 0 ]; then echo "$fl" > "$f.n"; else fl=; fi
  elif [ -f "$f.n" ]; then read -r fl < "$f.n"; fl=$(num "$fl"); fi
  td=; tn=; [ -f "$f.t" ] && read -r td tn < "$f.t"
  b="{\"op\":\"beat\",\"name\":\"$name\",\"act\":\"$ACT\",\"via\":\"$VIA\""
  [ -n "$model" ] && b="$b,\"m\":\"$model\""; [ -n "$pm" ] && b="$b,\"pm\":\"$pm\""; [ -n "$ef" ] && b="$b,\"ef\":\"$ef\""
  [ -n "$tn" ] && b="$b,\"td\":$(num "$td"),\"tn\":$(num "$tn")"; [ -n "$fl" ] && b="$b,\"fl\":$fl"
  [ "$hear" = 1 ] && b="$b,\"hear\":1"
  r=$(curl -sS -m 8 -w '\n%{http_code}' -X POST "$URL/mcp" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' -d "$b}") || return 0
  # the key is no longer one of the world's (its traveller is gone): stop, until install.sh is run again
  case "$r" in *'
401') mv -f "$D/key" "$D/key.refused"; return 0 ;; esac
  case "$r" in *'"fast":1'*) echo "$now" > "$f.fast" ;; esac
  [ "$hear" = 1 ] || return 0
  # a note from the traveller, for the agent: said to the agent's program in the words it takes such things in
  note "$r"; [ -n "$say" ] || return 0
  printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$EV" "$say" >&3
}
# (when a note may come back, this waits for the answer, so there is somewhere to write it: the hook itself is run in the background by the agent's program)
if [ "$hear" = 1 ]; then send; else send 3>&- & fi
exit 0
