// THE CROSSING, Icarus's visitor kit: how someone from BURNING STUDIO MUSIC looks in this world. They keep their own style
// (8-bit boxes, BRN's palette) inside Icarus's letters, the way a cartoon walks into somebody else's show. Loaded only when
// the crossing is on (index.html, see XO). Everything is box geometry in Icarus's own frame: y up, forward is -z.
//
// The bodies are built here; index.html moves them, by copying the pose of an Icarus body that stands in for them (so every
// way an Icarus man or bird can move, a visitor moves too), and the ASCII pass draws every pixel they write with alpha VIS_A
// as blocks snapped to the palette below instead of letters (postMat: "a visitor from BURNING STUDIO MUSIC").
//   boxPerson(look)  the wardrobe figure (wt/brn/js/wardrobe.js figure(): the same boxes and proportions), with a space suit
//   boxPhoenix()     BRN's box phoenix (zoo.js 'phoenix'), jointed like Icarus's bird so it takes the same wing poses
//   boxPet(kind)     MURPH, ODIE, BATMAN (cats) and CALI (the dog), in their colours (cats.js CATS), with a suit for space
//   boxShip(kind)    the four ships of COSMIC (space.js LOOKS)
//   stadium()        the COSMIC stadium itself, for Icarus's space: drawn in letters like the rest of Icarus's world
import * as THREE from 'three';

export const VIS_A = 0.2;                         // (alpha one fifth: below the nine name levels 0.38..0.62 and the hero's half)
export const VIS = { value: VIS_A };
// BRN's palette (px.js PAL: the NES 2C02 and the darks a black-box theatre needs), and its 4x4 ordered dither
export const PAL = [
  0x7C7C7C, 0x0000FC, 0x0000BC, 0x4428BC, 0x940084, 0xA80020, 0xA81000, 0x881400, 0x503000, 0x007800, 0x006800, 0x005800, 0x004058, 0x000000,
  0xBCBCBC, 0x0078F8, 0x0058F8, 0x6844FC, 0xD800CC, 0xE40058, 0xF83800, 0xE45C10, 0xAC7C00, 0x00B800, 0x00A800, 0x00A844, 0x008888,
  0xF8F8F8, 0x3CBCFC, 0x6888FC, 0x9878F8, 0xF878F8, 0xF85898, 0xF87858, 0xFCA044, 0xF8B800, 0xB8F818, 0x58D854, 0x58F898, 0x00E8D8, 0x787878,
  0xFCFCFC, 0xA4E4FC, 0xB8B8F8, 0xD8B8F8, 0xF8B8F8, 0xF8A4C0, 0xF0D0B0, 0xFCE0A8, 0xF8D878, 0xD8F878, 0xB8F8B8, 0xB8F8D8, 0x00FCFC, 0xF8D8F8,
  0x0c0c10, 0x16161b, 0x222128, 0x302f37, 0x45434d, 0x5c5a64, 0x2a1218, 0x3e1a20, 0x5a2a1c, 0x7a4a2a, 0xd8b080, 0x9a6a48,
].map(c => new THREE.Vector3((c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255));   // (as they are shown: the ASCII pass compares them with the picture after its own sRGB)
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---- the look: wardrobe.js's code ('b', four style digits, seven 12-bit colours) ----
const c24 = s => '#' + s.split('').map(x => x + x).join('');
export function decodeLook(w) {
  if (!/^b[0-9a-f]{25}$/.test(w || '')) return null;
  const n = i => parseInt(w[i], 16), col = j => c24(w.substr(5 + j * 3, 3));
  return { hs: Math.min(3, n(1)), top: Math.min(2, n(2)), hat: Math.min(5, n(3)), specs: n(4) ? 1 : 0, skin: col(0), hair: col(1), topC: col(2), inC: col(3), legs: col(4), hatC: col(5), specC: col(6) };
}
export const BASE_LOOK = { hs: 0, top: 0, hat: 0, specs: 0, skin: '#eeccaa', hair: '#221111', topC: '#224488', inC: '#ffffee', legs: '#222233', hatC: '#111111', specC: '#111111' };
// someone whose look we don't have: one from who they are, the way the BRN crowd dresses a visitor from their tag
const SKINS = ['#ffddcc', '#ffddbb', '#eeccaa', '#ddaa88', '#cc9966', '#bb8855', '#996655', '#774433'], HAIRS = ['#111111', '#221111', '#443322', '#663322', '#886633', '#ccaa88', '#666666', '#aa2233'];
const CLOTH = ['#111111', '#223344', '#556677', '#ddddcc', '#112244', '#224488', '#22bbaa', '#335522', '#55aa44', '#eeaa22', '#ff8822', '#dd2233', '#881122', '#dd6688', '#7744bb', '#443322'];
export function lookFor(seed) {
  let h = 2166136261; for (const ch of String(seed || 'x')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296, pk = a => a[Math.floor(r() * a.length)];
  return { hs: Math.floor(r() * 3), top: Math.floor(r() * 3), hat: r() < 0.5 ? 0 : 1 + Math.floor(r() * 5), specs: r() < 0.25 ? 1 : 0, skin: pk(SKINS), hair: pk(HAIRS), topC: pk(CLOTH), inC: pk(CLOTH), legs: pk(CLOTH), hatC: pk(CLOTH), specC: '#111111' };
}

// ---- materials: everything here writes the visitor's alpha, so the glyph pass leaves it to be drawn in blocks ----
function visify(m, key) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uVis = VIS;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uVis;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = uVis;');
  };
  m.customProgramCacheKey = () => 'xvis-' + key;
  return m;
}
let MATS = null;
export function mats() {
  if (MATS) return MATS;
  const lit = visify(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1c1612 }), 'lit');
  const glow = visify(new THREE.MeshBasicMaterial({ vertexColors: true }), 'glow');
  // glass: a fifth of its colour over what is behind it, and the visitor's alpha written (the bubble is theirs, so it is pixels too)
  const glass = visify(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.25), transparent: true, depthWrite: false }), 'glass');
  glass.blending = THREE.CustomBlending; glass.blendSrc = THREE.SrcAlphaFactor; glass.blendDst = THREE.OneMinusSrcAlphaFactor; glass.blendSrcAlpha = THREE.OneFactor; glass.blendDstAlpha = THREE.ZeroFactor;
  // the world's own: the stadium is Icarus's to draw, in letters (no visitor alpha)
  const world = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2246 }), worldGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
  return MATS = { lit, glow, glass, world, worldGlow };
}

