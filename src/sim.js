// Cell simulation: CNC-04 process + arm program (dual or single gripper). The timeline is the dossier timing
// model (model.js); inverse kinematics only produces the poses inside each timed step.
import * as THREE from 'three';
import { Arm } from './kin.js';
import { L, PART, nest } from './layout.js';
import { evalTable } from './path.js';
import { buildTables, buildTablesSingle, hh, yV, yT, yS } from './program.js';
import { SEQ, moveTime, DOOR_S, V_REDUCED } from './model.js';
import { makePart, setKind, nearestSquare } from './parts.js';

const PI = Math.PI, HOME_SEED = [-0.222, -1.963, 2.217, -0.254, -0.222, -1.571];
export const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const clamp01 = t => Math.min(1, Math.max(0, t));
const slow = f => f < 0.4 ? 0.75 * (f / 0.4) : 0.75 + 0.25 * ((f - 0.4) / 0.6);   // slow over the last 20 mm
export const CUT_Y = L.vice.bed + PART.FC.h - 0.012;

// CNC-04 process shared by all scenarios. st: {phase,t,door,jaw,table,tableX,head,spin}
export function machineStep(st, dt, W) {
  st.t += dt;
  if (st.phase === 'machining') { st.spin += dt * 38; const a = st.t * 1.7; st.table = L.mach.tableCut + 0.018 * Math.sin(a * 0.9); st.tableX = 0.03 * Math.sin(a); st.head += (CUT_Y - st.head) * Math.min(1, dt * 4); }
  else if (st.phase === 'toLoad') { const u = ease(clamp01(st.t / 1.2)); st.head = THREE.MathUtils.lerp(CUT_Y, L.mach.toolPark, u); st.table = THREE.MathUtils.lerp(L.mach.tableCut, L.mach.tableLoad, u); st.tableX *= (1 - u); st.spin += dt * 38 * (1 - u); }
  else if (st.phase === 'opening') { st.door = ease(clamp01(st.t / DOOR_S)); }
  else if (st.phase === 'closing') { st.door = 1 - ease(clamp01(st.t / DOOR_S)); st.table = THREE.MathUtils.lerp(L.mach.tableLoad, L.mach.tableCut, ease(clamp01((st.t - 1.2) / 1.6))); }
}
export function machineApply(st, W) { W.setDoor(st.door); W.setJaw(st.jaw); W.setTable(st.table); W.table.position.x = st.tableX || 0; W.setHead(st.head); W.spin.rotation.y = st.spin; }
export const machineInit = () => ({ phase: 'machining', t: 0, door: 0, jaw: 0, table: L.mach.tableCut, tableX: 0, head: CUT_Y, spin: 0 });
export function trayBlank(i, rnd) { const b = makePart('blank', PART.FC), c = nest(i); b.userData = { ...b.userData, dx: rnd() * 0.005, dz: rnd() * 0.005, yaw: rnd() * 5 * PI / 180, nx: c.x, nz: c.z }; b.position.set(c.x + b.userData.dx, yT, c.z + b.userData.dz); b.rotation.y = b.userData.yaw; return b; }
export function runTweens(tweens, dt) { for (let k = tweens.length - 1; k >= 0; k--) { const tw = tweens[k]; tw.t += dt; const u = tw.fn(clamp01(tw.t / tw.dur)); if (tw.cb) tw.cb(u); else for (const key in tw.to) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * u; if (tw.t >= tw.dur) tweens.splice(k, 1); } }
export function settle(tweens, part, dur) { const from = part.quaternion.clone(), to = nearestSquare(part); tweens.push({ t: 0, dur, fn: ease, cb: u => part.quaternion.slerpQuaternions(from, to, u) }); }
export const seeded = s => () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;

