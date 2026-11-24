// "Today": CNC-04 loaded by hand by an operator who also tends CNC-05. Dossier figures only: the exchange takes
// 12 s and the machine waits for the operator about 20 % of its scheduled time. The split of the 12 s into
// gestures is illustrative; the waiting is shown fast-forward.
import * as THREE from 'three';
import { L, PART, nest } from './layout.js';
import { DOOR_S } from './model.js';
import { makePerson, placePerson } from './safety.js';
import { makePart, setKind } from './parts.js';
import { machineStep, machineApply, machineInit, trayBlank, seeded, ease, clamp01, runTweens, settle } from './sim.js';
import { hh, yV, yT } from './program.js';

export const T_MANUAL = 12;
const DOORPT = [1.0, 0.50], BINPT = [1.56, 1.02], CARTPT = [0.26, 1.22], AWAY = [-8.5, 1.5], VIA = [0.95, 1.30];
// walking routes that go around the blank cart and the bin
const ROUTE = { in: [AWAY, VIA, DOORPT], toBin: [DOORPT, [1.0, 1.05], BINPT], toCart: [BINPT, CARTPT], toDoor: [CARTPT, VIA, DOORPT], out: [DOORPT, VIA, AWAY] };
const rlen = P => { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; };
function rat(P, d, o) { for (let i = 1; i < P.length; i++) { const dx = P[i][0] - P[i - 1][0], dz = P[i][1] - P[i - 1][1], l = Math.hypot(dx, dz); if (d <= l || i === P.length - 1) { const u = Math.min(1, d / l); o.x = P[i - 1][0] + dx * u; o.z = P[i - 1][1] + dz * u; o.hx = dx / l; o.hz = dz / l; return; } d -= l; } }
// gestures of the manual exchange (sum = 12 s)
const G = [['take', 2.5], ['toBin', 2.0], ['put', 1.0], ['toCart', 1.5], ['pick', 1.0], ['toDoor', 2.0], ['place', 2.0]];