// ---- boxes, merged: one geometry per moving part ----
const _c = new THREE.Color();
const colOf = (c, k = 1) => (Array.isArray(c) ? _c.setRGB(c[0], c[1], c[2]) : _c.set(c)).multiplyScalar(k);
class Boxes {
  constructor() { this.p = []; this.n = []; this.c = []; }
  get empty() { return !this.p.length; }
  quad(a, b, c, d, n, col) { for (const v of [a, b, c, a, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(col.r, col.g, col.b); } }
  // x0..x1, y0..y1, z0..z1; the top in its colour, the sides a little darker, the front and back between, the underside dark
  box(x0, x1, y0, y1, z0, z1, col, side, shade = 1) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
    const T = colOf(col, shade).clone(), S = side ? colOf(side, shade).clone() : T.clone().multiplyScalar(0.82), F = T.clone().multiplyScalar(0.92), B = T.clone().multiplyScalar(0.62);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], T);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], B);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], S);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], S);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], F);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], F);
  }
  // by its middle and size
  at(cx, cy, cz, w, h, d, col, side, shade) { this.box(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, cz - d / 2, cz + d / 2, col, side, shade); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
  mesh(mat, shadow = true) { const m = new THREE.Mesh(this.geometry(), mat); m.castShadow = shadow; m.receiveShadow = false; return m; }
}
export { Boxes };
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; };
const part = (parent, fn, mat) => { const b = new Boxes(); fn(b); if (b.empty) return null; const m = b.mesh(mat || mats().lit); parent.add(m); return m; };
const dk = (h, k) => '#' + new THREE.Color(h).multiplyScalar(k).getHexString();

// ---- a person: the changing room's figure (metres; feet on y = 0; the face toward -z) ----
// Jointed where an Icarus man is (hips, chest, head, shoulders, elbows, hips, knees) so it can take his pose: see XO.pose.
const SUIT = { white: '#e9ecef', pad: '#c4cad1', grey: '#7b8590', dark: '#2c323a', gold: '#d9a441' };
export function boxPerson(look) {
  const L = { ...BASE_LOOK, ...(look || {}) }, M = mats(), cloth = [], suit = [];
  const two = (parent, fnC, fnS) => { const a = part(parent, fnC); const b = fnS ? part(parent, fnS) : null; if (a) cloth.push(a); if (b) { suit.push(b); b.visible = false; } return [a, b]; };
  const root = new THREE.Group(), hips = grp(root, 0, 0.8, 0), chest = grp(hips, 0, 0, 0), head = grp(chest, 0, 0.64, 0);
  const bald = L.hs === 3 && !L.hat, hairC = bald ? L.skin : L.hair;
  // legs: thigh and shin on their joints, a shoe
  const legs = [-1, 1].map(s => {
    const thigh = grp(hips, s * 0.1, 0, 0), shin = grp(thigh, 0, -0.4, 0);
    two(thigh, b => b.at(0, -0.2, 0, 0.17, 0.42, 0.2, L.legs), b => b.at(0, -0.2, 0, 0.2, 0.42, 0.23, SUIT.white));
    two(shin, b => { b.at(0, -0.17, 0, 0.17, 0.36, 0.2, L.legs); b.at(0, -0.37, -0.03, 0.18, 0.06, 0.26, dk(L.legs, 0.55)); },
      b => { b.at(0, -0.15, 0, 0.2, 0.32, 0.23, SUIT.white); b.at(0, -0.3, 0, 0.21, 0.06, 0.24, SUIT.grey); b.at(0, -0.37, -0.03, 0.22, 0.08, 0.3, SUIT.dark); });
    return [thigh, shin];
  });
  // the body, and what's on it
  two(chest, b => {
    b.at(0, 0.31, 0, 0.5, 0.62, 0.3, L.topC);
    if (L.top === 1) { b.at(0, 0.33, -0.155, 0.15, 0.56, 0.02, L.inC); b.at(-0.12, 0.52, -0.16, 0.06, 0.16, 0.02, dk(L.topC, 0.75)); b.at(0.12, 0.52, -0.16, 0.06, 0.16, 0.02, dk(L.topC, 0.75)); }
    if (L.top === 2) { b.at(0, 0.18, -0.155, 0.3, 0.16, 0.02, dk(L.topC, 0.82)); b.at(0, 0.64, 0.11, 0.4, 0.14, 0.12, dk(L.topC, 0.85)); }
    b.at(0, 0.67, 0, 0.14, 0.06, 0.14, L.skin);
  }, b => {
    b.at(0, 0.31, 0, 0.54, 0.64, 0.34, SUIT.white); b.at(0, 0.02, 0, 0.56, 0.06, 0.36, SUIT.grey); b.at(0, 0.66, 0, 0.3, 0.06, 0.3, SUIT.grey);
    b.at(0, 0.36, 0.26, 0.4, 0.5, 0.18, SUIT.white); b.at(0, 0.12, 0.26, 0.42, 0.06, 0.2, SUIT.grey); b.at(0, 0.6, 0.26, 0.42, 0.06, 0.2, SUIT.grey);   // the pack of air
    b.at(0, 0.4, -0.18, 0.18, 0.11, 0.05, SUIT.grey); b.at(-0.05, 0.42, -0.21, 0.03, 0.03, 0.02, '#8fe6ff'); b.at(0.05, 0.42, -0.21, 0.03, 0.03, 0.02, '#ff5a3a');
    b.at(0.17, 0.55, -0.17, 0.07, 0.05, 0.02, SUIT.gold);
  });
  // arms: upper and fore on their joints, a hand
  const arms = [-1, 1].map(s => {
    const up = grp(chest, s * 0.32, 0.58, 0), fore = grp(up, 0, -0.3, 0);
    two(up, b => b.at(0, -0.14, 0, 0.13, 0.32, 0.16, L.topC), b => b.at(0, -0.14, 0, 0.16, 0.32, 0.19, SUIT.white));
    two(fore, b => { b.at(0, -0.12, 0, 0.13, 0.26, 0.16, L.topC); b.at(0, -0.29, 0, 0.12, 0.1, 0.13, L.skin); },
      b => { b.at(0, -0.11, 0, 0.15, 0.24, 0.18, SUIT.white); b.at(0, -0.23, 0, 0.16, 0.04, 0.19, SUIT.grey); b.at(0, -0.3, 0, 0.14, 0.11, 0.15, SUIT.grey); });
    return [up, fore];
  });
  // the head: hair (or none), the face with two eyes, and whatever hat
  part(head, b => {
    b.at(0, 0.22, 0, 0.34, 0.34, 0.34, hairC);
    b.at(0, 0.18, -0.16, 0.28, 0.24, 0.03, L.skin);
    b.at(-0.07, 0.22, -0.178, 0.045, 0.05, 0.01, '#16161b'); b.at(0.07, 0.22, -0.178, 0.045, 0.05, 0.01, '#16161b');
    b.at(0, 0.1, -0.178, 0.08, 0.02, 0.01, dk(L.skin, 0.7));
    if (L.hs === 1) b.at(0, 0.06, 0.12, 0.34, 0.36, 0.12, L.hair);
    if (L.hs === 2 && L.hat !== 4 && L.hat !== 3) b.at(0, 0.44, 0.06, 0.13, 0.1, 0.13, L.hair);
    if (L.specs) b.at(0, 0.22, -0.185, 0.3, 0.05, 0.02, L.specC);
  });
  const hat = part(head, b => {
    const hc = L.hatC, y = y0 => y0 - 1.44;
    if (L.hat === 1) { b.at(0, y(1.86), 0, 0.36, 0.1, 0.36, hc); b.at(0, y(1.82), -0.24, 0.3, 0.03, 0.16, dk(hc, 0.8)); }
    if (L.hat === 2) { b.at(0, y(1.88), 0, 0.37, 0.16, 0.37, hc); b.at(0, y(1.8), 0, 0.38, 0.05, 0.38, dk(hc, 0.82)); }
    if (L.hat === 3) { b.at(0, y(1.83), 0, 0.56, 0.03, 0.56, hc); b.at(0, y(1.92), 0, 0.32, 0.16, 0.32, hc); b.at(0, y(1.86), 0, 0.33, 0.035, 0.33, dk(hc, 0.6)); }
    if (L.hat === 4) { b.at(0, y(1.83), 0, 0.46, 0.03, 0.46, hc); b.at(0, y(2.0), 0, 0.28, 0.34, 0.28, hc); b.at(0, y(1.88), 0, 0.29, 0.05, 0.29, '#882233'); }
    if (L.hat === 5) { b.at(0, y(1.83), 0, 0.5, 0.04, 0.5, dk(hc, 0.9)); b.at(0, y(1.9), 0, 0.34, 0.12, 0.34, hc); }
  });
  if (hat) cloth.push(hat);
  // in space: a glass box over the head, a gold ring where it locks on (and the hat comes off)
  const helm = new THREE.Group(); helm.visible = false; head.add(helm);
  part(helm, b => { b.at(0, 0.02, 0, 0.34, 0.05, 0.34, SUIT.gold); b.at(0.17, 0.3, -0.12, 0.03, 0.03, 0.03, '#8fe6ff'); });
  { const g = new Boxes(); g.at(0, 0.24, 0, 0.5, 0.48, 0.5, '#ffffff'); const m = g.mesh(M.glass, false); m.renderOrder = 3; helm.add(m); }
  // his wings, when he has them out: on his shoulders as the Icarus man's are (index.html copies their every joint), in boxes of flame
  const wingsG = grp(hips, 0, 0.54, 0.06); wingsG.visible = false;
  const wings = [-1, 1].map(side => boxWing(wingsG, side));
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: root, hips, chest, head, armL: arms[0][0], foreL: arms[0][1], armR: arms[1][0], foreR: arms[1][1], legL: legs[0][0], shinL: legs[0][1], legR: legs[1][0], shinR: legs[1][1], wingsG, wings, helm, hat, cloth, suit,
    dress(on) { for (const m of cloth) m.visible = !on; for (const m of suit) m.visible = on; helm.visible = on; } };
}