export class Sim {
  constructor(scene, W, robot) {
    this.W = W; this.robot = robot; this.scene = scene; this.kind = 'dual';
    const root = new THREE.Matrix4().makeTranslation(L.base.x, L.base.y, L.base.z).multiply(new THREE.Matrix4().makeRotationX(-PI / 2));
    this.arm = new Arm(root);
    const D = buildTables(this.arm, HOME_SEED), Sg = buildTablesSingle(this.arm, HOME_SEED);
    this.tables = { dual: D.T, single: Sg.T }; this.N = D.N; this.ikWorst = Math.max(D.worst, Sg.worst); this.loopDrift = Math.max(D.drift, Sg.drift);
    this.q = new Float64Array(6); this.tweens = []; this.v = 0.5; this.tm = 6.5; this.events = []; this.allParts = [];
    this.reset();
  }
  get T() { return this.tables[this.kind]; }
  setScenario(k) { this.kind = k; this.robot.B.group.visible = k === 'dual'; this.reset(); }
  seg(k) { return () => { const d = this.T[k]; return Array.isArray(d) ? d[d.length === 12 ? this.nestI : this.slot] : d; }; }
  exSteps(extra) { const D = SEQ[this.kind]; return D.map((d, i) => ({ group: 'ex', name: d[1], type: d[0], dist: d[0] === 'mv' ? d[2] : 0, dur: d[0] === 'mv' ? null : d[2], ...(extra[i] || {}) })); }
  // ---------- programs ----------
  program() { return this.kind === 'dual' ? this.programDual() : this.programSingle(); }
  programDual() {
    const S = this, R = S.robot, mv = k => S.seg(k), st = (name, type, o) => ({ name, type, ...o });
    return [...S.exSteps({
      1: { seg: mv('ENTER') },
      2: { seg: mv('LIFT'), u: f => clamp01((f - 0.5) / 0.5), tick: f => { R.A.setOpen(1 - clamp01(f / 0.45)); if (f >= 0.5 && S.vicePart && !R.A.part) S.grab(R.A, S.vicePart, 'vice'); } },
      3: { seg: mv('TURN') },
      4: { seg: mv('PLACE'), u: slow, raw: true },
      5: { tick: f => { S.m.jaw = 1 - ease(clamp01(f / 0.6)); } },
      6: { tick: f => { R.B.setOpen(clamp01(f / 0.8)); if (f > 0.15 && R.B.part) S.vicePart = S.drop(R.B, S.W.table); } },
      7: { seg: mv('LEAVE') },
      8: { end: () => S.cycleStart() } }),
      st('vers bac', 'mv', { seg: mv('TOBIN'), start: () => { S.slot = S.binN % 6; } }),
      st('descente', 'mv', { seg: mv('BINDOWN') }),
      st('lâcher', 'fx', { dur: 0.5, tick: f => { R.A.setOpen(clamp01(f / 0.7)); if (f > 0.3 && R.A.part) S.toBin(R.A); } }),
      st('montée', 'mv', { seg: mv('BINUP') }),
      st('vers plateau', 'mv', { seg: mv('TOTRAY') }),
      st('descente', 'mv', { seg: mv('TRAYDOWN') }),
      st('prise brut', 'fx', { dur: 0.5, tick: f => S.squeeze(R.B, f), end: () => S.pickBlank(R.B) }),
      st('montée', 'mv', { seg: mv('TRAYUP') }),
      st('vers station', 'mv', { seg: mv('TOST') }),
      st('descente', 'mv', { seg: mv('STDOWN') }),
      st('lâcher', 'fx', { dur: 0.5, tick: f => { R.B.setOpen(clamp01(f / 0.6)); if (f > 0.3 && R.B.part) S.toStation(R.B); } }),
      st('centrage', 'fx', { dur: 0.4, seg: mv('STALIGN') }),
      st('prise brut', 'fx', { dur: 0.5, tick: f => R.B.setOpen(1 - clamp01(f / 0.9)), end: () => S.fromStation(R.B) }),
      st('montée', 'mv', { seg: mv('STUP') }),
      st('vers porte', 'mv', { seg: mv('TOHOME'), end: () => S.nextNest() }),
    ];
  }
  programSingle() {
    const S = this, R = S.robot, mv = k => S.seg(k), st = (name, type, o) => ({ name, type, ...o });
    return [...S.exSteps({
      1: { seg: mv('ENTER') },
      2: { seg: mv('LIFT'), u: f => clamp01((f - 0.5) / 0.5), tick: f => { R.A.setOpen(1 - clamp01(f / 0.45)); if (f >= 0.5 && S.vicePart && !R.A.part) S.grab(R.A, S.vicePart, 'vice'); } },
      3: { seg: mv('LEAVE1') },
      4: { seg: mv('TOBIN'), start: () => { S.slot = S.binN % 6; } },
      5: { tick: f => { R.A.setOpen(clamp01(f / 0.7)); if (f > 0.3 && R.A.part) S.toBin(R.A); } },
      6: { seg: mv('TOST') },
      7: { tick: f => R.A.setOpen(1 - clamp01(f / 0.9)), end: () => S.fromStation(R.A) },
      8: { seg: mv('TURN') },
      9: { seg: mv('TODOOR') },
      10: { seg: mv('ENTER2') },
      11: { seg: mv('PLACE'), u: slow, raw: true },
      12: { tick: f => { S.m.jaw = 1 - ease(clamp01(f / 0.6)); } },
      13: { tick: f => { R.A.setOpen(clamp01(f / 0.8)); if (f > 0.15 && R.A.part) S.vicePart = S.drop(R.A, S.W.table); } },
      14: { seg: mv('LEAVE2') },
      15: { end: () => S.cycleStart() } }),
      st('vers plateau', 'mv', { seg: mv('TOTRAY') }),
      st('prise brut', 'fx', { dur: 0.5, tick: f => S.squeeze(R.A, f), end: () => S.pickBlank(R.A) }),
      st('vers station', 'mv', { seg: mv('TRAY2ST') }),
      st('lâcher', 'fx', { dur: 0.5, tick: f => { R.A.setOpen(clamp01(f / 0.6)); if (f > 0.3 && R.A.part) S.toStation(R.A); } }),
      st('vers porte', 'mv', { seg: mv('STHOME'), end: () => S.nextNest() }),
    ];
  }
  stepDur(s, v) { if (s.type === 'mv') return moveTime(s.group === 'ex' ? s.dist : s.seg().len, v); return s.dur; }
  // ---------- state ----------
  clearParts() { for (const p of this.allParts) p.removeFromParent(); this.allParts.length = 0; this.tweens.length = 0; this.robot.A.part = this.robot.B.part = null; }
  reset() {
    const S = this, R = S.robot; S.clearParts(); S.blanks = []; S.binParts = [];
    const mk = k => { const p = makePart(k, PART.FC); S.allParts.push(p); return p; }, rnd = seeded(11);
    for (let i = 0; i < 12; i++) { const b = trayBlank(i, rnd); S.allParts.push(b); S.W.tray.add(b); S.blanks.push(b); }
    S.vicePart = mk('finished'); S.vicePart.position.set(L.vice.x, yV, L.vice.z); S.W.table.add(S.vicePart);
    R.A.setOpen(1); R.B.setOpen(1); S.stationPart = null;
    if (S.kind === 'dual') { const hb = mk('blank'); R.B.tip.add(hb); R.B.part = hb; R.B.setOpen(0); }
    else { const sb = mk('blank'); sb.position.set(L.station.x, yS, L.station.z); S.scene.add(sb); S.stationPart = sb; }
    S.nestI = 0; S.binN = 0; S.slot = 0;
    S.steps = S.program(); S.exN = S.steps.filter(s => s.group === 'ex').length; S.i = S.steps.length; S.f = 0; S.waiting = true;
    S.q.set(HOME_SEED); S.timer = { running: false, t: 0, last: null }; S.cycles = 0;
    // the loop starts when the door begins to open: spindle parked, table at the loading position
    S.m = { ...machineInit(), phase: 'opening', table: L.mach.tableLoad, head: L.mach.toolPark }; S.ct = 0; S.snap = S.snapshot();
    S.apply();
  }
  // ---------- scrubbing: the state at the start of the loop (door starts to open) is saved; any moment of the
  // loop is rebuilt by replaying from it ----------
  snapshot() { const S = this, R = S.robot; return { n: S.allParts.length, parts: S.allParts.map(p => ({ p, parent: p.parent, pos: p.position.clone(), q: p.quaternion.clone(), kind: p.userData.kind })), blanks: S.blanks.slice(), bin: S.binParts.slice(), vice: S.vicePart, st: S.stationPart, A: R.A.part, B: R.B.part, Ao: R.A.open, Bo: R.B.open, nestI: S.nestI, binN: S.binN, slot: S.slot, m: { ...S.m }, q: Float64Array.from(S.q), cycles: S.cycles, i: S.i, f: S.f, waiting: S.waiting, timer: { ...S.timer } }; }
  restore() {
    const S = this, R = S.robot, n = S.snap; if (!n) return false; S.tweens.length = 0;
    while (S.allParts.length > n.n) S.allParts.pop().removeFromParent();
    for (const e of n.parts) { e.parent.add(e.p); e.p.position.copy(e.pos); e.p.quaternion.copy(e.q); setKind(e.p, e.kind); }
    S.blanks = n.blanks.slice(); S.binParts = n.bin.slice(); S.vicePart = n.vice; S.stationPart = n.st; R.A.part = n.A; R.B.part = n.B; R.A.setOpen(n.Ao); R.B.setOpen(n.Bo);
    S.nestI = n.nestI; S.binN = n.binN; S.slot = n.slot; S.m = { ...n.m }; S.q.set(n.q); S.cycles = n.cycles; for (const st of S.steps) st._st = false;
    S.i = n.i; S.f = n.f; S.waiting = n.waiting; S.timer = { ...n.timer }; S.ct = 0; S.apply(); return true;
  }
  // the whole loop as a timeline: arm steps (top row) and machine phases (bottom row)
  timeline() {
    const S = this, v = S.v, n = S.snap, sv = [S.slot, S.nestI]; if (n) { S.slot = n.binN % 6; S.nestI = n.nestI; }
    let t = DOOR_S, exEnd = 0; const segs = [{ name: 'ouverture porte', type: 'pre', t0: 0, dur: DOOR_S }];
    S.steps.forEach((s, k) => { const d = S.stepDur(s, v); segs.push({ name: s.name, type: s.group === 'ex' ? s.type : 'prep', t0: t, dur: d }); t += d; if (k === S.exN - 1) exEnd = t; });
    [S.slot, S.nestI] = sv;
    const tail = Math.max(t - exEnd, DOOR_S + 5.0), len = exEnd + tail + 1.2;
    const mach = [{ name: 'porte', type: 'door', t0: 0, dur: DOOR_S }, { name: 'porte ouverte · CNC-04 à l’arrêt', type: 'open', t0: DOOR_S, dur: exEnd - DOOR_S }, { name: 'porte', type: 'door', t0: exEnd, dur: DOOR_S }, { name: `usinage · ${S.tm.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} min (accéléré)`, type: 'cut', t0: exEnd + DOOR_S, dur: tail - DOOR_S }, { name: '', type: 'door', t0: exEnd + tail, dur: 1.2 }];
    return { segs, mach, exStart: DOOR_S, exEnd, len };
  }
  seek(t) { const S = this; if (!S.restore()) return; t = Math.max(0, Math.min(t, S.timeline().len - 0.1)); S.wrapped = false; const h = 1 / 120; let g = 0; while (S.ct + h <= t && !S.wrapped && g++ < 12000) S.update(h, 1, false); if (!S.wrapped && t > S.ct) S.update(t - S.ct, 1, false); S.events.length = 0; }
  sync() { this.apply(); this.scene.updateMatrixWorld(true); }
  grab(G, part, from) { this.sync(); G.tip.attach(part); G.part = part; if (from === 'vice') this.vicePart = null; }
  drop(G, parent) { this.sync(); const p = G.part; parent.attach(p); G.part = null; return p; }
  toBin(G) { const S = this, p = S.drop(G, S.scene), s = S.slot; S.binParts.push(p); S.binN++; S.tween(p.position, { y: L.bin.floor + Math.floor(s / 2) * PART.FC.h + hh }, 0.064, t => t * t); }   // 20 mm free fall
  squeeze(G, f) { G.setOpen(1 - clamp01(f / 0.9)); const b = this.blanks[this.nestI]; if (b) { const k = 1 - clamp01(f / 0.9); b.rotation.y = b.userData.yaw * k; b.position.z = b.userData.nz + b.userData.dz * k; } }
  pickBlank(G) { const S = this, b = S.blanks[S.nestI]; if (!b) return; S.sync(); S.blanks[S.nestI] = null; G.tip.attach(b); G.part = b; }
  toStation(G) { const S = this, p = S.drop(G, S.scene); S.stationPart = p; S.tween(p.position, { x: L.station.x, y: yS, z: L.station.z }, 0.4, ease); settle(S.tweens, p, 0.4); }
  fromStation(G) { const S = this, p = S.stationPart; if (!p) return; S.grab(G, p, 'station'); S.stationPart = null; S.tween(p.position, { x: 0, y: 0, z: 0 }, 0.08); p.quaternion.copy(nearestSquare(p)); }
  nextNest() { const S = this; S.nestI++; if (S.nestI >= 12) { S.nestI = 0; const rnd = seeded(5 + S.cycles); for (let i = 0; i < 12; i++) { const b = trayBlank(i, rnd); S.W.tray.add(b); S.blanks[i] = b; S.allParts.push(b); } } }
  tween(obj, to, dur, fn = ease) { const from = {}; for (const k in to) from[k] = obj[k]; this.tweens.push({ obj, from, to, dur, t: 0, fn }); }
  cycleStart() { const S = this; S.timer.t -= S._rem || 0; S.timer.running = false; S.timer.last = S.timer.t; S.m.phase = 'closing'; S.m.t = 0; S.cycles++; S.events.push({ type: 'cycleStart', X: S.timer.t }); }
  get inExchange() { return !this.waiting && this.i < this.exN; }
  get exI() { return this.i; } get exF() { return this.f; }
  get phaseText() { const m = this.m.phase, cur = this.inExchange ? this.steps[this.i] : null; return cur ? cur.name : m === 'machining' ? `usinage · ${this.tm.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} min (accéléré)` : m === 'toLoad' ? 'remontée de la broche' : m === 'opening' ? 'ouverture de la porte · 3 s' : m === 'closing' ? 'fermeture de la porte · reprise de l’usinage' : ''; }
  // ---------- update ----------
  // dt: simulated seconds. armRate in [0,1] (a protective stop ramps it to 0). reduced: MODE-03.
  update(dt, armRate, reduced) {
    const S = this, m = S.m; S.ct += dt;
    machineStep(m, dt, S.W);
    if (m.phase === 'machining') {
      if (S.waiting && S.i >= S.steps.length && m.t > 5.0) { m.phase = 'toLoad'; m.t = 0; if (S.vicePart) setKind(S.vicePart, 'finished'); if (S.binParts.length >= 6) { for (const p of S.binParts) p.removeFromParent(); S.binParts.length = 0; } }
    } else if (m.phase === 'toLoad') { if (m.t >= 1.2) { m.phase = 'opening'; m.t = 0; S.ct = 0; S.wrapped = true; S.snap = S.snapshot(); S.events.push({ type: 'newCycle' }); } }
    else if (m.phase === 'opening') {
      m.jaw = ease(clamp01((m.t - 0.6) / 1.2));
      if (m.t >= DOOR_S) { m.phase = 'open'; m.t = 0; m.door = 1; S.i = 0; S.f = 0; S.waiting = false; S.timer = { running: true, t: 0, last: null }; S.events.push({ type: 'doorOpen' }); }
    } else if (m.phase === 'closing') { if (m.t >= DOOR_S) { m.phase = 'machining'; m.t = 0; m.door = 0; m.head = L.mach.toolPark; } }
    if (S.timer.running) S.timer.t += dt;
    let rem = dt * armRate;
    while (!S.waiting && rem > 1e-9 && S.i < S.steps.length) {
      const s = S.steps[S.i], v = reduced ? Math.min(S.v, V_REDUCED) : S.v;
      if (S.f === 0 && s.start && !s._st) { s.start(); s._st = true; }
      const dur = S.stepDur(s, v), left = (1 - S.f) * dur;
      if (rem < left) { S.f += rem / dur; rem = 0; } else { rem -= left; S.f = 1; }
      S.pose(s, S.f);
      if (s.tick) s.tick(S.f);
      if (S.f >= 1) { S._rem = armRate > 0 ? rem / armRate : 0; s._st = false; if (s.end) s.end(); S.i++; S.f = 0; if (S.i >= S.steps.length) S.waiting = true; }
    }
    runTweens(S.tweens, dt);
    S.apply();
  }
  pose(s, f) { if (!s.seg) return; const d = s.seg(), u = s.u ? s.u(f) : f; evalTable(d.tab, this.N, s.raw ? u : ease(u), this.q); }
  apply() { this.robot.setQ(this.q); machineApply(this.m, this.W); }
}
