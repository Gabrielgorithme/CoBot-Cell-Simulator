import * as THREE from 'three';
import { Arm, twinTarget } from '../src/kin.js';
const PI = Math.PI;
const root = new THREE.Matrix4().makeTranslation(0, 0.75, 0).multiply(new THREE.Matrix4().makeRotationX(-PI / 2));
const arm = new Arm(root), T = new THREE.Matrix4(), tip = new THREE.Vector3();
const wrap = v => Math.atan2(Math.sin(v), Math.cos(v));
let rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function feasible(x, y, z, psi, th) {
  twinTarget(tip.set(x, y, z), psi, th, T);
  for (let k = 0; k < 40; k++) { const r = arm.ik(T, Array.from({ length: 6 }, () => (rnd() * 2 - 1) * PI), { iters: 200 }); if (r.err < 1e-4) return true; }
  return false;
}
// tip heights: vice 0.9425, tray 0.8275, bin 0.66 ; psiRel = idle heading relative to the outward radial direction
for (const [name, y] of [['vice', 0.9425], ['hover', 1.04], ['tray', 0.8275], ['bin', 0.66]]) {

  for (const rel of [0, PI / 6, PI / 3, PI / 2, PI]) for (const th of [0]) {
    let rs = [];
    for (let r = 0.15; r <= 1.0001; r += 0.05) if (feasible(0, y, -r, -PI / 2 + rel, th)) rs.push(r.toFixed(2));
    console.log(name, 'idle', (rel * 180 / PI).toFixed(0).padStart(4), 'th', th ? 'B' : 'A', 'r:', rs.length ? rs[0] + '..' + rs[rs.length - 1] + (rs.length < Math.round((rs[rs.length - 1] - rs[0]) / 0.05) + 1 ? ' (gaps)' : '') : 'none');
  }
}