const PHX = { a: [2.3, 0.95, 0.32], b: [2.4, 1.85, 0.5], c: [2.1, 0.34, 0.16], w: [2.6, 2.4, 1.9] };   // (brighter than white: it is fire, and the palette snaps it to flame)
// one wing, jointed as Icarus's (makeWing: shoulder, elbow, wrist), in boxes of flame: the bird's, and the man's when he has his out
export function boxWing(parent, side, x = 0, y = 0, z = 0) {
  const M = mats(), r = grp(parent, x, y, z); r.scale.x = side < 0 ? 1 : -1;
  const shoulder = grp(r), elbow = grp(shoulder, -3.0, 0, 0.3), wrist = grp(elbow, -3.5, 0, -0.5);
  shoulder.rotation.order = 'ZYX';
  part(shoulder, b => { b.box(0, -3.1, -0.12, 0.12, -0.3, 1.6, PHX.a); b.box(-0.4, -3.0, -0.1, 0.1, 1.6, 2.3, PHX.c); }, M.glow);
  part(elbow, b => { b.box(0, -3.6, -0.1, 0.1, -0.35, 2.2, PHX.a, null, 1.05); b.box(-0.3, -3.4, -0.08, 0.08, 2.2, 3.0, PHX.b); }, M.glow);
  part(wrist, b => { for (let k = 0; k < 5; k++) { const x0 = -k * 0.9, len = 3.6 - k * 0.35; b.box(x0, x0 - 0.85, -0.07, 0.07, -0.2 + k * 0.12, len, k > 2 ? PHX.w : PHX.b); } b.box(-3.5, -4.6, -0.06, 0.06, 0.4, 2.2, PHX.c); }, M.glow);
  return { root: r, shoulder, elbow, wrist };
}
// ---- the phoenix: BRN's box bird (zoo.js: orange, gold, red; a fan of a tail and a comb), jointed as Icarus's bird is ----
// In the Icarus bird's own units: beak toward -z at about z -2.9, the tail from z 1.2 back; wings from (0, 0.22, -0.55),
// shoulder → elbow (-3, 0, 0.3) → wrist (-3.5, 0, -0.5) → tip; the right wing is the left one mirrored (scale.x -1).
export function boxPhoenix({ mini = false } = {}) {
  const M = mats(), root = new THREE.Group(); root.rotation.order = 'YXZ';
  part(root, b => {
    b.box(-0.55, 0.55, -0.45, 0.4, -1.5, 1.25, PHX.a, null, 1);
    b.box(-0.45, 0.45, -0.6, -0.3, -1.4, 0.4, PHX.b, null, 1);           // the breast, gold
    b.box(-0.3, 0.3, 0.4, 0.55, -1.2, 1.0, PHX.c, null, 1);              // a red ridge down the back
    b.box(-0.25, 0.25, -0.1, 0.35, -1.95, -1.4, PHX.a, null, 1);         // the neck
    for (const s of [-1, 1]) { b.box(s * 0.18, s * 0.32, -0.75, -0.45, 0.4, 0.75, PHX.b, null, 0.9); b.box(s * 0.12, s * 0.36, -0.82, -0.74, 0.7, 1.15, PHX.c); }   // the legs tucked up, the claws
  }, M.glow);
  const head = grp(root, 0, 0.4, -1.72); head.rotation.order = 'YXZ';
  part(head, b => {
    b.box(-0.3, 0.3, 0.32, 0.9, -1.0, -0.42, PHX.b);
    b.box(-0.12, 0.12, 0.42, 0.6, -1.5, -1.0, PHX.w); b.box(-0.08, 0.08, 0.3, 0.42, -1.3, -1.0, PHX.b, null, 0.8);   // the beak, hooked
    b.box(-0.05, 0.05, 0.9, 1.25, -0.95, -0.55, PHX.c); b.box(-0.05, 0.05, 0.95, 1.12, -0.55, -0.25, PHX.c, null, 0.9);   // the comb
    for (const s of [-1, 1]) { b.box(s * 0.3, s * 0.31, 0.66, 0.8, -0.95, -0.8, [3, 3, 3]); b.box(s * 0.305, s * 0.315, 0.68, 0.76, -0.93, -0.86, [0.02, 0.02, 0.03]); }
  }, M.glow);
  const wings = [-1, 1].map(side => boxWing(root, side, 0, 0.22, -0.55));
  // the fan of a tail: five plumes, each a chain of two
  const tail = grp(root, 0, 0.05, 1.15), plumes = [];
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.22, p = grp(tail); p.rotation.y = -a; p.rotation.x = 0.12;
    part(p, b => { b.box(-0.22, 0.22, -0.08, 0.08, 0, 2.6, i === 2 ? PHX.b : PHX.a); }, M.glow);
    const q = grp(p, 0, 0, 2.6); q.rotation.x = 0.15;
    part(q, b => { b.box(-0.28, 0.28, -0.07, 0.07, 0, 2.0 + (2 - Math.abs(i - 2)) * 0.8, i % 2 ? PHX.c : PHX.b); b.box(-0.36, 0.36, -0.06, 0.06, 2.0 + (2 - Math.abs(i - 2)) * 0.8, 2.6 + (2 - Math.abs(i - 2)) * 0.8, PHX.w); }, M.glow);
    plumes.push([p, q]);
  }
  // in space: a glass bubble over the head and beak, a gold ring at the throat
  const helm = new THREE.Group(); helm.visible = false; head.add(helm);
  { const g = new Boxes(); g.box(-0.75, 0.75, -0.15, 1.45, -1.75, 0.0, '#ffffff'); const m = g.mesh(M.glass, false); m.renderOrder = 3; helm.add(m); }
  part(helm, b => b.box(-0.5, 0.5, -0.05, 0.1, -0.1, 0.1, '#d9a441'));
  root.traverse(o => { if (o.isMesh) o.castShadow = !mini; });
  return { group: root, head, wings, tail, plumes, helm, mini };
}
// a beat of its wings, by a phase (for the mini phoenix and the birds out in the shared sky: anyone else's pose is not known)
export function flap(B, ph, k = 1) {
  const s = Math.sin(ph), c = Math.cos(ph);
  for (const w of B.wings) { w.shoulder.rotation.z = -(0.15 + s * 0.65 * k); w.elbow.rotation.z = -(0.1 + Math.max(0, -s) * 0.4 * k); w.wrist.rotation.z = -(0.05 + Math.max(0, c) * 0.25 * k); }
  B.plumes.forEach(([p, q], i) => { q.rotation.x = 0.15 + Math.sin(ph * 0.5 + i) * 0.12; });
}

