import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
export const M = {
  paint: std(0xd6dde1, 0.55, 0.05), paintDark: std(0x39454e, 0.6, 0.1), inner: std(0x7f8b94, 0.75, 0.2), trim: std(0x2f4b5e, 0.5, 0.1),
  steel: std(0x8d969d, 0.38, 0.9), bright: std(0xdfe4e7, 0.2, 1.0), raw: std(0x3f4852, 0.68, 0.7), dark: std(0x1b1f23, 0.6, 0.3),
  rubber: std(0x121416, 0.9, 0), yellow: std(0xf0b400, 0.5, 0.05), blueBtn: std(0x1f6fd0, 0.4, 0.1), red: std(0xc0392b, 0.45, 0.05),
  plate: std(0x4a555e, 0.55, 0.6), cabinet: std(0xcdd3d6, 0.5, 0.1), liner: std(0x35566b, 0.95, 0), cable: std(0x1a1d20, 0.7, 0),
  orange: std(0xd9690f, 0.5, 0.1), vice: std(0x3f6079, 0.45, 0.35), anod: std(0x30363c, 0.35, 0.8), pad: std(0xe9e4d2, 0.8, 0), screen: std(0x10202b, 0.25, 0.2, { emissive: 0x1d4a66, emissiveIntensity: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xbfd6e2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.2 }),
  urCast: std(0x9aa2a8, 0.42, 0.75), urTube: std(0xcfd4d8, 0.3, 0.9), urCap: std(0x6ea6cc, 0.45, 0.1), urSeal: std(0x17191b, 0.8, 0),
  skin: std(0x2f4b5e, 0.75, 0), vest: std(0xe08a00, 0.8, 0), head: std(0xcbb9a8, 0.8, 0), trousers: std(0x26343f, 0.85, 0),
};
export function box(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.004) {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
// box given by min/max corners
export const bb = (x0, x1, y0, y1, z0, z1, mat, r = 0.004) => box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
export function cyl(r, h, mat, x = 0, y = 0, z = 0, axis = 'y', seg = 32, r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat); m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.castShadow = m.receiveShadow = true; return m;
}
export function label(text, w, h, { bg = '#ffffff', fg = '#1C262E', font = '600 64px IBM Plex Sans, sans-serif', px = 512 } = {}) {
  const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * h / w);
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); m.userData.canvas = c; return m;
}
export function extrudeXY(pts, holes, depth, mat, bevel = 0.004) {
  const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  for (const h of holes || []) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 24 });
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
}
export const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