export class Today {
  constructor(scene, W) { this.scene = scene; this.W = W; this.op = makePerson(true); this.op.g.visible = false; scene.add(this.op.g); this.parts = []; this.tweens = []; this.tm = 6.5; this.active = false; }
  clear() { for (const p of this.parts) p.removeFromParent(); this.parts.length = 0; this.tweens.length = 0; this.op.g.visible = false; this.active = false; }
  reset() {
    this.clear(); this.active = true; const rnd = seeded(23);
    this.blanks = []; for (let i = 0; i < 12; i++) { const b = trayBlank(i, rnd); this.W.tray.add(b); this.blanks.push(b); this.parts.push(b); }
    this.vicePart = makePart('finished', PART.FC); this.vicePart.position.set(L.vice.x, yV, L.vice.z); this.W.table.add(this.vicePart); this.parts.push(this.vicePart);
    this.timer = { running: false, t: 0, last: null }; this.binN = 0; this.binParts = []; this.nestI = 0; this.cycles = 0; this.held = null;
    const o = this.op; o.x = AWAY[0]; o.z = AWAY[1]; o.hx = 1; o.hz = 0; o.speed = 0; o.lean = 0; o.carry = 0; o.reach = 0; o.g.visible = false; this.gi = -1; this.gt = 0; this.ps = 0; this.out = 0;
    // the loop starts when CNC-04 stops and waits: spindle parked, table at the loading position
    this.m = { ...machineInit(), phase: 'waiting', table: L.mach.tableLoad, head: L.mach.toolPark }; this.ct = 0; this.snap = this.snapshot();
    machineApply(this.m, this.W);
  }
  snapshot() { const S = this; return { n: S.parts.length, parts: S.parts.map(p => ({ p, parent: p.parent, pos: p.position.clone(), q: p.quaternion.clone(), kind: p.userData.kind })), blanks: S.blanks.slice(), bin: S.binParts.slice(), binN: S.binN, vice: S.vicePart, m: { ...S.m }, cycles: S.cycles, timer: { ...S.timer } }; }
  restore() { const S = this, n = S.snap, o = S.op; if (!n) return false; S.tweens.length = 0; while (S.parts.length > n.n) S.parts.pop().removeFromParent(); for (const e of n.parts) { e.parent.add(e.p); e.p.position.copy(e.pos); e.p.quaternion.copy(e.q); setKind(e.p, e.kind); }
    S.blanks = n.blanks.slice(); S.binParts = n.bin.slice(); S.binN = n.binN; S.vicePart = n.vice; S.m = { ...n.m }; S.cycles = n.cycles; S.held = null; S.timer = { ...n.timer };
    o.x = AWAY[0]; o.z = AWAY[1]; o.hx = 1; o.hz = 0; o.g.visible = false; o.lean = 0; o.carry = 0; o.reach = 0; o.speed = 0; S.gi = -1; S.gt = 0; S.ps = 0; S.out = 0; S.ct = 0; machineApply(S.m, S.W); return true; }
  // whole loop: the operator (top row) and the machine (bottom row)
  timeline() {
    const Wt = 2.2 + rlen(ROUTE.in) / 1.6, e0 = Wt + DOOR_S, e1 = e0 + T_MANUAL, len = e1 + DOOR_S + 5 + 1.2;
    const segs = [{ name: 'l’opérateur est à CNC-05', type: 'wait', t0: 0, dur: Wt }, { name: 'ouverture porte', type: 'pre', t0: Wt, dur: DOOR_S }, { name: 'échange à la main', type: 'fx', t0: e0, dur: T_MANUAL }, { name: 'retour vers CNC-05', type: 'prep', t0: e1, dur: len - e1 }];
    const mach = [{ name: 'CNC-04 à l’arrêt · attend l’opérateur (accéléré)', type: 'stop', t0: 0, dur: Wt }, { name: 'porte', type: 'door', t0: Wt, dur: DOOR_S }, { name: 'porte ouverte · à l’arrêt', type: 'open', t0: e0, dur: T_MANUAL }, { name: 'porte', type: 'door', t0: e1, dur: DOOR_S }, { name: `usinage · ${this.tm.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} min (accéléré)`, type: 'cut', t0: e1 + DOOR_S, dur: 5 }, { name: '', type: 'door', t0: e1 + DOOR_S + 5, dur: 1.2 }];
    return { segs, mach, exStart: e0, exEnd: e1, len };
  }
  seek(t) { const S = this; if (!S.restore()) return; t = Math.max(0, Math.min(t, S.timeline().len - 0.1)); S.wrapped = false; const h = 1 / 120; let g = 0; while (S.ct + h <= t && !S.wrapped && g++ < 12000) S.update(h); if (!S.wrapped && t > S.ct) S.update(t - S.ct); }
  get inExchange() { return this.timer.running; }
  get exI() { return 0; } get exF() { return clamp01(this.timer.t / T_MANUAL); }
  get phaseText() { const p = this.m.phase, tm = this.tm.toLocaleString('fr-FR', { minimumFractionDigits: 1 }); return p === 'waiting' ? 'CNC-04 à l’arrêt · attend l’opérateur (accéléré)' : p === 'machining' ? `usinage · ${tm} min (accéléré)` : p === 'opening' ? 'ouverture de la porte · 3 s' : p === 'open' ? 'chargement à la main' : p === 'closing' ? 'fermeture de la porte · reprise de l’usinage' : p === 'toLoad' ? 'remontée de la broche' : ''; }
  tween(obj, to, dur, fn = ease) { const from = {}; for (const k in to) from[k] = obj[k]; this.tweens.push({ obj, from, to, dur, t: 0, fn }); }
  along(R, f, dur) { const L = rlen(R); rat(R, L * f, this.op); this.op.speed = L / dur; }
  face(hx, hz) { this.op.hx = hx; this.op.hz = hz; this.op.speed = 0; }
  take(part) { this.scene.updateMatrixWorld(true); this.op.hold.attach(part); this.tween(part.position, { x: 0, y: 0, z: 0 }, 0.3); settle(this.tweens, part, 0.3); this.held = part; }
  give(parent, pos) { this.scene.updateMatrixWorld(true); const p = this.held; parent.attach(p); this.tween(p.position, pos, 0.3); settle(this.tweens, p, 0.3); this.held = null; return p; }
  update(dt) {
    const S = this, m = S.m, o = S.op; S.ct += dt; machineStep(m, dt, S.W);
    if (m.phase === 'machining') { if (m.t > 5) { m.phase = 'toLoad'; m.t = 0; setKind(S.vicePart, 'finished'); } }
    else if (m.phase === 'toLoad') { if (m.t >= 1.2) { m.phase = 'waiting'; m.t = 0; S.ct = 0; S.wrapped = true; o.x = AWAY[0]; o.z = AWAY[1]; o.g.visible = false; o.speed = 0; S.ps = 0; S.out = 0; S.snap = S.snapshot(); S.newCycle = true; } }
    else if (m.phase === 'waiting') {           // the machine is stopped: the operator is at CNC-05
      if (m.t > 2.2) { o.g.visible = true; const L = rlen(ROUTE.in); S.ps = Math.min(L, S.ps + 1.6 * dt); rat(ROUTE.in, S.ps, o); o.speed = 1.6; if (S.ps >= L) { S.face(0, -1); m.phase = 'opening'; m.t = 0; } }
    } else if (m.phase === 'opening') { o.reach = -0.9 * Math.sin(clamp01(m.t / 1.0) * Math.PI); if (m.t >= DOOR_S) { m.phase = 'open'; m.t = 0; m.door = 1; o.reach = 0; S.timer = { running: true, t: 0, last: null }; S.gi = 0; S.gt = 0; } }
    else if (m.phase === 'closing') { if (m.t >= DOOR_S) { m.phase = 'machining'; m.t = 0; m.door = 0; m.head = L.mach.toolPark; } }
    if (m.phase === 'open' && S.gi >= 0) {
      S.timer.t += dt; S.gt += dt; const [g, dur] = G[S.gi], f = clamp01(S.gt / dur);
      if (g === 'take') { m.jaw = ease(clamp01(S.gt / 0.6)); o.z = DOORPT[1] - 0.22 * Math.sin(f * Math.PI); o.lean = 0.5 * Math.sin(f * Math.PI); o.carry = clamp01(S.gt / 0.7); S.face(0, -1); if (f > 0.5 && !S.held && S.vicePart) { S.take(S.vicePart); S.vicePart = null; } }
      else if (g === 'toBin') S.along(ROUTE.toBin, f, dur);
      else if (g === 'put') { S.face(0, -1); o.lean = 0.55 * Math.sin(f * Math.PI); if (f > 0.45 && S.held) { const s = S.binN % 6; if (s === 0) { for (const p of S.binParts) p.removeFromParent(); S.binParts.length = 0; } S.binParts.push(S.give(S.scene, { x: L.bin.slots[s % 2], y: L.bin.floor + Math.floor(s / 2) * PART.FC.h + hh, z: L.bin.z })); S.binN++; } o.carry = f > 0.6 ? 1 - (f - 0.6) / 0.4 : 1; }
      else if (g === 'toCart') S.along(ROUTE.toCart, f, dur);
      else if (g === 'pick') { S.face(0, -1); o.lean = 0.45 * Math.sin(f * Math.PI); o.carry = clamp01(f / 0.4); if (f > 0.4 && !S.held) { let k = -1; for (const i of [9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2]) if (S.blanks[i]) { k = i; break; } if (k < 0) { const rnd = seeded(31 + S.cycles); for (let i = 0; i < 12; i++) { const b = trayBlank(i, rnd); S.W.tray.add(b); S.blanks[i] = b; S.parts.push(b); } k = 9; } S.take(S.blanks[k]); S.blanks[k] = null; } }
      else if (g === 'toDoor') S.along(ROUTE.toDoor, f, dur);
      else if (g === 'place') { S.face(0, -1); const u = clamp01(S.gt / 1.2); o.z = DOORPT[1] - 0.22 * Math.sin(u * Math.PI); o.lean = 0.5 * Math.sin(u * Math.PI); if (S.gt > 0.6 && S.held) S.vicePart = S.give(S.W.table, { x: L.vice.x, y: yV, z: L.vice.z }); o.carry = S.gt > 0.9 ? Math.max(0, 1 - (S.gt - 0.9) / 0.5) : 1; m.jaw = 1 - ease(clamp01((S.gt - 1.1) / 0.6)); }
      if (S.gt >= dur) { S.gt -= dur; S.gi++; o.lean = 0; if (S.gi >= G.length) { S.gi = -1; S.out = 0; S.timer.t = T_MANUAL; S.timer.running = false; S.timer.last = T_MANUAL; m.phase = 'closing'; m.t = 0; m.jaw = 0; S.cycles++; o.carry = 0; } }
    }
    if ((m.phase === 'closing' || m.phase === 'machining') && o.g.visible && S.gi < 0) {   // back to CNC-05
      const L = rlen(ROUTE.out); S.out = Math.min(L, (S.out || 0) + 1.5 * dt); rat(ROUTE.out, S.out, o); o.speed = 1.5; if (S.out >= L) { o.g.visible = false; o.speed = 0; }
    }
    runTweens(S.tweens, dt);
    placePerson(o, dt); machineApply(m, S.W);
  }
}