// ---- the pets: MURPH, ODIE, BATMAN and CALI (cats.js: their colours; a short body, a big head, stepped ears) ----
const CATS = {
  murph: { fur: '#e8862e', furD: '#c86a1e', stripe: '#a8501a', white: '#f4ede2', head: '#e8862e', ear: '#e8862e', earIn: '#f0a8a0', tail: '#e08028', ring: '#a8501a', eye: '#d8a838', nose: '#e89a98', stripes: 1 },
  odie: { fur: '#f4f1ea', furD: '#dcd8d0', white: '#f8f6f0', head: '#b87a4a', ear: '#b87a4a', earIn: '#f0b0a8', tail: '#b07040', ring: '#7a4a28', eye: '#a8b850', nose: '#f0a8a8' },
  batman: { fur: '#18181c', furD: '#0e0e12', white: '#f2efe8', head: '#18181c', ear: '#18181c', earIn: '#5a3a40', tail: '#18181c', ring: '#141418', eye: '#e0a830', nose: '#e8a0a4', tux: 1 },
  cali: { dog: 1, fur: '#d9a868', furD: '#bb8c52', white: '#f2e2c4', head: '#d9a868', ear: '#c08a4c', earIn: '#b07a62', tail: '#d4a262', ring: '#c69458', eye: '#8a5426', nose: '#5a3a32', muzzle: '#e6c48e', collar: '#c8202a' },
};
export const PET_NAMES = { murph: 'MURPH', odie: 'ODIE', batman: 'BATMAN', cali: 'CALI' };
export function boxPet(kind) {
  const C = CATS[kind] || CATS.murph, dog = !!C.dog, root = new THREE.Group(), body = grp(root, 0, dog ? 0.2 : 0.19, 0), M = mats();
  const L = dog ? 0.21 : 0.17, W = dog ? 0.07 : 0.075;
  part(body, b => {
    b.box(-W, W, -0.07, 0.07, -L, L + 0.04, C.fur, C.furD);
    b.box(-W * 0.85, W * 0.85, 0.07, 0.085, -L * 0.85, L * 0.9, C.fur, C.furD);
    b.box(-W * 0.8, W * 0.8, -0.075, -0.06, -L * 0.7, L * 0.6, C.white, C.white);                 // the belly, the chest
    if (C.stripes) for (let i = 0; i < 4; i++) { const z = -L * 0.5 + i * L * 0.36; b.box(-W - 0.003, W + 0.003, -0.02, 0.088, z - 0.02, z + 0.02, C.stripe, C.stripe); }
    if (C.tux) b.box(-W * 0.7, W * 0.7, -0.06, 0.04, -L - 0.004, -L + 0.03, C.white, C.white);      // the white bib
    if (C.collar) b.box(-W - 0.005, W + 0.005, -0.02, 0.07, -L - 0.01, -L + 0.03, C.collar, C.collar);
  });
  const head = grp(body, 0, 0.1, -L - 0.02);
  part(head, b => {
    const hs = dog ? 0.13 : 0.15;
    b.box(-hs / 2, hs / 2, -hs * 0.45, hs * 0.55, -hs * 0.8, 0.02, C.head, dk(C.head, 0.85));
    if (dog) { b.box(-0.04, 0.04, -0.055, 0.02, -0.2, -hs * 0.8, C.muzzle, C.muzzle); b.box(-0.016, 0.016, 0, 0.02, -0.205, -0.19, C.nose, C.nose); }
    else { b.box(-0.035, 0.035, -0.06, -0.01, -hs * 0.83, -hs * 0.78, C.white, C.white); b.box(-0.01, 0.01, -0.03, -0.01, -hs * 0.84, -hs * 0.82, C.nose, C.nose); }
    for (const s of [-1, 1]) {
      b.box(s * 0.025, s * 0.05, 0.015, 0.035, -hs * 0.81, -hs * 0.8, C.eye, C.eye);
      if (dog) b.box(s * 0.065, s * 0.085, -0.06, 0.06, -0.09, -0.02, C.ear, C.ear);
      else { b.box(s * 0.025, s * 0.07, hs * 0.55, hs * 0.55 + 0.035, -0.07, -0.03, C.ear, C.ear); b.box(s * 0.035, s * 0.06, hs * 0.55 + 0.035, hs * 0.55 + 0.06, -0.065, -0.04, C.ear, C.ear); b.box(s * 0.035, s * 0.06, hs * 0.55, hs * 0.55 + 0.03, -0.072, -0.07, C.earIn, C.earIn); }
    }
  });
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([s, f]) => {
    const g = grp(body, s * W * 0.6, -0.05, f * L * 0.72);
    part(g, b => { b.box(-0.022, 0.022, -0.14, 0, -0.024, 0.024, C.fur, C.furD); b.box(-0.025, 0.025, -0.15, -0.12, -0.03, 0.026, C.white, C.white); });
    return g;
  });
  const tail = []; { let on = grp(body, 0, 0.06, L + 0.03); for (let i = 0; i < 3; i++) { const t = grp(on, 0, 0, i ? 0.09 : 0); t.rotation.x = -0.5; part(t, b => b.box(-0.018, 0.018, -0.018, 0.018, 0, 0.09, i === 2 ? C.ring : C.tail, null)); tail.push(t); on = t; } }
  // in space: a little white suit over the body and a glass bubble round the head
  const suit = new THREE.Group(); suit.visible = false; body.add(suit);
  part(suit, b => { b.box(-W - 0.012, W + 0.012, -0.082, 0.1, -L + 0.02, L, '#e9ecef'); b.box(-W * 0.6, W * 0.6, 0.1, 0.14, -L * 0.3, L * 0.3, '#c4cad1'); b.box(-0.06, 0.06, -0.02, 0.1, -L - 0.005, -L + 0.02, '#d9a441'); });
  { const g = new Boxes(); g.box(-0.13, 0.13, -0.1, 0.18, -0.26, 0.06, '#ffffff'); const m = g.mesh(M.glass, false); m.renderOrder = 3; head.add(m); m.visible = false; suit.userData.glass = m; }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: root, body, head, legs, tail, suit, dog, kind, dress(on) { suit.visible = on; suit.userData.glass.visible = on; } };
}

