#!/bin/sh
# Icarus: bring your agents into the world.
#
#   curl -fsSL https://justkeepflying.com/connect.sh | sh
#
# What this does, all of it:
#   1. Puts two small scripts in ~/.icarus: hook.sh (what your agents run: read it, it is short) and this one.
#   2. Asks you, in your browser, to let this computer's agents into your hamlet, and keeps the key it is
#      given in ~/.icarus/key. That key opens nothing but your hamlet.
#   3. If you have Claude Code or Codex, adds hooks to ~/.claude/settings.json and ~/.codex/hooks.json that
#      run hook.sh in the background. A copy of each file as it was is kept beside it (…before-icarus).
# Nothing your agents read or write is sent anywhere. See hook.sh for exactly what is.
#
#   Remove everything this did:   sh ~/.icarus/install.sh remove
set -u
URL="${ICARUS_URL:-https://justkeepflying.com}"; URL="${URL%/}"
D="${ICARUS_HOME:-$HOME/.icarus}"
C="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
X="${CODEX_HOME:-$HOME/.codex}"
MODE="${1:-install}"
say() { printf '%s\n' "$*"; }
if [ "$D" = "$HOME/.icarus" ]; then HOOK='$HOME/.icarus/hook.sh'; else HOOK="$D/hook.sh"; fi

# ── a settings file's hooks, changed with whichever of node or python is here: ours taken out, and (to add) put back in
edit() {   # file  add|remove  hooks-as-json
  if command -v node >/dev/null 2>&1; then
    node - "$1" "$2" "$3" <<'JS'
const fs = require('fs'); let [file, mode, frag] = process.argv.slice(2);
try { file = fs.realpathSync(file); } catch {}
let d = {}; try { const t = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; d = t.trim() ? JSON.parse(t) : {}; } catch { process.exit(3); }
if (!d || typeof d !== 'object' || Array.isArray(d)) process.exit(3);
const h = d.hooks && typeof d.hooks === 'object' && !Array.isArray(d.hooks) ? d.hooks : {};
const ours = g => g && typeof g === 'object' && Array.isArray(g.hooks) && g.hooks.some(x => x && String(x.command || '').includes('.icarus/hook.sh'));
for (const k of Object.keys(h)) if (Array.isArray(h[k])) { h[k] = h[k].filter(g => !ours(g)); if (!h[k].length) delete h[k]; }
if (mode === 'add') for (const [k, v] of Object.entries(JSON.parse(frag))) { if (h[k] !== undefined && !Array.isArray(h[k])) process.exit(3); (h[k] ||= []).push(...v); }
if (Object.keys(h).length) d.hooks = h; else delete d.hooks;
fs.writeFileSync(file + '.icarus-tmp', JSON.stringify(d, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(file + '.icarus-tmp', file);
JS
    return $?
  fi
  py=$(command -v python3 2>/dev/null) || py=
  # (on a Mac without the developer tools, /usr/bin/python3 is only an offer to install them)
  if [ "$py" = /usr/bin/python3 ] && [ "$(uname)" = Darwin ] && ! xcode-select -p >/dev/null 2>&1; then py=; fi
  [ -n "$py" ] || return 4
  "$py" - "$1" "$2" "$3" <<'PY'
import json, os, sys
path, mode, frag = sys.argv[1:4]
path = os.path.realpath(path)
try:
    d = json.load(open(path)) if os.path.exists(path) and os.path.getsize(path) else {}
except Exception:
    sys.exit(3)
if not isinstance(d, dict): sys.exit(3)
h = d.get('hooks') if isinstance(d.get('hooks'), dict) else {}
ours = lambda g: isinstance(g, dict) and any(isinstance(x, dict) and '.icarus/hook.sh' in str(x.get('command', '')) for x in (g.get('hooks') or []))
for k in list(h):
    if isinstance(h[k], list):
        h[k] = [g for g in h[k] if not ours(g)]
        if not h[k]: del h[k]
if mode == 'add':
    for k, v in json.loads(frag).items():
        if k in h and not isinstance(h[k], list): sys.exit(3)
        h.setdefault(k, []).extend(v)
if h: d['hooks'] = h
else: d.pop('hooks', None)
t = path + '.icarus-tmp'
with open(os.open(t, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
    json.dump(d, f, indent=2); f.write('\n')
os.replace(t, path)
PY
}
g() {   # matcher  word  program  → one group of hooks, as JSON
  if [ -n "$1" ]; then m="\"matcher\":\"$1\","; else m=; fi
  printf '{%s"hooks":[{"type":"command","command":"sh \\"%s\\" %s %s","async":true,"timeout":20}]}' "$m" "$HOOK" "$2" "$3"
}
wire() {   # name  folder  file  hooks-as-json
  [ -d "$2" ] || return 1
  if [ "$MODE" = remove ]; then [ -f "$3" ] && edit "$3" remove '{}' && say "  $1: hooks taken out of $3"; return 0; fi
  [ -f "$3" ] && [ ! -f "$3.before-icarus" ] && cp -p "$3" "$3.before-icarus"
  edit "$3" add "$4"; e=$?
  case $e in
    0) say "  $1: hooks added to $3"; return 0 ;;
    3) say "  $1: $3 is not JSON this could read, so it was left alone." ;;
    4) say "  $1: needs node or python3 to change $3; neither is here." ;;
    *) say "  $1: could not change $3." ;;
  esac
  return 2
}
CLAUDE_HOOKS="{\"SessionStart\":[$(g '' start claude)],\"UserPromptSubmit\":[$(g '' think claude)],\"PostToolUse\":[$(g 'Edit|Write|MultiEdit|NotebookEdit' write claude),$(g Bash run claude),$(g 'Read|Grep|Glob' read claude),$(g 'WebSearch|WebFetch' web claude),$(g 'Task|Agent' helpers claude),$(g 'mcp__.*' tool claude)],\"Notification\":[$(g '' wait claude)],\"Stop\":[$(g '' done claude)]}"
CODEX_HOOKS="{\"SessionStart\":[$(g '' start codex)],\"UserPromptSubmit\":[$(g '' think codex)],\"PostToolUse\":[$(g 'apply_patch|Edit|Write' write codex),$(g Bash run codex),$(g 'mcp__.*' tool codex)],\"Stop\":[$(g '' done codex)]}"

