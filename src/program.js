// Tool paths of the dual-gripper program and their joint tables (IK tracked along each path).
import * as THREE from 'three';
import { L, PART, nest } from './layout.js';
import { P, track, sample } from './path.js';
const PI = Math.PI;
export const hh = PART.FC.h / 2, yV = L.vice.bed + hh, yT = L.tray.top + hh, yS = L.station.top + hh;
export const ST_OFF = 0.008;
function pathLen(kind, a, b, hop) { const T = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Vector3(); let s = 0; for (let k = 0; k <= 24; k++) { sample(kind, a, b, k / 24, T, hop); q.setFromMatrixPosition(T); if (k) s += q.distanceTo(p); p.copy(q); } return s; }
export function buildTables(arm, seed) {
  const dp = L.doorPoint, H = P(dp.x, yV, dp.z, dp.psi, 0), V0 = P(L.vice.x, yV, L.vice.z, dp.psi, 0), up = (p, o) => ({ ...p, ...o });
  const V1 = up(V0, { y: yV + L.lift }), V2 = up(V1, { th: PI }), V3 = up(V0, { th: PI }), HB = up(H, { th: PI });
  const Bh = P(L.bin.x, L.hover, L.bin.z, L.bin.psi, 0);
  const S = L.station, Sh = P(S.x + ST_OFF, L.hover, S.z + ST_OFF, S.psi, PI), Sd = up(Sh, { y: yS }), Sn = P(S.x, yS, S.z, S.psi, PI), Snh = up(Sn, { y: L.hover });
  const seg = (kind, a, b) => ({ kind, a, b, len: pathLen(kind, a, b) });
  const A = [seg('lin', H, V0), seg('lin', V0, V1), seg('lin', V1, V2), seg('lin', V2, V3), seg('lin', V3, HB), seg('cyl', HB, Bh)];
  const tA = track(arm, A, seed), N = tA.N; let worst = tA.worst;
  const T = {}; ['ENTER', 'LIFT', 'TURN', 'PLACE', 'LEAVE', 'TOBIN'].forEach((k, i) => T[k] = { tab: tA.tables[i], len: A[i].len });
  T.BINDOWN = []; T.BINUP = []; T.TOTRAY = []; T.TRAYDOWN = []; T.TRAYUP = []; T.TOST = [];
  for (let s = 0; s < L.bin.slots.length * L.bin.layers; s++) {
    const Bd = P(L.bin.slots[s % 2], L.bin.floor + Math.floor(s / 2) * PART.FC.h + 0.02 + hh, L.bin.z, L.bin.psi, 0), sg = [seg('lin', Bh, Bd), seg('lin', Bd, Bh)], t = track(arm, sg, tA.end);
    T.BINDOWN.push({ tab: t.tables[0], len: sg[0].len }); T.BINUP.push({ tab: t.tables[1], len: sg[1].len }); worst = Math.max(worst, t.worst);
  }
  let endSt = null;
  for (let n = 0; n < 12; n++) {
    const c = nest(n), Th = P(c.x, L.hover, c.z, L.tray.psi, PI), Td = up(Th, { y: yT }), sg = [seg('cyl', Bh, Th), seg('lin', Th, Td), seg('lin', Td, Th), seg('cyl', Th, Sh)], t = track(arm, sg, tA.end);
    ['TOTRAY', 'TRAYDOWN', 'TRAYUP', 'TOST'].forEach((k, i) => T[k].push({ tab: t.tables[i], len: sg[i].len })); worst = Math.max(worst, t.worst); endSt = t.end;
  }
  const Bs = [seg('lin', Sh, Sd), seg('lin', Sd, Sn), seg('lin', Sn, Snh), seg('cyl', Snh, H)], tB = track(arm, Bs, endSt);
  ['STDOWN', 'STALIGN', 'STUP', 'TOHOME'].forEach((k, i) => T[k] = { tab: tB.tables[i], len: Bs[i].len }); worst = Math.max(worst, tB.worst);
  return { T, N, worst, drift: Math.max(...tB.end.map((v, j) => Math.abs(v - seed[j]))), home: H };
}
// Single gripper (rejected option A): only gripper A is used; two entries into the machine.
export function buildTablesSingle(arm, seed) {
  const dp = L.doorPoint, up = (p, o) => ({ ...p, ...o }), seg = (kind, a, b, hop) => ({ kind, a, b, hop, len: pathLen(kind, a, b, hop) });
  const H = P(dp.x, yV, dp.z, dp.psi, 0), Hl = up(H, { y: yV + L.lift }), V0 = P(L.vice.x, yV, L.vice.z, dp.psi, 0), V1 = up(V0, { y: yV + L.lift });
  const S = L.station, Sn = P(S.x, yS, S.z, S.psi, 0), Sn2 = up(Sn, { y: yS + 0.10, psi: -0.5 }), Sd = P(S.x + ST_OFF, yS, S.z + ST_OFF, S.psi, 0);
  const T = {}, put = (names, segs, tr) => names.forEach((k, i) => T[k] = { tab: tr.tables[i], len: segs[i].len });
  const A = [seg('lin', H, V0), seg('lin', V0, V1), seg('lin', V1, Hl)], tA = track(arm, A, seed), N = tA.N; let worst = tA.worst; put(['ENTER', 'LIFT', 'LEAVE1'], A, tA);
  T.TOBIN = []; T.TOST = []; T.TOTRAY = []; T.TRAY2ST = []; let endSt = null;
  for (let s = 0; s < L.bin.slots.length * L.bin.layers; s++) {
    const Bd = P(L.bin.slots[s % 2], L.bin.floor + Math.floor(s / 2) * PART.FC.h + 0.02 + hh, L.bin.z, L.bin.psi, 0), sg = [seg('cyl', Hl, Bd, 0.02), seg('cyl', Bd, Sn, 0.07)], t = track(arm, sg, tA.end);
    T.TOBIN.push({ tab: t.tables[0], len: sg[0].len }); T.TOST.push({ tab: t.tables[1], len: sg[1].len }); worst = Math.max(worst, t.worst); endSt = t.end;
  }
  const B = [seg('lin', Sn, Sn2), seg('cyl', Sn2, Hl), seg('lin', Hl, V1), seg('lin', V1, V0), seg('lin', V0, H)], tB = track(arm, B, endSt); worst = Math.max(worst, tB.worst); put(['TURN', 'TODOOR', 'ENTER2', 'PLACE', 'LEAVE2'], B, tB);
  let endTr = null;
  for (let n = 0; n < 12; n++) {
    const c = nest(n), Td = P(c.x, yT, c.z, L.tray.psi, 0), sg = [seg('cyl', H, Td, 0.10), seg('cyl', Td, Sd, 0.10)], t = track(arm, sg, tB.end);
    T.TOTRAY.push({ tab: t.tables[0], len: sg[0].len }); T.TRAY2ST.push({ tab: t.tables[1], len: sg[1].len }); worst = Math.max(worst, t.worst); endTr = t.end;
  }
  const C = [seg('cyl', Sd, H, 0.10)], tC = track(arm, C, endTr); worst = Math.max(worst, tC.worst); put(['STHOME'], C, tC);
  return { T, N, worst, drift: Math.max(...tC.end.map((v, j) => Math.abs(v - seed[j])), ...tB.end.map((v, j) => Math.abs(v - seed[j]))) };
}
export function allTables(T) { const out = []; for (const k in T) for (const d of (Array.isArray(T[k]) ? T[k] : [T[k]])) out.push([k, d]); return out; }