// ---- the ships of COSMIC (space.js LOOKS: box by box, nose to -z) ----
const SHIPS = {
  arrow: B => { const H = '#c8ccd8', H2 = '#8a90a2', DK = '#3a3e4c';
    B.box(-1.4, 1.4, -0.9, 0.9, -4, 5, H, H2); B.box(-0.9, 0.9, -0.6, 0.6, -6.6, -4, H, H2); B.box(-0.8, 0.8, 0.9, 1.5, -3.8, -1.6, '#5ad8ff', '#3a8ab0');
    B.box(-5.2, 5.2, -0.4, 0.1, -0.2, 2.6, H2, DK); B.box(-0.3, 0.3, 0.9, 2.6, 2.2, 4.4, H2, DK); B.box(-2.6, -1.4, -0.7, 0.5, 1.6, 4.6, DK); B.box(1.4, 2.6, -0.7, 0.5, 1.6, 4.6, DK); return [[-2, 0, 4.8], [2, 0, 4.8], '#7affff']; },
  manta: B => { const V = '#6a4ab0', V2 = '#4a2e86', P = '#ff7ad8';
    B.box(-2, 2, -0.5, 0.6, -5, 4, V, V2); B.box(-8, 8, -0.25, 0.15, -1, 3.4, V2, '#341f62'); B.box(-8.6, -7.6, -0.7, 1.3, 0.6, 3.8, P, '#c04aa8'); B.box(7.6, 8.6, -0.7, 1.3, 0.6, 3.8, P, '#c04aa8');
    B.box(-0.8, 0.8, 0.6, 1.3, -3, -0.8, '#ffb4ea', '#e07ac8'); B.box(-3.4, -2.2, -0.4, 0.4, -4, -2.4, P); B.box(2.2, 3.4, -0.4, 0.4, -4, -2.4, P); return [[-1.2, 0, 4.3], [1.2, 0, 4.3], '#ff7ad8']; },
  pod: B => { const O = '#ff8a2a', O2 = '#c4621a', G = '#5a5a64';
    B.box(-2, 2, -1.8, 1.8, -3, 3, O, O2); B.box(-1.5, 1.5, -2.2, 2.2, -2.4, 2.4, O, O2); B.box(-1.4, 1.4, -0.6, 1.2, -3.5, -3, '#ffe08a', '#d8b050');
    B.box(-3.8, -2, -1, 1, -1.4, 4, G, '#3a3a42'); B.box(2, 3.8, -1, 1, -1.4, 4, G, '#3a3a42'); B.box(-0.2, 0.2, 1.8, 3.2, 0, 0.6, '#d8d8e0'); return [[-2.9, 0, 4.3], [2.9, 0, 4.3], '#ffb040']; },
  needle: B => { const R = '#d43a2e', R2 = '#9a2418';
    B.box(-0.7, 0.7, -0.7, 0.7, -9, 5, R, R2); B.box(-0.35, 0.35, -0.35, 0.35, -11, -9, '#f2f2ee'); B.box(-0.5, 0.5, 0.7, 1.1, -6, -3.5, '#5ad8ff', '#3a8ab0');
    B.box(-3.6, 3.6, -0.15, 0.15, 1, 4, R2, '#6a180e'); B.box(-0.15, 0.15, 0.7, 2.4, 2.5, 5, R, R2); B.box(-0.15, 0.15, -2.4, -0.7, 2.5, 5, R, R2); return [[0, 0, 5.4], '#ffd27a']; },
};
export const SHIP_KINDS = Object.keys(SHIPS);
export function boxShip(kind) {
  const B = new Boxes(), out = (SHIPS[kind] || SHIPS.arrow)(B), glowC = out.pop(), root = new THREE.Group(), M = mats();
  root.add(B.mesh(M.lit, false));
  const F = new Boxes(); for (const [x, y, z] of out) F.box(x - 0.35, x + 0.35, y - 0.3, y + 0.3, z, z + 1.6, colOf(glowC, 2.2).clone()); root.add(F.mesh(M.glow, false));
  return { group: root };
}

