import * as THREE from 'three';
import { Arm } from '../src/kin.js';
import { L } from '../src/layout.js';
import { buildTables, buildTablesSingle, allTables } from '../src/program.js';
const PI = Math.PI, root = new THREE.Matrix4().makeTranslation(L.base.x, L.base.y, L.base.z).multiply(new THREE.Matrix4().makeRotationX(-PI / 2));
const arm = new Arm(root), frames = Array.from({ length: 6 }, () => new THREE.Matrix4()), seed = [-0.222, -1.963, 2.217, -0.254, -0.222, -1.571];
for (const [nm, fn] of [['dual', buildTables], ['single', buildTablesSingle]]) {
  const B = fn(arm, seed); let maxStep = 0, zmax = -9, elz = [9, -9], lens = {}, qmin = seed.slice(), qmax = seed.slice();
  for (const [k, d] of allTables(B.T)) { (lens[k] = lens[k] || []).push(d.len); for (let i = 0; i <= B.N; i++) { const q = Array.from(d.tab.subarray(i * 6, i * 6 + 6)); if (i) maxStep = Math.max(maxStep, ...q.map((v, j) => Math.abs(v - d.tab[(i - 1) * 6 + j]))); arm.fk(q, undefined, frames); for (const f of frames) zmax = Math.max(zmax, f.elements[14]); elz = [Math.min(elz[0], frames[2].elements[13]), Math.max(elz[1], frames[2].elements[13])]; q.forEach((v, j) => { qmin[j] = Math.min(qmin[j], v); qmax[j] = Math.max(qmax[j], v); }); } }
  console.log(nm, 'worst', B.worst.toExponential(1), 'drift', B.drift.toExponential(1), 'maxStep', maxStep.toFixed(2), 'joint zmax', zmax.toFixed(2), 'elbow y', elz.map(v => v.toFixed(2)).join('..'), '\n  q', qmin.map((v, j) => v.toFixed(1) + '..' + qmax[j].toFixed(1)).join(' '), '\n  len', Object.entries(lens).map(([k, v]) => k + ' ' + Math.min(...v).toFixed(2) + (v.length > 1 ? '..' + Math.max(...v).toFixed(2) : '')).join(', '));
}
