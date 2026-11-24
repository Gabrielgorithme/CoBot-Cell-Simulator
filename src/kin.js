// UR16e kinematics, taken from UR's public ROS description (config/ur16e/default_kinematics.yaml).
// Forward kinematics is the URDF chain itself; inverse kinematics is numeric (damped least squares),
// tracked along Cartesian paths so the arm stays on one branch.
import * as THREE from 'three';

const rpy = (r, p, y) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r, p, y, 'ZYX'));
const tr = (x, y, z, r = 0, p = 0, yw = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(rpy(r, p, yw));
const H = Math.PI / 2;

export const JOINTS = [
  tr(0, 0, 0.1807),
  tr(0, 0, 0, H, 0, 0),
  tr(-0.4784, 0, 0),
  tr(-0.36, 0, 0.17415),
  tr(0, -0.11985, 0, H, 0, 0),
  tr(0, 0.11655, 0, H, Math.PI, Math.PI),
];
export const BASE_INERTIA = tr(0, 0, 0, 0, 0, Math.PI);
// visual mesh offsets (config/ur16e/visual_parameters.yaml)
export const MESH_OFFSET = {
  base: tr(0, 0, 0, 0, 0, Math.PI),
  shoulder: tr(0, 0, 0, 0, 0, Math.PI),
  upperarm: tr(0, 0, 0.1762, H, 0, -H),
  forearm: tr(0, 0, 0.0393, H, 0, -H),
  wrist1: tr(0, 0, -0.135, H, 0, 0),
  wrist2: tr(0, 0, -0.12, 0, 0, 0),
  wrist3: tr(0, -0.0005, -0.1168, H, 0, 0),
};

const _rz = new THREE.Matrix4();
export class Arm {
  constructor(rootMatrix) {
    this.root = rootMatrix.clone().multiply(BASE_INERTIA); // world <- base_link_inertia
    this._m = new THREE.Matrix4();
  }
  // world matrices of the 6 link frames; returns the flange (wrist_3) matrix
  fk(q, out = this._m, frames = null) {
    out.copy(this.root);
    for (let i = 0; i < 6; i++) {
      out.multiply(JOINTS[i]).multiply(_rz.makeRotationZ(q[i]));
      if (frames) frames[i].copy(out);
    }
    return out;
  }
  // pose error (6-vector): position + rotation vector, target - current
  _err(q, target, e) {
    const m = this.fk(q).elements, t = target.elements;
    e[0] = t[12] - m[12]; e[1] = t[13] - m[13]; e[2] = t[14] - m[14];
    // rotation error: 0.5 * sum(cross(current_axis, target_axis))
    let rx = 0, ry = 0, rz = 0;
    for (let c = 0; c < 3; c++) {
      const ax = m[c * 4], ay = m[c * 4 + 1], az = m[c * 4 + 2], bx = t[c * 4], by = t[c * 4 + 1], bz = t[c * 4 + 2];
      rx += ay * bz - az * by; ry += az * bx - ax * bz; rz += ax * by - ay * bx;
    }
    rx *= 0.5; ry *= 0.5; rz *= 0.5;
    // true axis-angle (the bare cross sum vanishes for 180° errors)
    const sn = Math.hypot(rx, ry, rz);
    const cs = (m[0] * t[0] + m[1] * t[1] + m[2] * t[2] + m[4] * t[4] + m[5] * t[5] + m[6] * t[6] + m[8] * t[8] + m[9] * t[9] + m[10] * t[10] - 1) / 2;
    const ang = Math.atan2(sn, cs);
    if (sn > 1e-9) { const k = ang / sn; e[3] = rx * k; e[4] = ry * k; e[5] = rz * k; }
    else if (cs < 0) { e[3] = Math.PI; e[4] = 0; e[5] = 0; }
    else { e[3] = rx; e[4] = ry; e[5] = rz; }
    return e;
  }
  // damped least squares IK from a seed. Returns {q, err}
  ik(target, seed, { iters = 60, lambda = 0.03, tolP = 2e-5, wR = 0.35 } = {}) {
    const q = seed.slice(), e = new Float64Array(6), e2 = new Float64Array(6), J = new Float64Array(36);
    let err = 1;
    for (let it = 0; it < iters; it++) {
      this._err(q, target, e);
      err = Math.hypot(e[0], e[1], e[2]) + wR * Math.hypot(e[3], e[4], e[5]);
      if (err < tolP) break;
      const d = 1e-5;
      for (let j = 0; j < 6; j++) {
        q[j] += d; this._err(q, target, e2); q[j] -= d;
        for (let i = 0; i < 6; i++) J[i * 6 + j] = -(e2[i] - e[i]) / d;
      }
      // rows 3..5 weighted so that 1 rad ~ wR m
      for (let i = 3; i < 6; i++) { e[i] *= wR; for (let j = 0; j < 6; j++) J[i * 6 + j] *= wR; }
      // dq = J^T (J J^T + l^2 I)^-1 e
      const A = new Float64Array(36), b = Array.from(e);
      for (let i = 0; i < 6; i++) for (let k = 0; k < 6; k++) { let s = 0; for (let j = 0; j < 6; j++) s += J[i * 6 + j] * J[k * 6 + j]; A[i * 6 + k] = s + (i === k ? lambda * lambda : 0); }
      const y = solve6(A, b);
      let mx = 0; const dq = new Float64Array(6);
      for (let j = 0; j < 6; j++) { let s = 0; for (let i = 0; i < 6; i++) s += J[i * 6 + j] * y[i]; dq[j] = s; mx = Math.max(mx, Math.abs(s)); }
      const sc = mx > 0.35 ? 0.35 / mx : 1;
      for (let j = 0; j < 6; j++) q[j] += dq[j] * sc;
    }
    return { q, err };
  }
}
function solve6(A, b) {
  const n = 6;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } const t = b[c]; b[c] = b[p]; b[p] = t; }
    const piv = A[c * n + c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = A[r * n + c] / piv; if (!f) continue; for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k]; b[r] -= f * b[c]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k]; x[r] = s / (A[r * n + r] || 1e-12); }
  return x;
}

// Flange target for the back-to-back twin gripper ("twin flange"): the flange axis is horizontal with heading
// psi (world: x along the machine front, z = depth from the CNC face, y up); the active gripper hangs straight
// down, the idle one points straight up. theta = turn about the flange axis (0: gripper A down, PI: gripper B down).
// Gripper A lies along +X of the flange frame, gripper B along -X; fingers open along Y.
export const TIP_L = 0.22, TOOL_Z = 0.05;
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
export function twinTarget(tip, psi, theta, out = new THREE.Matrix4()) {
  const hx = Math.cos(psi), hz = Math.sin(psi);
  _Z.set(hx, 0, hz); _X.set(0, -1, 0); _Y.crossVectors(_Z, _X);
  out.makeBasis(_X, _Y, _Z).multiply(_rz.makeRotationZ(theta));
  out.setPosition(tip.x - TOOL_Z * hx, tip.y + TIP_L, tip.z - TOOL_Z * hz);
  return out;
}