// ---- the stadium of COSMIC, for Icarus's space (cosmic.js: a floating rock, a bowl of tiers round the biggest screen there is,
//      the pads behind the top row, the projector's booth over the plaza). This one is Icarus's, so it is drawn in letters.
// In its own frame: the screen across the front (its face toward +x), the bowl climbing away from it along +x, y up. Metres
// of COSMIC times S (it has to be seen from across space): R is about how far it reaches from its middle.
export function stadium(S = 7) {
  const M = mats(), root = new THREE.Group(), rock = new Boxes(), glow = new Boxes(), r = (() => { let s = 2026; return () => (s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0, (s >>> 0) / 4294967296); })();
  const ROCK = '#a496c4', ROCK_S = '#7e72a0', ROCK_D = '#564c74', TREAD = ['#958ab4', '#8a7eaa'], RISER = '#625880',   // (COSMIC's own, lifted: out here in the dark they would be nothing but black letters)
    CRYST = [[0.6, 2.6, 3.0], [2.0, 0.9, 3.0], [0.9, 3.0, 2.1], [3.0, 1.0, 2.3]];
  const s = S, FX = -40 * s;   // (the rows are arcs round a point behind the screen)
  // the rock: voxel columns, the widest at the top, falling away to a point below
  for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) {
    const x = (i * 16 + 40) * s, z = j * 16 * s, d = Math.hypot(i / 9, j / 9); if (d > 1.05) continue;
    const top = (2 + r() * 3) * s, bot = -(10 + (1 - d) * 62 + r() * 14) * s;
    rock.box(x - 8 * s, x + 8 * s, bot, top, z - 8 * s, z + 8 * s, d > 0.85 ? ROCK_S : ROCK, ROCK_D);
    if (r() < 0.14) { const cy = bot * (0.3 + r() * 0.5), c = CRYST[(r() * 4) | 0], k = (2 + r() * 3) * s; glow.box(x - k, x + k, cy - k * 2, cy + k * 2, z + (r() < 0.5 ? -8 : 8) * s - k * 0.6, z + (r() < 0.5 ? -8 : 8) * s + k * 0.6, c); }
  }
  // the bowl: three tiers of rows round the screen, each steeper; a cross-aisle between them
  let rr = 78 * s, y = 4 * s, tier = 0;
  for (const [n, rise] of [[18, 0.55], [18, 0.62], [18, 0.72]]) {
    for (let k = 0; k < n; k++) {
      y += rise * s * 2.2; const seg = 28, span = 0.84;
      for (let q = 0; q < seg; q++) {
        const a0 = -span + (q / seg) * span * 2, a1 = a0 + span * 2 / seg, am = (a0 + a1) / 2;
        const x0 = FX + Math.cos(am) * rr, z0 = Math.sin(am) * rr, w = rr * (a1 - a0) * 0.52, wing = Math.abs(am) > 0.17;
        rock.box(x0 - 1.1 * s, x0 + 1.1 * s, 4 * s, y, z0 - w, z0 + w, TREAD[k & 1], RISER);
        if (wing && r() < 0.6) { const c = new THREE.Color().setHSL(r(), 0.5, 0.45); rock.box(x0 - 0.4 * s, x0 + 0.4 * s, y, y + 1.4 * s, z0 - w * 0.7, z0 + w * 0.7, c); }   // (the wings, full to the rafters)
      }
      rr += 2.2 * s;
    }
    rr += 5 * s; tier++;
  }
  const ytop = y, rend = rr;
  // the plaza behind the top row, and its two pads, lit
  rock.box(FX + rend - 4 * s, FX + rend + 30 * s, ytop - 2 * s, ytop, -60 * s, 60 * s, ROCK, ROCK_D);
  const pads = [];
  for (const a of [-0.42, 0.42]) { const px = FX + (rend + 13 * s) * Math.cos(a) + 6 * s, pz = (rend + 13 * s) * Math.sin(a);
    rock.box(px - 9 * s, px + 9 * s, ytop, ytop + 0.6 * s, pz - 9 * s, pz + 9 * s, '#45434d', '#302f37');
    for (let q = 0; q < 8; q++) { const t = q / 8 * Math.PI * 2; glow.box(px + Math.cos(t) * 8 * s - 0.6 * s, px + Math.cos(t) * 8 * s + 0.6 * s, ytop + 0.6 * s, ytop + 1.4 * s, pz + Math.sin(t) * 8 * s - 0.6 * s, pz + Math.sin(t) * 8 * s + 0.6 * s, [3.2, 1.6, 0.5]); }
    glow.box(px - 4 * s, px + 4 * s, ytop + 0.6 * s, ytop + 0.8 * s, pz - 0.5 * s, pz + 0.5 * s, [3.0, 2.6, 1.2]); glow.box(px - 0.5 * s, px + 0.5 * s, ytop + 0.6 * s, ytop + 0.8 * s, pz - 4 * s, pz + 4 * s, [3.0, 2.6, 1.2]);
    pads.push(new THREE.Vector3(px, ytop + 4 * s, pz)); }
  // the projector's booth, floating over the plaza, and its beam toward the screen
  rock.box(FX + rend + 2 * s, FX + rend + 14 * s, ytop + 14 * s, ytop + 22 * s, -6 * s, 6 * s, '#45434d', '#302f37');
  glow.box(FX + rend + 1.4 * s, FX + rend + 2 * s, ytop + 16 * s, ytop + 20 * s, -2 * s, 2 * s, [3, 3, 2.6]);
  // the frame of the screen
  const SW = 178 * s, SH = 80 * s, SY0 = -4 * s + 6 * s;
  rock.box(-6 * s, 0, SY0 - 6 * s, SY0 + SH + 6 * s, -SW / 2 - 6 * s, SW / 2 + 6 * s, '#16161b', '#0c0c10');
  root.add(rock.mesh(M.world, false), glow.mesh(M.worldGlow, false));
  // the screen itself: a picture of its own, the film that is always on in COSMIC (or, with the way shut, nothing but the words)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 116;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(3, 3, 3) }));
  scr.position.set(0.5 * s, SY0 + SH / 2, 0); scr.rotation.y = Math.PI / 2; root.add(scr);
  const pts = []; for (let i = 0; i < 60; i++) pts.push([r(), r(), r() * 3 + 1, r()]);
  function paint(t, open) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    if (!open) { c.fillStyle = '#060608'; c.fillRect(0, 0, W, H); c.fillStyle = '#5a5a64'; c.font = 'bold 15px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('THE WAY IS CLOSED', W / 2, H / 2); tex.needsUpdate = true; return; }
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, `hsl(${(t * 12) % 360},70%,22%)`); g.addColorStop(1, `hsl(${(t * 12 + 140) % 360},80%,30%)`); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (const [x, y, z, h] of pts) { const X = ((x * W + t * 9 * z) % W), Y = y * H; c.fillStyle = `hsl(${h * 360},90%,70%)`; c.fillRect(X | 0, Y | 0, z | 0, z | 0); }
    c.fillStyle = '#f8d878'; c.font = 'bold 17px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BURNING STUDIO MUSIC', W / 2, H * 0.42);
    c.fillStyle = '#ffffff'; c.font = '10px ui-monospace, Menlo, monospace'; c.fillText(Math.floor(t * 1.5) % 2 ? 'FLY IN · CROSS OVER' : 'COSMIC · NOW SHOWING', W / 2, H * 0.66);
    tex.needsUpdate = true;
  }
  paint(0, true);
  // where it is, roughly: its middle (over the bowl), and how far it reaches
  const mid = new THREE.Vector3(FX + rend * 0.55, ytop * 0.5, 0), R = Math.max(rend - FX * 0.2, SW * 0.6);
  return { group: root, screen: scr, paint, pads, mid, R, top: ytop, scrW: SW, scrH: SH };
}