if [ "$MODE" = remove ]; then
  say "Icarus: removing."
  wire 'Claude Code' "$C" "$C/settings.json" ''
  wire 'Codex' "$X" "$X/hooks.json" ''
  rm -rf "$D"; say "  $D removed. Your agents' houses stay in the world; they go quiet."
  exit 0
fi

command -v curl >/dev/null 2>&1 || { say "Icarus: this needs curl."; exit 1; }
umask 077; mkdir -p "$D/s" || { say "Icarus: could not make $D"; exit 1; }
for f in hook.sh install.sh; do
  curl -fsSL "$URL/connect/$f" -o "$D/$f.new" </dev/null && mv "$D/$f.new" "$D/$f" || { say "Icarus: could not fetch $URL/connect/$f"; exit 1; }
done
chmod 700 "$D/hook.sh" "$D/install.sh"
if [ "$URL" = https://justkeepflying.com ]; then rm -f "$D/url"; else printf '%s\n' "$URL" > "$D/url"; fi

say "Icarus: bringing this computer's agents into the world."
n=0
wire 'Claude Code' "$C" "$C/settings.json" "$CLAUDE_HOOKS" && n=$((n + 1)) && HAVE_CLAUDE=1
wire 'Codex' "$X" "$X/hooks.json" "$CODEX_HOOKS" && n=$((n + 1)) && HAVE_CODEX=1
[ "$n" = 0 ] && say "  Neither Claude Code nor Codex was set up here (no ~/.claude or ~/.codex that could be changed)." && say "  Any other agent: add $URL/mcp as an MCP server and sign in when it asks."

# ── the key: this computer makes a secret, shows you only its hash, and you say yes to that in your browser
rand() { if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32; else od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; fi; }
hash() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 | cut -d' ' -f1; elif command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else openssl dgst -sha256 | sed 's/.*= *//'; fi; }
hex64() { case "$1" in *[!0-9a-f]*) return 1 ;; esac; [ "${#1}" = 64 ]; }
BOSS=
claim() {
  r=$(curl -sS -m 10 -X POST "$URL/mcp" -H 'Content-Type: application/json' -d "{\"op\":\"claim\",\"s\":\"$1\"}" </dev/null 2>/dev/null) || return 1
  k=$(printf %s "$r" | sed -n 's/.*"key":"\(icarus-[0-9a-f]*-[0-9a-f]*\)".*/\1/p'); [ -n "$k" ] || return 1
  printf '%s\n' "$k" > "$D/key"; chmod 600 "$D/key"; rm -f "$D/pair" "$D/pair.at" "$D/key.refused"
  case "$r" in *'"names":"plain"'*) echo names=plain > "$D/config" ;; *) echo names=folder > "$D/config" ;; esac
  BOSS=$(printf %s "$r" | sed -n 's/.*"boss":"\([A-Z0-9 -]*\)".*/\1/p'); return 0
}
if [ -s "$D/key" ]; then
  say "  This computer already has its key."
else
  [ -s "$D/pair" ] || { rand > "$D/pair"; date +%s > "$D/pair.at"; }
  s=$(cat "$D/pair"); hex64 "$s" || { rm -f "$D/pair"; say "Icarus: could not make a secret here (needs openssl or /dev/urandom)."; exit 1; }
  p=$(printf %s "$s" | hash); hex64 "$p" || { say "Icarus: could not hash here (needs shasum, sha256sum or openssl)."; exit 1; }
  link="$URL/#pair=$p"
  say ""
  say "  One thing left, and it is yours: open this in the browser you play Icarus in, and press ALLOW in the game."
  say ""
  say "    $link"
  say ""
  if [ -z "${ICARUS_NO_OPEN:-}" ]; then (open "$link" || xdg-open "$link") </dev/null >/dev/null 2>&1; fi
  if [ -z "${ICARUS_NO_WAIT:-}" ]; then
    printf '  Waiting for you'; i=0
    while [ "$i" -lt 100 ]; do claim "$s" && break; printf '.'; sleep 3; i=$((i + 1)); done; say ""
  fi
  if [ -s "$D/key" ]; then say "  Allowed${BOSS:+: they are the agents of $BOSS now}."
  else say "  Not allowed yet. That is fine: the link stays good, and your agents pick the key up by themselves once you press ALLOW."; fi
fi
say ""
[ -n "${HAVE_CLAUDE:-}" ] && say "  Claude Code: every session on this computer shows up as it works, the ones already open too."
[ -n "${HAVE_CODEX:-}" ] && say "  Codex: open /hooks in Codex once and trust the Icarus hooks. It will not run them until you do."
say "  See them: in the game, type /hamlet"
say "  Pause: touch $D/off     Remove: sh $D/install.sh remove"
