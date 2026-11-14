// Daimons in ICARUS. His agents, standing in the world he flies in.
//
// A stone terrace hangs in the air (the Works). At its middle a hearth burns with what his agents have shared; round
// it stand their homes, each holding its agent's own notes as tablets of light; and out past the rim, on rocks of
// their own, the trees: one per repository, the trunk its main branch, every other git branch a bough, and on the
// boughs a stone for each file, which grows a course at a time as it is worked on. The agents themselves are winged
// things in a colour of their own, with a ring of beads about the head that fills as their memory fills. They fly to
// the stone they are working on and hammer light into it; when one splits, a smaller one leaves it on a thread; when
// one must ask, it stops and a pillar of light goes up from it, and Enter is yes.
//
// The game gives this file a small `host` (see start()); nothing here reaches into the game otherwise, and the game
// runs exactly as before when no hub is set.
import { connect, keyFrom } from './daimon.js';
import { layout } from './layout.js';
import { DEMO_KEY, baseName } from './protocol.js';
import { typed, spoken, HELP } from './commands.js';

const LS = { get: k => { try { return localStorage.getItem('daimon.' + k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem('daimon.' + k) : localStorage.setItem('daimon.' + k, v); } catch {} } };
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const STATUS_COL = { idle: '#8a8474', thinking: '#ffd27a', working: '#7dff3a', waiting: '#ff8a3a', blocked: '#ff5a4a', done: '#bfe6ff', offline: '#555' };
const CSS = `
#dmn { position:fixed; inset:0; z-index:30; pointer-events:none; font:11px/1.45 'IBM Plex Mono', ui-monospace, Menlo, monospace; letter-spacing:.06em; color:#f4ead2; }
#dmn > * { pointer-events:auto; } #dmn.off { display:none; }
#dmn-ask { position:absolute; left:50%; top:calc(var(--st, 0px) + 58px); transform:translateX(-50%); width:min(560px, calc(100vw - 28px)); background:rgba(4,5,10,.9); border:1px solid #ff8a3a; padding:8px 12px 9px; display:none; }
#dmn-ask.on { display:block; } #dmn-ask .who { letter-spacing:.22em; font-size:10px; } #dmn-ask .more { float:right; color:#ff8a3a; }
#dmn-ask .q { font-size:12.5px; margin:1px 0 4px; overflow-wrap:anywhere; letter-spacing:.03em; }
#dmn-ask pre { margin:0 0 6px; max-height:128px; overflow:auto; color:rgba(244,234,210,.6); font:inherit; font-size:10.5px; letter-spacing:.02em; white-space:pre-wrap; overflow-wrap:anywhere; border-left:1px solid rgba(255,190,130,.3); padding-left:8px; scrollbar-width:none; }
#dmn-ask pre .a { color:#9be28a; } #dmn-ask pre .r { color:#ff7a66; }
#dmn-ask .keys { color:rgba(244,234,210,.55); letter-spacing:.16em; font-size:10px; text-transform:uppercase; } #dmn-ask kbd { font:inherit; color:#f4ead2; border:1px solid rgba(255,190,130,.4); padding:0 5px; margin-right:4px; }
#dmn-list { position:absolute; right:calc(var(--sr, 0px) + 12px); top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:2px; max-width:min(250px, 40vw); }
#dmn-list.hide { display:none; }
#dmn-list .r { display:flex; gap:7px; align-items:baseline; background:rgba(0,0,0,.34); padding:2px 7px; cursor:pointer; white-space:nowrap; overflow:hidden; } #dmn-list .r.kid { margin-left:12px; opacity:.8; }
#dmn-list .r i { flex:none; width:6px; height:6px; border-radius:50%; background:currentColor; } #dmn-list .r i.p { animation:dmnp 1s infinite; } @keyframes dmnp { 50% { opacity:.2; } }
#dmn-list .r b { font-weight:400; letter-spacing:.14em; } #dmn-list .r span { color:rgba(244,234,210,.55); overflow:hidden; text-overflow:ellipsis; font-size:10.5px; }
#dmn-panel { position:absolute; right:calc(var(--sr, 0px) + 12px); top:calc(var(--st, 0px) + 12px); width:min(350px, calc(100vw - 24px)); max-height:calc(100vh - 28px); overflow:auto; background:rgba(4,5,10,.93); border:1px solid rgba(255,190,130,.32); padding:11px 13px; display:none; scrollbar-width:none; }
#dmn-panel.on { display:block; } #dmn-panel h2 { margin:0; font-weight:400; font-size:12.5px; letter-spacing:.24em; } #dmn-panel h3 { margin:10px 0 2px; font-weight:400; font-size:10px; letter-spacing:.2em; color:rgba(244,234,210,.5); text-transform:uppercase; }
#dmn-panel p { margin:2px 0; overflow-wrap:anywhere; } #dmn-panel .dim { color:rgba(244,234,210,.55); } #dmn-panel .x { float:right; cursor:pointer; color:rgba(244,234,210,.55); padding:0 4px; }
#dmn-panel code { display:block; background:rgba(255,255,255,.06); padding:5px 7px; margin:4px 0; overflow-wrap:anywhere; font:inherit; font-size:10.5px; color:#ffd8a8; cursor:copy; letter-spacing:.02em; }
#dmn-panel button { font:inherit; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#f4ead2; background:none; border:1px solid rgba(255,190,130,.32); padding:4px 9px; margin:8px 6px 0 0; cursor:pointer; } #dmn-panel button:hover { border-color:#ff8a3a; color:#ff8a3a; }
.dmk { position:absolute; transform:translate(-50%, -100%); text-align:center; white-space:nowrap; pointer-events:auto; cursor:pointer; font:11px/1.3 'IBM Plex Mono', ui-monospace, Menlo, monospace; letter-spacing:.14em; text-shadow:0 0 6px #000, 0 0 2px #000; }
.dmk b { display:block; font-weight:400; } .dmk span { display:block; font-size:10px; letter-spacing:.04em; color:rgba(244,234,210,.78); max-width:340px; overflow:hidden; text-overflow:ellipsis; }
.dmk.ask span { color:#ff8a3a; letter-spacing:.14em; } .dmk.place { pointer-events:none; cursor:default; font-size:10px; opacity:.75; } .dmk.site { font-size:12px; letter-spacing:.34em; opacity:.95; } .dmk.kid { font-size:10px; }
`;

export function start(host) {
  const WID = host.world || 'icarus';   // (which world this is, to the hub: where the Works stand is kept for each world apart)
  const T = host.THREE, cfg = { hub: LS.get('hub') || '', on: LS.get('on') !== '0', demo: LS.get('demo') === '1', list: LS.get('list') !== '0' };
  let world = null, L = null, stale = true, root = null, anchor = null, more = false, sel = null, t = 0, built = false, connecting = false;
  const agents = new Map(), homes = new Map(), sites = new Map(), fx = [], _v = new T.Vector3(), _w = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
  const say = (line, who = '') => host.say(who, who ? line : String(line).toUpperCase(), who ? '' : 'sys');
  const HDR = host.hdr ?? 1;   // (how far past white a glow may go: 1 where the picture is kept in half-floats and bloomed, as in Icarus; 0 for a plain renderer)
  const hueCol = (h, s = 0.9, l = 0.55, k = 1) => new T.Color().setHSL(((h % 360) + 360) % 360 / 360, s, l).multiplyScalar(k > 1 ? 1 + (k - 1) * HDR : k);
  const css = (h, l = 66) => `hsl(${+h || 0},90%,${+l || 0}%)`;   // (numbers only: this goes into markup, and a hub is whatever URL the player gave)

  // ── the page's side of it: one card for what is being asked, a short list of who is at work, a panel for one of them
  const ui = document.createElement('div'); ui.id = 'dmn'; ui.className = 'off';
  ui.innerHTML = '<div id="dmn-ask"></div><div id="dmn-list"></div><div id="dmn-panel"></div>';
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style); document.body.append(ui);
  const $ask = ui.querySelector('#dmn-ask'), $list = ui.querySelector('#dmn-list'), $panel = ui.querySelector('#dmn-panel'), marks = host.markers || ui;
  for (const el of [ui]) for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart', 'wheel']) el.addEventListener(ev, e => { if (e.target !== ui) e.stopPropagation(); }, { passive: true });
  const mark = (cls, click) => { const el = document.createElement('div'); el.className = 'dmk ' + cls; el.innerHTML = '<b></b><span></span>'; el.style.display = 'none'; marks.append(el);
    if (click) { el.addEventListener('click', e => { e.stopPropagation(); click(); }); for (const ev of ['pointerdown', 'pointerup', 'touchstart']) el.addEventListener(ev, e => e.stopPropagation(), { passive: true }); } return el; };
  const text = (el, sel2, s) => { const n = el.querySelector(sel2); if (n._s !== s) { n._s = s; n.textContent = s; el['_' + sel2] = s.length; } };
  // A mark follows a place in the world. They are gathered through the frame and laid down at its end, the ones that
  // matter most first: one that would lie over another is left out, as is one behind him or further than `far` metres.
  const marksQ = [], hide = el => { if (el._d !== 0) { el._d = 0; el.style.display = 'none'; } };
  const distTo = (x, y, z) => _v.set(x, y, z).distanceTo(host.camera.position);
  function place(el, x, y, z, far, pri = 10) { marksQ.push({ el, x, y, z, far, pri }); }
  function placeAll() {
    const st = host.state(), ok = st === 'play' || st === 'talk' || st === 'watch', put = [];
    marksQ.sort((a, b) => b.pri - a.pri);
    for (const q of marksQ) {
      const el = q.el; _v.set(q.x, q.y, q.z); const d = _v.distanceTo(host.camera.position); _v.project(host.camera);
      if (!ok || _v.z > 1 || d > q.far || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1 || !(el._b || el._span)) { hide(el); continue; }
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight, w = Math.max((el._b || 0) * 9.2, Math.min(340, (el._span || 0) * 6.4)) + 10, h = el._span ? 30 : 16, x0 = sx - w / 2, y0 = sy - h;
      if (q.pri < 100 && put.some(r => x0 < r[0] + r[2] && x0 + w > r[0] && y0 < r[1] + r[3] && y0 + h > r[1])) { hide(el); continue; }
      put.push([x0, y0, w, h]);
      if (el._d !== 1) { el._d = 1; el.style.display = ''; }
      const l = sx.toFixed(1) + 'px', tp = sy.toFixed(1) + 'px'; if (el._l !== l) { el._l = l; el.style.left = l; } if (el._t !== tp) { el._t = tp; el.style.top = tp; }
    }
    marksQ.length = 0;
  }

  // ── what it is all made of
  const G = {}, M = {};
  function makeShared() {
    if (built) return; built = true;
    G.box = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); G.edges = new T.EdgesGeometry(G.box);
    G.trunk = new T.CylinderGeometry(0.7, 1, 1, 6, 1).translate(0, 0.5, 0);
    G.bough = new T.CylinderGeometry(0.5, 0.62, 1, 5, 1).translate(0, 0.5, 0);
    G.octa = new T.OctahedronGeometry(1, 0); G.ico = new T.IcosahedronGeometry(1, 0); G.bead = new T.SphereGeometry(1, 6, 5); G.ring = new T.TorusGeometry(1, 0.045, 5, 28);
    G.cone = new T.ConeGeometry(1, 1, 5).translate(0, 0.5, 0); G.beam = new T.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 1.9, 0.75, 0.25, 1.35, -0.55, 0.5, 0, 0, 0, 1.35, -0.55, 0.5, 0.5, -0.5, 0.15], 3)); g.computeVertexNormals(); G.wing = g; }
    M.stone = new T.MeshLambertMaterial({ color: 0x9a958a, flatShading: true, emissive: 0x24221f });   // (a little light of its own: in a world drawn in letters, what is unlit is a hole)
    M.dark = new T.MeshLambertMaterial({ color: 0x4d4a45, flatShading: true, emissive: 0x141312 });
    M.ember = new T.MeshBasicMaterial({ color: hueCol(26, 1, 0.55, 2.4) }); M.gold = new T.MeshBasicMaterial({ color: hueCol(44, 1, 0.6, 2.2) });
    M.dim = new T.MeshBasicMaterial({ color: 0x3a3833 }); M.ask = new T.MeshBasicMaterial({ color: hueCol(24, 1, 0.56, 2.6), side: T.DoubleSide });   // (not see-through: the game keeps other things in the picture's alpha)
    M.line = new T.LineBasicMaterial({ color: 0x8a8474 });
  }
  const glow = new Map(), glowMat = (h, k = 2.2) => { const key = `${h}:${k}`; if (!glow.has(key)) glow.set(key, new T.MeshBasicMaterial({ color: hueCol(h, 0.95, 0.56, k), side: T.DoubleSide })); return glow.get(key); };
  const mesh = (g, m, parent, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent?.add(o); return o; };
  const lineOf = (col, parent) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)); const l = new T.Line(g, new T.LineBasicMaterial({ color: col })); l.frustumCulled = false; parent.add(l); return l; };
  const setLine = (l, a, b) => { const p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; };
  const span = (o, a, b, r) => { _w.set(b.x - a.x, b.y - a.y, b.z - a.z); const len = _w.length() || 0.001; o.position.set(a.x, a.y, a.z); o.quaternion.setFromUnitVectors(UP, _w.divideScalar(len)); o.scale.set(r, len, r); };
  const drop = o => { o.parent?.remove(o); o.traverse?.(c => { if (c.geometry && !Object.values(G).includes(c.geometry)) c.geometry.dispose(); if (c.material && c.material.userData?.own) c.material.dispose(); }); };

  function buildRoot() {
    makeShared();
    root = new T.Group(); root.name = 'daimon'; host.scene.add(root);
    // the terrace, and the rock it is cut from
    mesh(new T.CylinderGeometry(25, 22, 1.6, 22), M.stone, root, 0, -0.8, 0);
    mesh(new T.ConeGeometry(22, 19, 9), M.dark, root, 0, -11.1, 0).rotation.x = Math.PI;
    mesh(new T.TorusGeometry(18, 0.12, 4, 60), M.ember, root, 0, 0.06, 0).rotation.x = Math.PI / 2;
    mesh(new T.TorusGeometry(24.7, 0.2, 5, 72), M.ember, root, 0, 0.02, 0).rotation.x = Math.PI / 2;
    // the hearth
    const h = root.userData.hearth = new T.Group(); root.add(h);
    mesh(new T.CylinderGeometry(1.7, 1.2, 0.9, 8), M.stone, h, 0, 0.45, 0);
    h.userData.flames = [0, 1, 2, 3, 4].map(i => mesh(G.cone, i % 2 ? M.gold : M.ember, h, Math.cos(i * 2.4) * 0.5, 0.9, Math.sin(i * 2.4) * 0.5, 0.42, 1.2, 0.42));
    root.userData.label = mark('place site');
  }

  // ── homes
  function syncHomes() {
    for (const [n, H] of homes) if (!L.homeBy.has(n)) { drop(H.g); H.label.remove(); homes.delete(n); }
    for (const h of L.homes) {
      let H = homes.get(h.name);
      if (!H) {
        const g = new T.Group(); root.add(g);
        mesh(G.box, M.stone, g, 0, 0, 0, 3.5, 0.32, 3.1);
        for (const [x, z] of [[-1.45, -1.25], [1.45, -1.25], [-1.45, 1.25], [1.45, 1.25]]) mesh(new T.CylinderGeometry(0.13, 0.16, 2.3, 6), M.stone, g, x, 1.47, z);
        const roof = mesh(new T.ConeGeometry(2.75, 1.05, 4), M.stone, g, 0, 3.15, 0); roof.rotation.y = Math.PI / 4;
        mesh(G.box, M.stone, g, 0, 2.62, 0, 3.7, 0.2, 3.3);
        const m = new T.MeshBasicMaterial({ color: hueCol(h.hue, 0.9, 0.55, 2) }); m.userData.own = true;
        H = { g, heart: mesh(G.octa, m, g, 0, 1.35, 0, 0.34, 0.5, 0.34), mat: m, tabs: [], label: mark('place'), n: -1 };
        homes.set(h.name, H);
      }
      H.g.position.set(h.x, 0, h.z); H.g.rotation.y = h.yaw; H.h = h;
      H.mat.color.copy(hueCol(h.hue, 0.9, h.online ? 0.56 : 0.3, h.online ? 2.3 : 0.6));
      const n = Math.min(10, h.notes + h.shared);
      if (n !== H.n) { H.n = n; for (const tb of H.tabs) drop(tb); H.tabs = [];
        for (let i = 0; i < n; i++) H.tabs.push(mesh(G.box, i < h.shared ? M.gold : glowMat(h.hue, 1.5), H.g, -1.1 + (i % 5) * 0.55, 0.7 + Math.floor(i / 5) * 0.75, -1.05, 0.36, 0.5, 0.06)); }
      text(H.label, 'b', h.name); H.label.style.color = css(h.hue, h.online ? 66 : 45); text(H.label, 'span', h.notes + h.shared ? `${h.notes + h.shared} kept` : '');
    }
  }

  // ── sites: the trees
  function syncSites() {
    for (const [id, S] of sites) if (!L.siteBy.has(id)) { drop(S.g); S.label.remove(); for (const b of S.boughs.values()) b.label.remove(); sites.delete(id); }
    for (const s of L.sites) {
      let S = sites.get(s.id);
      if (!S) {
        const g = new T.Group(); root.add(g);
        const isle = new T.Group(); g.add(isle);   // (the rock it stands on widens as the precinct about the trunk fills)
        mesh(new T.CylinderGeometry(6.6, 5.2, 1.3, 14), M.stone, isle, 0, -0.65, 0); mesh(new T.ConeGeometry(5.2, 8, 7), M.dark, isle, 0, -5.3, 0).rotation.x = Math.PI;
        mesh(new T.TorusGeometry(6.4, 0.1, 4, 40), M.ember, isle, 0, 0.03, 0).rotation.x = Math.PI / 2; g.userData.isle = isle;
        S = { g, veins: [0, 1, 2].map(k => mesh(G.box, M.gold, g, Math.cos(k * 2.094 + 0.5) * 1.42, 0, Math.sin(k * 2.094 + 0.5) * 1.42, 0.09, 1, 0.09)), trunk: mesh(G.trunk, M.stone, g, 0, 0, 0, 1.7, 1, 1.7), cap: mesh(G.box, M.stone, g, 0, 10, 0, 2.6, 0.5, 2.6), h: 1, boughs: new Map(), stones: new Map(), rings: [], label: mark('place site'), bridge: lineOf(0x6a6558, root), pulse: 0, pulseHue: 110 };
        sites.set(s.id, S);
      }
      S.s = s; S.g.position.set(s.x, 0, s.z); S.th = s.trunkH; S.g.userData.isle.scale.set(s.baseR / 6.6, 1, s.baseR / 6.6);
      const d = Math.hypot(s.x, s.z) || 1; setLine(S.bridge, { x: s.x / d * 24.5, y: -0.2, z: s.z / d * 24.5 }, { x: s.x - s.x / d * s.baseR, y: -0.2, z: s.z - s.z / d * s.baseR });
      text(S.label, 'b', s.repo.toUpperCase()); S.sub = s.commits + s.ok + s.fail ? `${s.commits} commits · ${s.ok} ok${s.fail ? ` · ${s.fail} failed` : ''}` : '';
      while (S.rings.length < Math.min(6, s.commits)) { const r = mesh(G.ring, M.gold, S.g, 0, 0, 0, 1.5 + S.rings.length * 0.1); r.rotation.x = Math.PI / 2; S.rings.push(r); }   // (a ring about the head of the trunk for each commit, up to six)
      const seenB = new Set(), seenF = new Set();
      for (const b of s.branches) {
        seenB.add(b.name);
        if (!b.main) {
          let B = S.boughs.get(b.name);
          if (!B) { B = { m: mesh(G.bough, M.stone, S.g), vein: mesh(G.bough, glowMat(40, 1.6), S.g), label: mark('place'), len: 0.01 }; S.boughs.set(b.name, B); }
          B.b = b;
        }
        for (const f of b.files) {
          const key = `${b.name}\n${f.path}`; seenF.add(key);
          let St = S.stones.get(key);
          if (!St) { const m = new T.MeshLambertMaterial({ color: 0x8f8a80, flatShading: true, emissive: 0x000000 }); m.userData.own = true;
            const cm = new T.MeshBasicMaterial({ color: 0xffffff }); cm.userData.own = true;   // (the course on top: the last one laid, lit in its maker's colour, cooling)
            const em = new T.LineBasicMaterial({ color: 0xffffff }); em.userData.own = true; const edge = new T.LineSegments(G.edges, em); S.g.add(edge);   // (only read so far: the outline of a stone, not yet cut)
            St = { m: mesh(G.box, m, S.g, f.x, f.y, f.z, 0.01, 0.01, 0.01), cap: mesh(G.box, cm, S.g, f.x, f.y, f.z, 0.01, 0.14, 0.01), edge, edgeMat: em, mat: m, capMat: cm, h: 0.01, w: 0.01, flash: 0, edits: f.edits }; S.stones.set(key, St); }
          if (f.edits > St.edits) { St.flash = 1; St.edits = f.edits; }
          St.f = f; St.hue = f.bad ? 4 : hueOfName(f.by); St.m.position.set(f.x, f.y, f.z); St.edge.position.set(f.x, f.y, f.z);
        }
      }
      for (const [n, B] of S.boughs) if (!seenB.has(n)) { drop(B.m); drop(B.vein); B.label.remove(); S.boughs.delete(n); }
      for (const [k, St] of S.stones) if (!seenF.has(k)) { drop(St.m); drop(St.cap); drop(St.edge); S.stones.delete(k); }
    }
  }
  const hueOfName = n => world.state.personas.get(String(n).split('.')[0])?.hue ?? [...world.state.agents.values()].find(a => a.name === n)?.hue ?? 36;

  // ── the agents themselves
  function makeAgent(a) {
    const g = new T.Group(), k = a.parentId ? 0.62 : 1; g.scale.setScalar(1.9 * k);
    const body = new T.MeshLambertMaterial({ color: 0x2a2622, flatShading: true, emissive: hueCol(a.hue, 0.9, 0.5), emissiveIntensity: 0.55 }); body.userData.own = true;
    const lit = new T.MeshBasicMaterial({ color: hueCol(a.hue, 0.95, 0.58, 2.4), side: T.DoubleSide }); lit.userData.own = true;
    const A = { id: a.id, g, body, lit, k, torso: mesh(G.octa, body, g, 0, 0, 0, 0.42, 0.9, 0.34), head: mesh(G.ico, lit, g, 0, 1.12, 0, 0.26), wings: [], beads: [], hands: [],
      pos: new T.Vector3(), to: new T.Vector3(), look: new T.Vector3(), born: t, flap: Math.random() * 6, label: mark(a.parentId ? 'kid' : '', () => agentClick(a.id)), saidT: -99, said: '', gone: 0 };
    for (const s of [-1, 1]) { const piv = new T.Group(); piv.position.set(s * 0.2, 0.42, 0.1); const w = mesh(G.wing, lit, piv); w.scale.set(s, 1, 1); g.add(piv); A.wings.push(piv); }
    const halo = A.halo = new T.Group(); halo.position.y = 1.62; g.add(halo);
    for (let i = 0; i < 12; i++) { const an = i / 12 * 6.2832; A.beads.push(mesh(G.bead, M.dim, halo, Math.cos(an) * 0.5, 0, Math.sin(an) * 0.5, 0.055)); }
    for (const s of [-1, 1]) A.hands.push(mesh(G.box, lit, g, s * 0.62, 0.1, 0.3, 0.16));
    A.beacon = mesh(G.beam, M.ask, g, 0, 1.8, 0, 0.16, 70, 0.16); A.beacon.visible = false;
    A.bless = mesh(G.ring, M.gold, g, 0, 0.3, 0, 1.15); A.bless.rotation.x = Math.PI / 2; A.bless.visible = false;
    A.beam = lineOf(hueCol(a.hue, 0.95, 0.6, 2.2), root); A.tether = lineOf(hueCol(a.hue, 0.7, 0.5, 1.2), root); A.beam.visible = A.tether.visible = false;
    root.add(g); agents.set(a.id, A);
    return A;
  }
  function syncAgents() {
    for (const [id, A] of agents) if (!world.state.agents.has(id) && !A.gone) A.gone = t;   // (it shrinks away over a moment)
    for (const a of world.state.agents.values()) {
      const p = L.agents.get(a.id); if (!p) continue;
      let A = agents.get(a.id), fresh = false;
      if (!A) { A = makeAgent(a); fresh = true; }
      A.a = a; A.p = p; A.gone = 0; A.to.set(p.x, p.y + 0.9, p.z);
      if (p.look) A.look.set(p.look.x, p.look.y, p.look.z);
      if (A.merge) { const P = agents.get(a.parentId); if (P) A.to.copy(P.pos); }
      if (fresh) { const P = a.parentId && agents.get(a.parentId); A.pos.copy(P ? P.pos : A.to); if (!P) A.pos.y += 14; }
      if (a.hue !== A.hue) { A.hue = a.hue; A.body.emissive.copy(hueCol(a.hue, 0.9, 0.5)); A.lit.color.copy(hueCol(a.hue, 0.95, 0.58, 2.4)); A.beam.material.color.copy(hueCol(a.hue, 0.95, 0.6, 2.2)); A.tether.material.color.copy(hueCol(a.hue, 0.7, 0.5, 1.2)); A.label.style.color = css(a.hue); }
      const u = a.context ? Math.min(1, a.context.used / a.context.max) : 0, lit = Math.round(u * 12), hot = u > 0.85;
      if (A.litN !== lit || A.hot !== hot) { A.litN = lit; A.hot = hot; A.beads.forEach((b, i) => { b.material = i < lit ? (hot ? M.ember : A.lit) : M.dim; b.scale.setScalar(i < lit ? 0.075 : 0.045); }); }
      A.halo.visible = !!a.context;
    }
  }
  function agentLabel(A, near) {
    const a = A.a, ask = a.status === 'waiting' && a.asking, ap = ask && world.state.approvals.get(a.asking);
    const speak = t - A.saidT < 7 ? `“${short(A.said, 70)}”` : '';
    const sub = ap ? `ASKS · ${short(ap.title, 44)} · ${ap.options.length ? '1–' + ap.options.length : 'ENTER'}` : speak || (a.tool ? `${a.tool.kind} ${short(baseName(a.tool.target) || a.tool.target, 34)}` : a.parentId ? short(a.task, 50) : short(a.thought || a.task, 64));
    text(A.label, 'b', a.name + (a.boost > Date.now() ? ' ✦' : '')); text(A.label, 'span', near || ap || speak ? sub : '');   // (what it is doing is written under it only from near by, or when it is asking)
    const cn = 'dmk' + (a.parentId ? ' kid' : '') + (ap ? ' ask' : ''); if (A.label._c !== cn) { A.label._c = cn; A.label.className = cn; }
  }
  function agentClick(id) { const A = agents.get(id); if (!A) return; if (host.god?.() && host.dash) host.dash(anchor.x + A.pos.x + 9, anchor.y + A.pos.y + 3, anchor.z + A.pos.z + 9); panelAgent(id); }

  // ── things that happen, shown for a moment
  const stoneOf = e => { const S = sites.get(e.site), St = S?.stones.get(`${e.branch}\n${e.file}`); return St ? { S, St } : null; };
  const beads = (from, to, hue, n = 7, life = 1.5) => { for (let i = 0; i < n; i++) fx.push({ kind: 'bead', from, to, m: mesh(G.bead, hue === 'gold' ? M.gold : glowMat(hue, 2.6), root, 0, -999, 0, 0.16), t0: t + i * 0.09, life }); };
  const where = ref => typeof ref === 'string' ? agents.get(ref)?.pos : ref;
  const burst = (p, hue, n = 26, sp = 6) => { if (!host.emit || !p) return; const c = hueCol(hue, 0.95, 0.6, 2.4), col = [c.r, c.g, c.b]; for (let i = 0; i < n; i++) host.emit(anchor.x + p.x, anchor.y + p.y, anchor.z + p.z, (Math.random() - 0.5) * sp, Math.random() * sp, (Math.random() - 0.5) * sp, 0.5 + Math.random() * 0.7, col, 1.5, 0.9); };
  function wire() {
    world.on('*', () => { stale = true; });
    world.on('connect', () => { hud(); say(`daimons · connected · ${world.state.agents.size} at work${world.state.agents.size ? '' : ' · /agents link to bring one'}`); if (!anchor) { const kept = keptAnchor(); if (kept) anchor = kept; } });
    world.on('disconnect', e => { hud(); if (world.state.seq) say(`daimons · the hub went quiet · ${e.error}`); });
    world.on('act', e => {
      if (e.phase === 'start') return;
      const A = agents.get(e.agentId), hue = A?.a.hue ?? 36;
      if (e.kind === 'edit' || e.kind === 'write') { const hit = stoneOf(e); if (hit) { hit.St.flash = 1; _w.set(hit.S.s.x + hit.St.f.x, hit.St.f.y + hit.St.h, hit.S.s.z + hit.St.f.z); burst(_w, e.ok === false ? 4 : hue, 18, 5);
        fx.push({ kind: 'course', S: hit.S, St: hit.St, m: mesh(G.box, glowMat(e.ok === false ? 4 : hue, 2.4), hit.S.g, hit.St.f.x, hit.St.f.y + hit.St.h + 5, hit.St.f.z, hit.St.f.w * 1.05, 0.16, hit.St.f.w * 1.05), t0: t, life: 0.55 }); } }
      if (e.kind === 'test' || e.kind === 'run' || e.kind === 'commit') { const S = sites.get(e.site) || (A && sites.get([...L.sites].find(s => s.repo === A.a.repo)?.id)); if (S) { S.pulse = 1; S.pulseHue = e.kind === 'commit' ? 44 : e.ok === false ? 4 : 110;
        host.shock?.(anchor.x + S.s.x, anchor.y + (e.kind === 'commit' ? S.h : 0.4), anchor.z + S.s.z, e.kind === 'commit' ? 0xffd27a : e.ok === false ? 0xff5a4a : 0x7dff3a, e.kind === 'commit' ? 9 : 22, 0.9); } }
    });
    world.on('note', e => {
      if (!agents.has(e.agentId)) return;
      if (e.op === 'write' && e.shared) beads(e.agentId, { x: 0, y: 2.2, z: 0 }, 'gold');
      if (e.op === 'read') for (const n of e.from?.length ? e.from : [null]) { const h = n && L?.homeBy.get(n); beads(h ? { x: h.x, y: 1.6, z: h.z } : { x: 0, y: 2.2, z: 0 }, e.agentId, h ? h.hue : 'gold', 9, 1.8); }
    });
    world.on('fork', e => { const P = agents.get(e.parentId); if (P) { burst(P.pos, P.a.hue, 30, 8); host.shock?.(anchor.x + P.pos.x, anchor.y + P.pos.y, anchor.z + P.pos.z, 0xffffff, 7, 0.6, true); } });
    world.on('merge', e => { const C = agents.get(e.childId); if (C) { C.merge = true; stale = true; } });
    world.on('link', e => { beads(e.from, e.to, 'gold', 12, 2.2); say(`${e.fromName} → ${e.toName} · shared what it knows`); });
    world.on('say', e => { const A = agents.get(e.agentId); if (A) { A.said = e.text; A.saidT = t; } host.say(e.name, e.text, ''); });
    world.on('inbox', e => { if (e.text && e.from !== 'owner') say(`${e.from} → ${e.name} · ${short(e.text, 80)}`); });
    world.on('boost', e => { if (!e.until) say(`${e.name} asks again before it acts`); });   // (the blessing itself is announced by whoever gave it)
    world.on('approval', e => { const a = e.approval; more = false;
      if (a.status === 'pending' && !a.auto) { host.toast?.(`${a.name} ASKS · ${a.options.length ? 'CHOOSE' : 'ENTER TO APPROVE'}`); host.sfx?.('ask'); }
      else if (a.status === 'approved' || a.status === 'denied') { say(`${a.status}${a.auto ? ' (blessed)' : ''} · ${a.name}: ${short(a.title, 70)}`); const A = agents.get(a.agentId); if (A) burst(A.pos, a.status === 'approved' ? 110 : 4, 22, 7); } });
  }

  // ── every frame
  function update(dt) {
    if (!world || !root) return;
    t += dt;
    if (!anchor && world.state.connected && host.state() === 'play') settle();   // (the first time: it rises in front of him, where he is looking, once he is in the world)
    const here = (host.realm?.() || 'over') === (anchor?.realm || 'over'), show = world.state.connected && here && !!anchor;
    root.visible = show;
    if (!show) { for (const A of agents.values()) hide(A.label); for (const H of homes.values()) hide(H.label); for (const S of sites.values()) { hide(S.label); for (const B of S.boughs.values()) hide(B.label); } hide(root.userData.label); return; }
    if (stale) { stale = false; L = layout(world.state); syncHomes(); syncSites(); syncAgents(); hud(); }
    root.position.set(anchor.x, anchor.y + Math.sin(t * 0.3) * 0.35, anchor.z);
    const ax = root.position.x, ay = root.position.y, az = root.position.z, god = !!host.god?.(), far = god ? 6000 : 900;
    // the hearth
    { const n = world.state.shared, fl = root.userData.hearth.userData.flames, hgt = 1 + Math.min(6, n * 0.5); fl.forEach((f, i) => { f.scale.y = hgt * (0.7 + 0.3 * Math.sin(t * (5 + i) + i * 2)); f.rotation.y = t * (1 + i * 0.3); f.visible = n > 0 || i < 2; });
      const d = distTo(ax, ay, az); text(root.userData.label, 'b', d > 260 ? 'THE WORKS' : ''); text(root.userData.label, 'span', d > 260 ? `${world.state.agents.size} at work` : (n && d < 90 ? `${n} shared` : '')); place(root.userData.label, ax, ay + hgt + 4, az, far, 45); }
    for (const H of homes.values()) { H.heart.rotation.y = t * 1.2; H.heart.position.y = 1.35 + Math.sin(t * 1.7 + H.h.slot) * 0.08; place(H.label, ax + H.h.x, ay + 4.4, az + H.h.z, 110, 20); }
    // the trees: trunks rise, boughs reach, stones grow a course at a time and cool
    for (const S of sites.values()) {
      const s = S.s; S.h += (S.th - S.h) * Math.min(1, dt * 1.6); S.trunk.scale.y = S.h; S.cap.position.y = S.h;
      S.veins.forEach((v, k) => { v.scale.y = S.h * 0.86; const r = 1.42 - 0.24 * 0.5; v.position.set(Math.cos(k * 2.094 + 0.5) * r, 0, Math.sin(k * 2.094 + 0.5) * r); v.rotation.z = 0; });
      S.rings.forEach((r, i) => { r.position.y = S.h + 0.95 + i * 0.3; r.rotation.z = t * (0.4 + i * 0.07); });
      S.pulse = Math.max(0, S.pulse - dt * 0.7); text(S.label, 'span', distTo(ax + s.x, ay + S.h, az + s.z) < 130 ? S.sub : '');
      place(S.label, ax + s.x, ay + S.h + 5 + S.rings.length * 0.3, az + s.z, far, 50);
      for (const B of S.boughs.values()) { const b = B.b; B.len += (1 - B.len) * Math.min(1, dt * 1.4);
        const tip = { x: b.base.x + (b.tip.x - b.base.x) * B.len, y: b.base.y + (b.tip.y - b.base.y) * B.len, z: b.base.z + (b.tip.z - b.base.z) * B.len };
        span(B.m, b.base, tip, 0.5); const busy = [...agents.values()].find(A => A.p?.site === s.id && A.p?.branch === b.name && A.a.status !== 'offline');
        B.vein.visible = !!busy || S.pulse > 0 || (b.run && !b.run.ok);
        if (B.vein.visible) { const hue = S.pulse > 0 ? S.pulseHue : b.run && !b.run.ok ? 4 : busy.a.hue, k = S.pulse > 0 ? 1 - S.pulse : (t * 0.5) % 1, a0 = { x: b.base.x + (tip.x - b.base.x) * Math.max(0, k - 0.22), y: b.base.y + (tip.y - b.base.y) * Math.max(0, k - 0.22) + 0.42, z: b.base.z + (tip.z - b.base.z) * Math.max(0, k - 0.22) };
          const a1 = { x: b.base.x + (tip.x - b.base.x) * k, y: b.base.y + (tip.y - b.base.y) * k + 0.42, z: b.base.z + (tip.z - b.base.z) * k }; B.vein.material = glowMat(hue, 2.2); span(B.vein, a0, a1, 0.14); }
        text(B.label, 'b', short(b.name, 28)); B.label.style.color = b.run && !b.run.ok ? '#ff7a66' : '#f4ead2'; place(B.label, ax + s.x + tip.x, ay + tip.y + 2.2, az + s.z + tip.z, god ? 900 : 240, 30); }
      for (const St of S.stones.values()) { const f = St.f; St.h += (f.h - St.h) * Math.min(1, dt * 2.2); St.w += (f.w - St.w) * Math.min(1, dt * 3); St.flash = Math.max(0, St.flash - dt * 0.8);
        St.m.scale.set(St.w, St.h, St.w); St.m.visible = !!f.edits; St.edge.visible = !f.edits; const age = Math.exp(-(Date.now() - f.at) / 150000);
        if (!f.edits) { St.edge.scale.set(St.w, Math.max(0.9, St.h * 1.6), St.w); St.edgeMat.color.copy(hueCol(St.hue, 0.8, 0.5 + age * 0.15, 1 + age)); }
        St.mat.color.copy(hueCol(St.hue, f.edits ? 0.1 + age * 0.14 : 0.1, 0.5)); St.mat.emissive.copy(hueCol(St.hue, 0.95, 0.5)); St.mat.emissiveIntensity = 0.04 + age * 0.12 + St.flash * 1.6;
        St.cap.visible = !!f.edits; St.cap.position.set(f.x, f.y + St.h, f.z); St.cap.scale.set(St.w * 1.08, 0.14, St.w * 1.08); St.capMat.color.copy(hueCol(St.hue, 0.95, 0.3 + age * 0.26 + St.flash * 0.2, 1 + age * 1.2 + St.flash * 1.4)); }
    }
    // the agents
    for (const [id, A] of agents) {
      const a = A.a, g = A.g;
      if (A.gone) { const k = 1 - (t - A.gone) / 0.7; if (k <= 0) { drop(g); drop(A.beam); drop(A.tether); A.label.remove(); agents.delete(id); continue; } g.scale.setScalar(1.9 * A.k * k); continue; }
      const off = a.status === 'offline', work = a.status === 'working', ask = a.status === 'waiting';
      A.pos.x += (A.to.x - A.pos.x) * Math.min(1, dt * 2.1); A.pos.y += (A.to.y - A.pos.y) * Math.min(1, dt * 2.1); A.pos.z += (A.to.z - A.pos.z) * Math.min(1, dt * 2.1);
      const moving = A.pos.distanceTo(A.to), bob = off ? 0 : Math.sin(t * 1.9 + a.seed % 7) * 0.22 + (ask ? 1.6 : 0);
      g.position.set(A.pos.x, A.pos.y + bob, A.pos.z);
      const grow = Math.min(1, (t - A.born) / 0.6), mk = A.merge ? Math.max(0.15, Math.min(1, moving / 3)) : 1; g.scale.setScalar(1.9 * A.k * grow * mk);
      // it faces where it is going, then what it is working on
      const tx = moving > 1.2 ? A.to.x : A.look.x, tz = moving > 1.2 ? A.to.z : A.look.z, want = Math.atan2(tx - A.pos.x, tz - A.pos.z); let dy = want - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 5);
      g.rotation.x = Math.min(0.5, moving * 0.04);
      A.flap += dt * (off ? 0.8 : moving > 1.2 ? 15 : work ? 9 : a.status === 'thinking' ? 5 : 2.6); const fl = Math.sin(A.flap) * (off ? 0.08 : 0.55) + (off ? -0.9 : 0.1);
      A.wings[0].rotation.z = -fl; A.wings[1].rotation.z = fl; A.wings[0].rotation.y = A.wings[1].rotation.y = 0;
      A.body.emissiveIntensity = off ? 0.08 : 0.4 + (a.status === 'thinking' ? 0.35 * (0.5 + 0.5 * Math.sin(t * 4)) : work ? 0.35 : 0) + (a.boost > Date.now() ? 0.5 : 0);
      A.head.rotation.y = t * 0.8; A.halo.rotation.y = -t * 0.6;
      // its hands: about it when it is thinking, out at the stone when it is cutting
      const st = A.p.at === 'file' && a.tool && a.tool.kind !== 'read' && moving < 2.5, sc = 1 / (1.9 * A.k);
      A.hands.forEach((h, i) => { const s = i ? 1 : -1;
        if (st) { const k = (Math.sin(t * 9 + i * Math.PI) * 0.5 + 0.5); _w.set(A.look.x - g.position.x, A.look.y - g.position.y, A.look.z - g.position.z).applyAxisAngle(UP, -g.rotation.y).multiplyScalar(sc * (0.25 + 0.6 * k)); h.position.set(_w.x + s * 0.15, _w.y, _w.z); }
        else { const an = t * (work ? 4 : 1.4) + i * Math.PI; h.position.set(Math.cos(an) * 0.66, 0.1 + Math.sin(an * 2) * 0.12, Math.sin(an) * 0.66); }
        h.rotation.set(t * 2, t * 3, 0); });
      const beam = A.p.at === 'file' && a.tool && moving < 3 && !off; A.beam.visible = beam; if (beam) setLine(A.beam, g.position, A.look);
      const P = a.parentId && agents.get(a.parentId); A.tether.visible = !!P; if (P) setLine(A.tether, g.position, P.g.position);
      A.beacon.visible = ask; if (ask) A.beacon.scale.x = A.beacon.scale.z = 0.09 + 0.05 * Math.sin(t * 5);
      A.bless.visible = a.boost > Date.now(); if (A.bless.visible) { A.bless.rotation.z = t * 2; A.bless.position.y = 0.3 + Math.sin(t * 3) * 0.5; }
      const lx = ax + A.pos.x, ly = ay + A.pos.y + bob + 4.4 * A.k, lz = az + A.pos.z; agentLabel(A, distTo(lx, ly, lz) < (god ? 600 : 150));
      place(A.label, lx, ly, lz, ask ? 8000 : a.parentId ? (god ? 900 : 240) : far, ask ? 100 : a.parentId ? 40 : 60 + (t - A.saidT < 7 ? 20 : 0));
    }
    placeAll();
    // what passes between them
    for (let i = fx.length - 1; i >= 0; i--) { const e = fx[i], k = (t - e.t0) / e.life; if (k < 0) continue;
      if (k >= 1) { drop(e.m); fx.splice(i, 1); continue; }
      if (e.kind === 'bead') { const a = where(e.from), b = where(e.to); if (!a || !b) { drop(e.m); fx.splice(i, 1); continue; } const u = k * k * (3 - 2 * k), lift = Math.sin(k * Math.PI) * (4 + a.distanceTo?.(b) * 0.12 || 6); e.m.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + lift, a.z + (b.z - a.z) * u); e.m.scale.setScalar(0.1 + 0.12 * Math.sin(k * Math.PI)); }
      else if (e.kind === 'course') { e.m.position.y = e.St.f.y + e.St.h + 5 * (1 - k) * (1 - k); } }
  }

  // ── the list, the card, the panel
  function hud() {
    if (!world) return; const st = world.state;
    const all = [...st.agents.values()].sort((a, b) => a.joinedAt - b.joinedAt), rows = []; for (const a of all.filter(a => !a.parentId)) { rows.push(a); for (const c of all.filter(x => x.parentId === a.id)) rows.push(c); }
    $list.className = cfg.list && rows.length ? '' : 'hide';
    $list.innerHTML = rows.slice(0, 12).map(a => `<div class="r${a.parentId ? ' kid' : ''}" data-id="${esc(a.id)}" style="color:${css(a.hue)}"><i class="${a.status === 'waiting' || a.status === 'working' ? 'p' : ''}" style="color:${STATUS_COL[a.status]}"></i><b>${esc(a.name)}</b><span>${esc(a.status === 'waiting' ? 'asking you' : a.tool ? `${a.tool.kind} ${baseName(a.tool.target) || a.tool.target}` : a.branch || a.status)}</span></div>`).join('');
    const ap = world.pending()[0];
    if (!ap) { $ask.className = ''; $ask.innerHTML = ''; return; }
    const detail = esc(ap.detail).split('\n').map(l => l.startsWith('+') ? `<span class="a">${l}</span>` : l.startsWith('-') ? `<span class="r">${l}</span>` : l).join('\n'), n = world.pending().length, open = more || ap.options.length || (ap.detail && ap.detail.length < 200);
    $ask.className = 'on'; $ask.style.borderColor = css(ap.hue ?? 24, 60);
    $ask.innerHTML = `<div class="who" style="color:${css(ap.hue ?? 24)}">${esc(ap.name)} ASKS${n > 1 ? `<span class="more">+${n - 1} MORE</span>` : ''}</div><div class="q">${esc(ap.title)}</div>${ap.detail && open ? `<pre>${detail}</pre>` : ''}` +
      `<div class="keys">${ap.options.length ? ap.options.map((o, i) => `<kbd>${i + 1}</kbd>${esc(o)} &nbsp;`).join('') : '<kbd>ENTER</kbd>approve &nbsp;'}<kbd>\\</kbd>deny${ap.detail && !open ? ' &nbsp;<kbd>I</kbd>details' : ''}</div>`;
  }
  $list.addEventListener('click', e => { const r = e.target.closest('.r'); if (r) panelAgent(r.dataset.id); });
  const closePanel = () => { $panel.className = ''; sel = null; };
  async function panelAgent(id) {
    if (sel === id) return closePanel(); sel = id;
    let d; try { d = await world.detail(id); } catch { return closePanel(); }
    const a = d.agent, c = css(a.hue), acts = d.feed.filter(e => e.type === 'act' && e.phase !== 'start').slice(-7).reverse(), bl = a.boost > Date.now();
    $panel.className = 'on';
    $panel.innerHTML = `<span class="x" data-x>✕</span><h2 style="color:${c}">${esc(a.name)}</h2><p class="dim">${esc(a.kind)}${a.model ? ' · ' + esc(a.model) : ''} · ${esc(a.status)}${a.repo ? ` · ${esc(a.repo)}${a.branch ? '@' + esc(a.branch) : ''}` : ''}</p>` +
      (a.task ? `<h3>Doing</h3><p>${esc(a.task)}</p>` : '') + (a.thought ? `<h3>Thinking</h3><p>${esc(a.thought)}</p>` : '') + (a.context ? `<h3>Context</h3><p>${Math.round(a.context.used / 1000)}k of ${Math.round(a.context.max / 1000)}k tokens</p>` : '') +
      (a.plan.length ? `<h3>Plan</h3>${a.plan.map(p => `<p class="${p.status === 'completed' ? 'dim' : ''}">${p.status === 'completed' ? '✓' : p.status === 'in_progress' ? '▸' : '·'} ${esc(p.text)}</p>`).join('')}` : '') +
      `<h3>Home · ${d.notes.length} kept</h3>${d.notes.slice(0, 5).map(n => `<p><span style="color:${n.shared ? '#ffd27a' : c}">${esc(n.key)}</span>${n.shared ? ' <span class="dim">(shared)</span>' : ''}<br><span class="dim">${esc(short(n.text, 180))}</span></p>`).join('') || '<p class="dim">nothing kept yet</p>'}` +
      (acts.length ? `<h3>Lately</h3>${acts.map(e => `<p class="dim">${esc(e.kind)} ${esc(short(baseName(e.target) || e.target, 32))}${+e.added ? ` +${+e.added}` : ''}${e.ok === false ? ' · failed' : ''}</p>`).join('')}` : '') +
      `<button data-do="say">Speak to</button><button data-do="bless">${bl ? 'Unbless' : 'Bless 10 min'}</button><button data-do="go">Go to</button><button data-do="home">Send home</button>`;
    $panel.onclick = e => { const b = e.target.dataset; if (b.x !== undefined) return closePanel();
      if (b.do === 'say') { closePanel(); host.openChat?.(`/a ${a.name.replace(/ /g, '')} `); }
      if (b.do === 'bless') run(bl ? `unbless ${a.id}` : `bless ${a.id} 10`).then(() => { sel = null; panelAgent(id); });
      if (b.do === 'go') { closePanel(); const A = agents.get(id); if (A) host.goto?.(anchor.x + A.pos.x + 10, anchor.y + A.pos.y + 4, anchor.z + A.pos.z + 10); }
      if (b.do === 'home') run(`dismiss ${a.id}`).then(closePanel); };
  }
  async function panelLink() {
    sel = null; $panel.className = 'on'; $panel.innerHTML = '<span class="x" data-x>✕</span><h2>LINK AN AGENT</h2><p class="dim">making a token…</p>';
    $panel.onclick = e => { if (e.target.dataset.x !== undefined) closePanel(); if (e.target.tagName === 'CODE') navigator.clipboard?.writeText(e.target.textContent).then(() => say('copied')); };
    try { const tk = await world.mint('icarus'); navigator.clipboard?.writeText(`${tk.connect.link} --claude`).catch(() => {});
      $panel.innerHTML = `<span class="x" data-x>✕</span><h2>LINK AN AGENT</h2><p class="dim">Agents that carry this token are yours, on any device you play from. Click a line to copy it; the first is on your clipboard already. Paste it in a terminal.</p>` +
        `<h3>Claude Code</h3><code>${esc(tk.connect.link)} --claude</code><h3>Claude Code · the MCP server only</h3><code>${esc(tk.connect.claude)}</code><h3>Any other agent that speaks MCP</h3><code>${esc(JSON.stringify(tk.connect.json))}</code>`;
      say('a link is on your clipboard · paste it in a terminal');
    } catch (e) { $panel.innerHTML = `<span class="x" data-x>✕</span><h2>LINK AN AGENT</h2><p>${esc(e.message)}</p>`; }
  }

  // ── where the Works stand: where he says, kept with his account; the first time, a little way in front of him
  const keptAnchor = () => { let a = world?.state.owner?.settings?.anchors?.[WID]; if (!a) { try { a = JSON.parse(LS.get('anchor.' + WID) || 'null'); } catch {} } return a && Number.isFinite(a.x) && (a.x || a.z) ? a : null; };
  function settle(at) {   // at: true = here, at his feet · a number = that many metres in front of him · nothing = where it was kept, or in front of him
    const saved = at == null && keptAnchor();
    if (saved) { anchor = saved; return; }
    const p = host.player(), d = at === true ? 0 : +at || 110; host.camera.getWorldDirection(_w); _w.y = 0; if (_w.lengthSq() < 1e-4) _w.set(0, 0, -1); _w.normalize();   // (in front of him is where he is looking)
    const gx = p.x + _w.x * d, gz = p.z + _w.z * d, gy = host.ground?.(gx, gz) ?? 0;
    // (on the ground at his feet it is laid on the ground and can be walked; out in front it hangs a little below his eye, so he looks down into it)
    anchor = { x: gx, y: at === true ? (p.y - gy < 8 ? gy + 0.15 : p.y - 3) : Math.max(gy + 0.15, p.y - 9), z: gz, yaw: 0, realm: host.realm?.() || 'over' };
    LS.set('anchor.' + WID, JSON.stringify(anchor)); world?.settings({ world: WID, anchor }).catch(() => {});
  }

  // ── connecting
  async function boot(announce = false) {
    if (world || connecting || !cfg.on) return; connecting = true;
    try {
      const hub = cfg.hub || (LOCAL ? 'http://localhost:4747' : '');
      if (!hub) { if (announce) say('daimons · no hub is set · /agents hub URL (on your own machine: run "daimon hub", then /agents hub http://localhost:4747)'); return; }
      // A page on the internet reaching a hub on the player's own machine: the browser asks the player first (Chrome's
      // "local network access"), and holds the request until they answer. So say what the question is, and wait for it.
      const far = !LOCAL && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(hub);
      let asked = ''; if (far) try { asked = (await navigator.permissions.query({ name: 'local-network-access' })).state; } catch {}
      if (asked === 'denied') { say('daimons · this browser has been told not to let this page reach your machine · in the site\'s settings allow "local network access", then /agents on'); return; }
      if (asked === 'prompt') say('daimons · your browser is asking whether this page may reach your machine · allow it, and your agents come in');
      const ok = await fetch(`${hub}/health`, { signal: AbortSignal.timeout(asked === 'prompt' ? 120000 : 2500) }).then(r => r.ok, () => false);
      if (!ok) { if (announce || cfg.hub) say(`daimons · no hub is answering at ${hub}${far ? ' · it has to be running on this machine ("daimon hub"), and this page allowed to reach it' : ''}`); return; }
      let code = host.code?.(); for (let i = 0; !code && !cfg.demo && i < 600; i++) { await new Promise(r => setTimeout(r, 1000)); code = host.code?.(); }
      const key = cfg.demo ? DEMO_KEY : await keyFrom(code, 'icarus');
      buildRoot(); world = connect({ hub, key, name: host.name?.() || '' }); wire();
      api.world = world;
    } finally { connecting = false; }
  }
  function shut() { if (!world) return; world.close(); world = null; api.world = null; ui.className = 'off'; closePanel();
    for (const A of agents.values()) { A.label.remove(); drop(A.beam); drop(A.tether); } agents.clear(); for (const H of homes.values()) H.label.remove(); homes.clear();
    for (const S of sites.values()) { S.label.remove(); for (const B of S.boughs.values()) B.label.remove(); } sites.clear(); root?.userData.label.remove(); if (root) { host.scene.remove(root); root = null; } for (const e of fx) drop(e.m); fx.length = 0; anchor = null; L = null; }

  // ── what he types. /agents … and the short ones: /a NAME words · /yes · /no why · /bless NAME · /share A B · /send task
  const run = async cmd => { const r = await typed(world, cmd); (r || [`not understood: ${cmd}`]).forEach(l => say(l)); return r; };
  function command(c, arg) {
    c = String(c).toLowerCase(); arg = String(arg || '').trim();
    const mine = ['agents', 'daimons', 'daimon', 'a', 'yes', 'no', 'bless', 'unbless', 'share', 'send'];   // (/agent, singular, is the keeper's own: left alone)
    if (!mine.includes(c)) return false;
    const low = arg.toLowerCase(), [w0, w1] = arg.split(/\s+/);
    if (['agents', 'daimons', 'daimon'].includes(c)) {
      if (low === 'off') { cfg.on = false; LS.set('on', '0'); shut(); say('daimons · off'); return true; }
      if (low === 'on' || low === 'connect') { cfg.on = true; LS.set('on', null); boot(true); return true; }
      if (w0?.toLowerCase() === 'hub') { if (!w1) { say(`daimons · hub: ${cfg.hub || (LOCAL ? 'http://localhost:4747 (the default here)' : 'none')}`); return true; } cfg.hub = /^https?:\/\//.test(w1) ? w1.replace(/\/+$/, '') : ''; LS.set('hub', cfg.hub || null); cfg.on = true; LS.set('on', null); shut(); boot(true); return true; }
      if (low === 'demo' || low === 'demo off') { cfg.demo = low === 'demo'; LS.set('demo', cfg.demo ? '1' : null); cfg.on = true; LS.set('on', null); shut(); boot(true); say(cfg.demo ? 'daimons · the demo\'s agents (run: daimon demo)' : 'daimons · your own agents'); return true; }
      if (!world) { boot(true); return true; }
      if (!arg) { run('who'); say('/agents help · link · here · ahead · go · hide · off'); return true; }
      if (low === 'help' || low === '?') { ['/agents link · here · ahead METRES · go · hide|show · hub URL · demo · off', '/a NAME words (or /a words, to all) · /yes · /no why · /bless NAME minutes · /share A B · /send task', 'enter approves · \\ denies · I looks closer · Y speaks to them', ...HELP.slice(2)].forEach(l => say(l)); return true; }
      if (low === 'link') { panelLink(); return true; }
      if (low === 'here') { settle(true); say('daimons · the works stand here now'); return true; }
      if (w0?.toLowerCase() === 'ahead' || low === 'there') { settle(Math.max(20, Math.min(2000, +w1 || 110))); say('daimons · the works stand in front of you now'); return true; }
      if (low === 'go' || low === 'goto') { if (anchor) host.goto?.(anchor.x + 34, anchor.y + 16, anchor.z + 34); return true; }
      if (low === 'hide' || low === 'show') { cfg.list = low === 'show'; LS.set('list', cfg.list ? null : '0'); hud(); return true; }
      run(arg); return true;
    }
    if (!world) { say('daimons are not connected · /agents'); return true; }
    if (c === 'a') { if (!arg) { say('/a NAME words · or /a words, to all of them'); return true; } typed(world, arg).then(r => r === null ? typed(world, `all ${arg}`) : r).then(r => (r || []).forEach(l => say(l))); return true; }
    run(`${c} ${arg}`); return true;
  }
  // what he says aloud (the game passes it here while the god is in him)
  function hear(textSaid) { if (!world?.state.connected) return false; const r = spoken(world, textSaid); if (!r) return false; r.then(lines => (lines || []).forEach(l => say(l))); return true; }

  // ── one key. Enter is yes wherever he is in the game, unless he is typing; \ is no; a number picks an answer.
  addEventListener('keydown', e => {
    if (!world?.state.connected || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const st = host.state(); if (st === 'title' || st === 'loading' || st === 'prologue' || st === 'end') return;
    const ap = world.pending()[0], eat = () => { e.preventDefault(); e.stopImmediatePropagation(); }, done = p => p.catch(er => say(er.message));
    if (ap) {
      if (e.code === 'Enter' && !ap.options.length) { eat(); return done(world.approve(ap.id)); }
      if (e.code === 'Backslash') { eat(); return done(world.deny(ap.id)); }
      if (ap.options.length && /^(Digit|Numpad)[1-9]$/.test(e.code) && ap.options[+e.code.slice(-1) - 1]) { eat(); return done(world.approve(ap.id, ap.options[+e.code.slice(-1) - 1])); }
      if (e.code === 'KeyI') { eat(); more = !more; return hud(); }
    }
    if (st !== 'play') return;
    if (e.code === 'KeyI' && world.state.agents.size) { eat(); const near = [...agents.values()].filter(A => !A.gone).sort((p, q) => p.g.position.distanceTo(_v.copy(host.camera.position).sub(root.position)) - q.g.position.distanceTo(_v))[0]; if (sel) closePanel(); else if (near) panelAgent(near.id); }
    else if (e.code === 'KeyY' && world.state.agents.size) { eat(); host.openChat?.('/a '); }
    else if (e.code === 'Escape' && sel) { closePanel(); }
  }, true);

  // the card and the list keep out of the way of the title and the opening: they are for someone who is playing
  setInterval(() => { if (!world) return; const st = host.state(), quiet = st === 'title' || st === 'loading' || st === 'prologue' || st === 'end'; const cn = quiet ? 'off' : ''; if (ui.className !== cn) ui.className = cn; }, 400);
  const api = { update, command, hear, world: null, host, boot, shut, get anchor() { return anchor; }, get layout() { return L; }, agents, sites, homes };
  boot(false);
  return api;
}
