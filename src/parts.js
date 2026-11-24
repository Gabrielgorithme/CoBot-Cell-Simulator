// Workpieces: raw blank and machined part (pocket + bore), family FC 120 x 120 x 55.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M } from './mat.js';
let gBlank, gFin;
function finishedGeo(w, h, d) {
  const sq = (s, r) => { const sh = new THREE.Shape(), a = s / 2; sh.moveTo(-a + r, -a); sh.lineTo(a - r, -a); sh.quadraticCurveTo(a, -a, a, -a + r); sh.lineTo(a, a - r); sh.quadraticCurveTo(a, a, a - r, a); sh.lineTo(-a + r, a); sh.quadraticCurveTo(-a, a, -a, a - r); sh.lineTo(-a, -a + r); sh.quadraticCurveTo(-a, -a, -a + r, -a); return sh; };
  const lower = sq(w, 0.004); const bore = new THREE.Path(); bore.absarc(0, 0, 0.019, 0, Math.PI * 2, true); lower.holes.push(bore);
  const upper = sq(w, 0.004); const pk = sq(w - 0.036, 0.012); upper.holes.push(new THREE.Path(pk.getPoints(8).reverse()));
  const hp = 0.02, o = { bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 1, curveSegments: 20 };
  const g1 = new THREE.ExtrudeGeometry(lower, { ...o, depth: h - hp - 0.0024 }); g1.translate(0, 0, 0.0012);
  const g2 = new THREE.ExtrudeGeometry(upper, { ...o, depth: hp - 0.0024 }); g2.translate(0, 0, h - hp + 0.0012);
  const g = mergeTwo(g1, g2); g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0); return g;
}
function mergeTwo(a, b) {
  if (a.index) a = a.toNonIndexed(); if (b.index) b = b.toNonIndexed(); const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal']) { const A = a.attributes[k].array, B = b.attributes[k].array, C = new Float32Array(A.length + B.length); C.set(A); C.set(B, A.length); g.setAttribute(k, new THREE.BufferAttribute(C, 3)); }
  return g;
}
export function makePart(kind, P) {
  if (!gBlank) { gBlank = new RoundedBoxGeometry(P.w, P.h, P.d, 2, 0.003); gFin = finishedGeo(P.w, P.h, P.d); }
  const g = new THREE.Group();
  const blank = new THREE.Mesh(gBlank, M.raw), fin = new THREE.Mesh(gFin, M.bright);
  for (const m of [blank, fin]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  g.userData = { blank, fin, kind: null };
  setKind(g, kind); return g;
}
export function setKind(g, kind) { g.userData.kind = kind; g.userData.blank.visible = kind === 'blank'; g.userData.fin.visible = kind === 'finished'; }

// The blocks are symmetric: among the equivalent orientations (yaw steps of 90°, upright or flipped) return the one
// closest to the part's current orientation, so that settling a part never shows a spurious flip.
const _c = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0), _fx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
export function nearestSquare(part, out = new THREE.Quaternion()) {
  let best = -1;
  for (let k = 0; k < 4; k++) for (let f = 0; f < 2; f++) { _c.setFromAxisAngle(_y, k * Math.PI / 2); if (f) _c.multiply(_fx); const d = Math.abs(_c.dot(part.quaternion)); if (d > best) { best = d; out.copy(_c); } }
  if (out.dot(part.quaternion) < 0) out.set(-out.x, -out.y, -out.z, -out.w);
  return out;
}