// ---- COSMIC as it really is, for Icarus's space: BRN's own stadium, baked from its page (crossover/bake/cosmic-bake.js) into
//      cosmic.bin + cosmic.json. In COSMIC's own coords (three.js, y up, BRN metres) round its middle, the stadium end of the
//      shared sky; the page puts it there (scale and turn from the shared sky), so BRN's ships fly over the right seats.
//      The stadium, the rock, the glow of its lights and the crowd in every seat, the screen with a picture of its own; round it,
//      the rooms of the building floating on their ring; further out, BRN's sun and its planets, where they are today.
//      Icarus's to draw: in letters, like the rest of its world (no visitor alpha).
export async function cosmicLoad(base = '/crossover/') {
  const bin = async () => {   // (zipped: a sixth of the size; unzipped here where the browser can, the whole file where it can't)
    if (typeof DecompressionStream === 'function') { try { const r = await fetch(base + 'cosmic.bin.gz'); if (r.ok && r.body) return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); } catch (e) {} }
    return fetch(base + 'cosmic.bin').then(r => r.arrayBuffer());
  };
  const [meta, buf] = await Promise.all([fetch(base + 'cosmic.json').then(r => r.json()), bin()]);
  if (buf.byteLength !== meta.bytes) throw new Error('cosmic.bin: ' + buf.byteLength + ' bytes, not ' + meta.bytes);
  return cosmicBuild(meta, buf);
}
export function cosmicBuild(meta, buf) {
  const M = mats(), root = new THREE.Group(), [lo, hi] = meta.box, Sx = meta.sections;
  const un = (q, a) => lo[a] + ((q + 32768) / 65535) * (hi[a] - lo[a]);
  const LIFT = 1.85;   // (COSMIC's own colours, lifted: out in Icarus's dark they would be nothing but black letters)
  function part(sec, mat, lift = 1) {
    if (!sec) return null;
    const P = new Int16Array(buf, sec.pos, sec.n * 3), N = new Int8Array(buf, sec.nor, sec.n * 3), C = new Uint8Array(buf, sec.col, sec.n * 3);
    const p = new Float32Array(sec.n * 3), n = new Float32Array(sec.n * 3), c = new Float32Array(sec.n * 3);
    for (let i = 0; i < sec.n * 3; i++) { const a = i % 3; p[i] = un(P[i], a); n[i] = N[i] / 127; c[i] = Math.min(1, (C[i] / 255) * lift); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; root.add(m); return m;
  }
  const solid = part(Sx.solid, M.world, LIFT), glow = part(Sx.glow, M.worldGlow, 1.2);
  // the crowd: a dot of colour in each seat that has someone in it
  let crowd = null;
  if (Sx.seats) {
    const s = Sx.seats, P = new Int16Array(buf, s.pos, s.n * 3), C = new Uint8Array(buf, s.col, s.n * 3), p = new Float32Array(s.n * 3), c = new Float32Array(s.n * 3);
    for (let i = 0; i < s.n * 3; i++) { p[i] = un(P[i], i % 3); c[i] = Math.min(1, (C[i] / 255) * LIFT + 0.08); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    crowd = new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: 0.9, sizeAttenuation: true })); crowd.frustumCulled = false; root.add(crowd);
  }
  // the screen: the baked quad, fitted with a picture of its own (the film's always on in COSMIC; shut, only the words)
  let scr = null, paint = () => {};
  if (Sx.screen && Sx.screen.n >= 6) {
    const s = Sx.screen, P = new Int16Array(buf, s.pos, s.n * 3), v = []; for (let i = 0; i < s.n; i++) v.push(new THREE.Vector3(un(P[i * 3], 0), un(P[i * 3 + 1], 1), un(P[i * 3 + 2], 2)));
    const lo3 = v.reduce((a, b) => a.clone().min(b)), hi3 = v.reduce((a, b) => a.clone().max(b)), mid = lo3.clone().add(hi3).multiplyScalar(0.5), sz = hi3.clone().sub(lo3);
    const H = sz.y, W = Math.hypot(sz.x, sz.z), along = Math.atan2(sz.z, sz.x);   // (it stands upright: its width runs along x/z)
    const e1 = v[1].clone().sub(v[0]), e2 = v[2].clone().sub(v[0]), nrm = e1.cross(e2).normalize();
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 116;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    scr = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.6, 2.6, 2.6), side: THREE.DoubleSide }));
    scr.position.copy(mid).addScaledVector(nrm, 0.3); scr.lookAt(mid.clone().add(nrm)); root.add(scr);
    let r = 7; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647), pts = []; for (let i = 0; i < 60; i++) pts.push([rnd(), rnd(), rnd() * 3 + 1, rnd()]);
    paint = (t, open) => {
      const c = cv.getContext('2d'), w = cv.width, h = cv.height;
      if (!open) { c.fillStyle = '#060608'; c.fillRect(0, 0, w, h); c.fillStyle = '#5a5a64'; c.font = 'bold 15px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('THE WAY IS CLOSED', w / 2, h / 2); tex.needsUpdate = true; return; }
      const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${(t * 12) % 360},70%,22%)`); gr.addColorStop(1, `hsl(${(t * 12 + 140) % 360},80%,30%)`); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (const [x, y, z, hh] of pts) { const X = (x * w + t * 9 * z) % w, Y = y * h; c.fillStyle = `hsl(${hh * 360},90%,70%)`; c.fillRect(X | 0, Y | 0, z | 0, z | 0); }
      c.fillStyle = '#f8d878'; c.font = 'bold 17px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BURNING STUDIO MUSIC', w / 2, h * 0.42);
      c.fillStyle = '#ffffff'; c.font = '10px ui-monospace, Menlo, monospace'; c.fillText(Math.floor(t * 1.5) % 2 ? 'FLY IN · CROSS OVER' : 'COSMIC · NOW SHOWING', w / 2, h * 0.66);
      tex.needsUpdate = true;
    };
    paint(0, true);
  }
  // COSMIC's own planet and moon, close by (what BRN's ships bump round)
  const ball = (r, col, glowK = 0) => { const g = new THREE.SphereGeometry(r, 28, 18), n = g.attributes.position.count, cc = new Float32Array(n * 3), base = new THREE.Color(col), L = new THREE.Vector3(-0.45, 0.5, -0.74).normalize(), q = new THREE.Vector3();
    for (let i = 0; i < n; i++) { q.fromBufferAttribute(g.attributes.normal, i); const l = Math.max(0, q.dot(L)), k = Math.min(1.3, 0.28 + glowK + Math.floor(l * 4) / 4 * 0.95), band = 0.9 + 0.1 * Math.sin(q.y * 9); cc[i * 3] = base.r * k * band; cc[i * 3 + 1] = base.g * k * band; cc[i * 3 + 2] = base.b * k * band; }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return new THREE.Mesh(g, M.worldGlow); };
  for (const b of [meta.planet, meta.moon]) if (b) { const m = ball(b.r, b.col); m.position.fromArray(b.at); root.add(m); }
  const R = Math.max(...hi.map((x, a) => Math.max(Math.abs(x), Math.abs(lo[a])))) * 0.62;
  return { group: root, screen: scr, paint, mid: new THREE.Vector3(), R, top: hi[1], meta, solid, glow, crowd, ball };
}
// the rooms on their ring, and BRN's sun and its planets (js/orbit.js: where they are is the same in both worlds, by the clock)
export const BRN_PLANETS = [
  ['MERCURY', 9, 520, '#8a8580', 0.24], ['VENUS', 16, 760, '#e8c890', 0.62], ['EARTH', 17, 1020, '#2a6ad0', 1], ['MARS', 12, 1300, '#c0502a', 1.88],
  ['JUPITER', 58, 1780, '#d8b890', 11.9], ['SATURN', 48, 2300, '#e0c890', 29.5, true], ['URANUS', 30, 2750, '#9ad8e0', 84], ['NEPTUNE', 29, 3150, '#3a64d8', 165],
];
export function cosmicSurrounds(meta, ball) {
  const M = mats();
  const rooms = (meta.worlds || []).map(w => {
    const g = new THREE.Group(), R = w.R, B = new Boxes();
    const rim = w.kind === 'lobby' ? '#ff6a1a' : w.kind === 'wing' ? '#9a7aff' : '#ff8a2a';
    // a plinth with its rim lit, and the room's glow over it: a little world
    const seg = 18; for (let i = 0; i < seg; i++) { const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2; B.quad([Math.cos(a0) * R, 0, Math.sin(a0) * R], [Math.cos(a1) * R, 0, Math.sin(a1) * R], [Math.cos(a1) * R * 0.86, -3, Math.sin(a1) * R * 0.86], [Math.cos(a0) * R * 0.86, -3, Math.sin(a0) * R * 0.86], [Math.cos(a0), 0.2, Math.sin(a0)], colOf('#3a3444').clone()); B.quad([0, 0.01, 0], [Math.cos(a1) * R, 0.01, Math.sin(a1) * R], [Math.cos(a0) * R, 0.01, Math.sin(a0) * R], [0, 0.01, 0], [0, 1, 0], colOf('#2a2632').clone()); }
    g.add(B.mesh(M.world));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.4, Math.max(0.8, R * 0.05), 4, 32), new THREE.MeshBasicMaterial({ color: rim })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6; g.add(ring);
    const dome = ball(R * 0.5, '#ffb46a', 0.35); dome.position.y = R * 0.32; g.add(dome);
    return { ...w, g, at: new THREE.Vector3(...w.at) };
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.5) }));
  const sunAt = new THREE.Vector3(...meta.sun), tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.08);
  const planets = BRN_PLANETS.map(([name, r, orb, col, yr, rings], i) => {
    const m = ball(r, col); const g = new THREE.Group(); g.add(m);
    if (rings) { const rg = new THREE.Mesh(new THREE.RingGeometry(r * 1.35, r * 2.25, 40), new THREE.MeshBasicMaterial({ color: '#d8c090', side: THREE.DoubleSide })); rg.rotation.x = Math.PI / 2 + 0.47; g.add(rg); }
    return { name, r, orb, yr, ph: i * 1.7 + 0.4, g, at: new THREE.Vector3() };
  });
  function place(now = Date.now()) {   // where each is today, round the middle (a year is ten minutes, as in COSMIC)
    const days = now / 600000;
    for (const p of planets) { const a = p.ph + (days / p.yr) * Math.PI * 2; p.at.set(Math.cos(a) * p.orb, 0, Math.sin(a) * p.orb).applyQuaternion(tilt).add(sunAt); p.g.children[0].rotation.y = days * 6; }
  }
  place();
  return { rooms, sun: { g: sun, at: sunAt, r: 150 }, planets, place };
}
