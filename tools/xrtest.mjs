// Plays made-up hand motions into xr.js and checks each move is read (not deployed). Use: node tools/xrtest.mjs
import { makeHands, fakeHand } from '../xr.js';
const head = { x: 0, y: 1.6, z: 0, yaw: 0 };
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fails++; };
// run a motion: f(t) → { L, R } for `secs`, collect events and the last frame
function run(f, secs, ctx = { form: 'phoenix' }, H = makeHands()) {
  const ev = [], dt = 1 / 90; let last;
  for (let t = 0; t < secs; t += dt) { const { L, R } = f(t); last = H.update(dt, head, L, R, ctx); ev.push(...last.events); }
  return { ev, last, H };
}
const at = (x, y, z) => [x, 1.6 + y, z];   // relative to the eyes
const wings = (yl = -0.25, yr = -0.25) => ({ L: fakeHand('L', at(-0.65, yl, -0.25), { toward: [-1, 0, 0] }), R: fakeHand('R', at(0.65, yr, -0.25), { toward: [1, 0, 0] }) });

let r = run(() => wings(), 0.5);
check('wings level', r.last.pose === 'wings' && Math.abs(r.last.axes[0]) < 0.05 && Math.abs(r.last.axes[1]) < 0.05, JSON.stringify(r.last.axes));
r = run(() => wings(-0.05, -0.45), 0.5);
check('wings: left high banks right', r.last.axes[0] > 0.5, JSON.stringify(r.last.axes));
r = run(() => wings(-0.45, -0.05), 0.5);
check('wings: right high banks left', r.last.axes[0] < -0.5, JSON.stringify(r.last.axes));
r = run(() => wings(0.1, 0.1), 0.5);
check('wings raised climbs', r.last.axes[1] < -0.5, JSON.stringify(r.last.axes));
r = run(() => wings(-0.6, -0.6), 0.5);
check('wings lowered dives', r.last.axes[1] > 0.5, JSON.stringify(r.last.axes));
// flap: hands from shoulder height down to the hips in 0.2 s, a few times
r = run(t => { const ph = (t % 0.6) / 0.6, y = ph < 0.33 ? -0.1 - (ph / 0.33) * 0.4 : -0.5 + ((ph - 0.33) / 0.67) * 0.4; return wings(y, y); }, 1.8);
check('flap', r.ev.filter(e => e === 'flap').length >= 2 && r.last.boost, `${r.ev.filter(e => e === 'flap').length} flaps`);
r = run(() => wings(), 1.0);
check('no flap when still', !r.ev.includes('flap') && !r.last.boost);
// stoop
r = run(() => ({ L: fakeHand('L', at(-0.08, -0.2, -0.45), { toward: [0, 0, -1] }), R: fakeHand('R', at(0.08, -0.2, -0.45), { toward: [0, 0, -1] }) }), 0.4);
check('stoop', r.last.pose === 'stoop' && r.last.axes[1] === 1 && r.last.boost, r.last.pose);
// clap: palms facing, closing fast
r = run(t => { const x = Math.max(0.035, 0.35 - t * 2.2); return { L: fakeHand('L', at(-x, -0.25, -0.35), { facing: 'in', toward: [0, 1, 0] }), R: fakeHand('R', at(x, -0.25, -0.35), { facing: 'in', toward: [0, 1, 0] }) }; }, 0.5);
check('clap', r.ev.filter(e => e === 'clap').length === 1, r.ev.join(','));
r = run(t => { const x = Math.max(0.035, 0.35 - t * 0.3); return { L: fakeHand('L', at(-x, -0.25, -0.35), { facing: 'in', toward: [0, 1, 0] }), R: fakeHand('R', at(x, -0.25, -0.35), { facing: 'in', toward: [0, 1, 0] }) }; }, 1.4);
check('slow hands together is not a clap', !r.ev.includes('clap'), r.ev.join(','));
// fold
r = run(() => ({ L: fakeHand('L', at(-0.2, -0.35, -0.3), { shape: 'fist' }), R: fakeHand('R', at(0.2, -0.35, -0.3), { shape: 'fist' }) }), 0.8);
check('fold (both fists held)', r.ev.filter(e => e === 'fold').length === 1, r.ev.join(','));
r = run(() => ({ L: fakeHand('L', at(-0.2, -0.35, -0.3), { shape: 'fist' }), R: fakeHand('R', at(0.2, -0.35, -0.3), { shape: 'fist' }) }), 0.3);
check('a quick fist is not a fold', !r.ev.includes('fold'));
// spread while falling as a man
r = run(() => wings(), 0.5, { form: 'human', grounded: false });
check('spread while falling', r.ev.filter(e => e === 'spread').length === 1, r.ev.join(','));
r = run(() => wings(), 0.5, { form: 'human', grounded: true });
check('no spread on the ground', !r.ev.includes('spread'));
// leap
r = run(t => { const y = -0.55 + Math.min(1, t / 0.25) * 0.6; return { L: fakeHand('L', at(-0.25, y, -0.2)), R: fakeHand('R', at(0.25, y, -0.2)) }; }, 0.5, { form: 'human', grounded: true });
check('leap (both hands thrown up)', r.ev.filter(e => e === 'leap').length === 1, r.ev.join(','));
// offer
r = run(() => ({ L: null, R: fakeHand('R', at(0.12, -0.3, -0.35), { facing: 'up' }) }), 0.9, { form: 'human', grounded: true });
check('offer (palm up, held)', r.ev.filter(e => e === 'offer').length === 1, r.ev.join(','));
r = run(() => ({ L: null, R: fakeHand('R', at(0.12, -0.3, -0.35), { facing: 'down' }) }), 0.9, { form: 'human', grounded: true });
check('palm down is not an offer', !r.ev.includes('offer'));
// push
r = run(t => { const z = -0.15 - Math.min(1, t / 0.25) * 0.35; return { L: fakeHand('L', at(-0.18, -0.15, z), { facing: 'ahead', toward: [0, 1, 0] }), R: fakeHand('R', at(0.18, -0.15, z), { facing: 'ahead', toward: [0, 1, 0] }) }; }, 0.5, { form: 'human', grounded: true });
check('push (palms shoved forward)', r.ev.filter(e => e === 'push').length === 1, r.ev.join(','));
// point
r = run(() => ({ L: null, R: fakeHand('R', at(0.2, -0.3, -0.35), { shape: 'point', toward: [0.7071, 0, -0.7071] }) }), 0.3, { form: 'human', grounded: true });
check('point ahead-right walks ahead-right', r.last.pose === 'point' && r.last.axes[0] > 0.6 && r.last.axes[1] > 0.6 && !r.last.run, JSON.stringify(r.last.axes));
r = run(() => ({ L: fakeHand('L', at(-0.2, -0.3, -0.35), { shape: 'point', toward: [0, -0.3, -0.95] }), R: fakeHand('R', at(0.2, -0.3, -0.35), { shape: 'point', toward: [0, -0.3, -0.95] }) }), 0.3, { form: 'human', grounded: true });
check('both pointing runs', r.last.pose === 'point' && r.last.run && r.last.axes[1] > 0.9, JSON.stringify(r.last.axes));
r = run(() => ({ L: null, R: fakeHand('R', at(0.2, -0.3, -0.35), { shape: 'point', toward: [0, 0, -1] }) }), 0.3, { form: 'phoenix' });
check('no walking in the air', r.last.pose !== 'point');
// the head turned: the frame turns with it
head.yaw = Math.PI / 2;   // looking down -x
r = run(() => ({ L: fakeHand('L', [-0.25 - 0.65 * 0, 1.35, 0.65], { toward: [0, 0, 1] }), R: fakeHand('R', [-0.25, 1.35, -0.65], { toward: [0, 0, -1] }) }), 0.5);
check('wings with the head turned 90°', r.last.pose === 'wings', r.last.pose);
head.yaw = 0;
// no hands: nothing
r = run(() => ({ L: null, R: null }), 0.3);
check('no hands, no moves', !r.ev.length && r.last.axes[0] === 0 && r.last.axes[1] === 0);
console.log(fails ? `${fails} failed` : 'all moves read');
process.exit(fails ? 1 : 0);
