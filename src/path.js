// Tool paths of the cycle. 'lin' = straight line of the gripper tip (MoveL), 'cyl' = swing around the
// robot base axis (free-space transfer). Each pose: tip position + idle-gripper heading psi + flange turn th.
import * as THREE from 'three';
import { twinTarget } from './kin.js';
import { L } from './layout.js';
const lerp = (a, b, u) => a + (b - a) * u;
const _tip = new THREE.Vector3();
export const P = (x, y, z, psi, th) => ({ x, y, z, psi, th });
function polar(p) { const dx = p.x - L.base.x, dz = p.z - L.base.z; let a = Math.atan2(dz, dx); if (a < -Math.PI / 2 - 0.2) a += 2 * Math.PI; return { r: Math.hypot(dx, dz), a }; }
const sm = t => t * t * (3 - 2 * t);
// hop: optional clearance; the tip first rises to max(ya, yb) + hop, travels, then descends (pick-and-place arc)
export function sample(kind, a, b, u, out, hop) {
  let x, z;
  if (kind === 'cyl') { const pa = polar(a), pb = polar(b), an = lerp(pa.a, pb.a, u); let r = lerp(pa.r, pb.r, u), sn = Math.sin(an); if (L.base.z + r * sn > L.zMaxTip) r = (L.zMaxTip - L.base.z) / sn; if (L.base.z + r * sn < L.zMinTip) r = (L.zMinTip - L.base.z) / sn; x = L.base.x + r * Math.cos(an); z = L.base.z + r * sn; }
  else { x = lerp(a.x, b.x, u); z = lerp(a.z, b.z, u); }
  let y = lerp(a.y, b.y, u);
  if (hop !== undefined) { const top = Math.max(a.y, b.y) + hop; y = u < 0.3 ? a.y + (top - a.y) * sm(u / 0.3) : u > 0.7 ? top + (b.y - top) * sm((u - 0.7) / 0.3) : top; }
  return twinTarget(_tip.set(x, y, z), lerp(a.psi, b.psi, u), lerp(a.th, b.th, u), out);
}
// Precompute joint tables for a list of segments [{kind, a, b}], tracking IK from seed.
export function track(arm, segs, seed, N = 48) {
  const T = new THREE.Matrix4(); let q = seed.slice(), worst = 0;
  const tables = segs.map(s => {
    const tab = new Float32Array((N + 1) * 6);
    for (let k = 0; k <= N; k++) {
      const r = arm.ik(sample(s.kind, s.a, s.b, k / N, T, s.hop), q, { iters: 80 });
      q = r.q; worst = Math.max(worst, r.err); tab.set(q, k * 6);
    }
    return tab;
  });
  return { tables, end: q, worst, N };
}
export function evalTable(tab, N, u, out) {
  const f = Math.min(Math.max(u, 0), 1) * N, i = Math.min(Math.floor(f), N - 1), t = f - i;
  for (let j = 0; j < 6; j++) out[j] = tab[i * 6 + j] * (1 - t) + tab[(i + 1) * 6 + j] * t;
  return out;
}
