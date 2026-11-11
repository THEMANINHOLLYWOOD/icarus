// Choose the takes that go into the game, treat them, and install them as sfx/<name>-<n>.mp3 with sfx/index.json.
// One-shots: the best-scored takes (new and old together), trimmed, given weight where they need it, levelled.
// Loops: the best take, made seamless (its end is crossfaded into its beginning), levelled quietly.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const T = '/Users/andres/Desktop/Coding/Icarus/tools/takes', OUT = '/Users/andres/Desktop/Coding/Icarus/sfx';
const nj = JSON.parse(fs.readFileSync(`${T}/sfx/judge.json`, 'utf8')), oj = JSON.parse(fs.readFileSync(`${T}/oldsfx/judge.json`, 'utf8'));
const score = v => !v || v.err ? 0 : v.real + v.fit + v.even * 0.6 - (v.music ? 4 : 0) - (v.voice ? 4 : 0);
const HEAVY = new Set(['flap', 'wingsopen', 'impact', 'rebirth', 'ignite', 'land', 'roll', 'splash', 'crack', 'surge', 'underworld', 'thunder']);
const LOUD = { step: -26, stepstone: -26, grab: -27, jump: -24, land: -21, leaves: -21, whoosh: -20, flap: -19, crack: -14, thunder: -16, surge: -18, impact: -16, rebirth: -16 };
const DROP = new Set(['bark']);   // nothing usable came back: trees use the rock grips instead
const sh = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const takes = {};
for (const [id, v] of Object.entries(nj)) { const n = id.replace(/-\d+$/, ''); (takes[n] = takes[n] || []).push({ file: `${T}/sfx/${id}.mp3`, s: score(v), id }); }
for (const [id, v] of Object.entries(oj)) { const n = id.replace(/-\d+$/, ''); (takes[n] = takes[n] || []).push({ file: `${T}/oldsfx/${id}.mp3`, s: score(v), id }); }
for (const f of fs.readdirSync(OUT)) if (/^[a-z]+-\d+\.mp3$/.test(f)) fs.unlinkSync(`${OUT}/${f}`);   // (only the numbered takes this script made)
const index = {};
for (const [name, list] of Object.entries(takes)) {
  if (DROP.has(name)) continue;
  list.sort((a, b) => b.s - a.s);
  const loop = name.endsWith('loop');
  const keep = loop ? list.slice(0, 1) : list.filter((t, i) => i === 0 || t.s >= Math.max(list[0].s - 3, 9)).slice(0, name.startsWith('step') ? 5 : 4);
  keep.forEach((t, i) => {
    const out = `${OUT}/${name}-${i + 1}.mp3`;
    if (loop) {
      const L = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', t.file]).toString(), x = 1.6;
      sh('-i', t.file, '-filter_complex',
        `[0]asplit=3[a][b][c];[a]atrim=0:${x},asetpts=N/SR/TB,afade=t=in:d=${x}:curve=qsin[h];[b]atrim=${L - x}:${L},asetpts=N/SR/TB,afade=t=out:d=${x}:curve=qsin[t];` +
        `[t][h]amix=inputs=2:normalize=0[x];[c]atrim=${x}:${L - x},asetpts=N/SR/TB[m];[x][m]concat=n=2:v=0:a=1,highpass=f=35,loudnorm=I=-24:TP=-3:LRA=7`, '-ar', '44100', '-b:a', '112k', out);
    } else {
      const weight = HEAVY.has(name) ? 'equalizer=f=85:t=q:w=1.1:g=4,acompressor=threshold=-20dB:ratio=3:attack=8:release=160:makeup=2,' : '';
      sh('-i', t.file, '-af', `silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.15,areverse,highpass=f=30,${weight}loudnorm=I=${LOUD[name] ?? -18}:TP=-1.5:LRA=11,afade=t=out:st=0:d=0.01`,
        '-ac', '1', '-ar', '44100', '-b:a', '112k', out);
    }
    console.log(name, i + 1, '<-', t.id, t.s.toFixed(1));
  });
  index[name] = keep.length;
}
fs.writeFileSync(`${OUT}/index.json`, JSON.stringify(index));
console.log(JSON.stringify(index));
