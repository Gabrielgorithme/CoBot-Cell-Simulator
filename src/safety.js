// Safety: laser scanner fan (scan plane 300 mm above the floor), protective / warning fields from ISO 13855,
// people, and the D6 modes (MODE-02 production, MODE-03 reduced speed, MODE-04 protective stop, no automatic restart).
import * as THREE from 'three';
import { L } from './layout.js';
import { M } from './mat.js';
import { S_of, HAZ, WALK, K_APPROACH, fmt } from './model.js';

const NR = 361, FOV = Math.PI * 1.06, LEG_R = 0.07;
const X0 = L.field.x0, X1 = L.field.x1, DIMX = L.field.x1 + 0.22;

export function makePerson(vest) {
  const g = new THREE.Group(), body = vest ? M.vest : M.skin, cap = (r, l, m) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 14), m); o.castShadow = true; return o; };
  const legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.09, 0.88, 0); const m = cap(0.066, 0.70, M.trousers); m.position.y = -0.43; p.add(m); const shoe = cap(0.05, 0.12, M.dark); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, -0.84, 0.05); p.add(shoe); g.add(p); return p; });
  const upper = new THREE.Group(); upper.position.y = 0.9; g.add(upper);       // pivots at the hips (lean)
  const torso = cap(0.155, 0.36, body); torso.position.y = 0.3; torso.scale.z = 0.72; upper.add(torso);
  if (vest) { for (const y of [0.18, 0.36]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.035, 20), M.pad); band.position.y = y; band.scale.z = 0.73; upper.add(band); } }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), M.head); head.position.y = 0.735; head.castShadow = true; upper.add(head);
  const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.215, 0.52, 0); const m = cap(0.045, 0.5, body); m.position.y = -0.27; p.add(m); const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), M.head); hand.position.y = -0.56; hand.castShadow = true; p.add(hand); p.userData.s = s; upper.add(p); return p; });
  const hold = new THREE.Group(); hold.position.set(0, 0.16, 0.40); upper.add(hold);
  return { g, legs, arms, upper, hold, x: 0, z: 0, hx: 0, hz: 1, phase: 0, speed: 0, lean: 0, carry: 0, angle: [0, 0], legPts: [[0, 0], [0, 0]] };
}
const _qs = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0), _down = new THREE.Vector3(0, -1, 0), _dir = new THREE.Vector3();
export function placePerson(p, dt) {
  const moving = p.speed > 0.01; if (moving) p.phase += dt * p.speed / 1.4 * Math.PI * 2;
  const a = moving ? Math.sin(p.phase) * 0.5 : 0, k = moving ? 1 : 0;
  p.angle[0] += (a - p.angle[0]) * Math.min(1, dt * 14 + (k ? 1 : 0)); p.angle[1] = -p.angle[0];
  p.g.position.set(p.x, 0, p.z); p.g.rotation.y = Math.atan2(p.hx, p.hz); p.upper.rotation.x = p.lean || 0;
  p.legs[0].rotation.x = -p.angle[0]; p.legs[1].rotation.x = -p.angle[1];
  // arms: swing while walking; when carrying (c = 1) both hands close on the sides of the part held at p.hold
  const c = p.carry || 0;
  for (let i = 0; i < 2; i++) {
    const a = p.arms[i], sw = p.angle[i] * 0.8 + (i === 0 ? (p.reach || 0) : 0); _qs.setFromAxisAngle(_ax, sw);
    if (c > 0) { _dir.set(-a.userData.s * 0.215 + a.userData.s * 0.105, p.hold.position.y - 0.52, p.hold.position.z).normalize(); _qc.setFromUnitVectors(_down, _dir); a.quaternion.slerpQuaternions(_qs, _qc, c); } else a.quaternion.copy(_qs);
  }
  const px = p.hz, pz = -p.hx;   // lateral (right-hand) direction
  for (let i = 0; i < 2; i++) { const s = i ? 1 : -1, f = Math.sin(p.angle[i]) * 0.58; p.legPts[i][0] = p.x + px * s * 0.09 + p.hx * f; p.legPts[i][1] = p.z + pz * s * 0.09 + p.hz * f; }
}

export class Safety {
  constructor(scene, W) {
    this.scene = scene; this.W = W; this.T = 0.20; this.people = []; this.walkers = []; this.op = null; this.spawn = 1.2; this.walkOn = true;
    this.mode = 2; this.rate = 1; this.trip = null; this.reduced = false; this.events = []; this.time = 0; this.alarm = 0; this.warn = 0; this.lastStop = null; this.stops = 0;
    this.enabled = true; this.buildFan(); this.buildFloor(); this.drawFloor(); this.buildZones(); this.buildWalkway(); this.buildMarker();
    this.setT(0.20);
  }
  setEnabled(on) { this.enabled = on; for (const o of [this.fan, this.edge, this.hits, this.floorMesh, this.zones]) o.visible = on; if (!on) { this.marker.visible = false; if (this.op) { this.removePerson(this.op); this.op = null; } this.mode = 2; this.trip = null; this.rate = 1; this.resume = undefined; this.estop = false; } }
  get edgeP() { return HAZ + S_of(this.T) / 1000; }
  get zOuter() { return Math.max(WALK, this.edgeP); }
  setT(T) { if (T === this.T && this._zinit) return; this._zinit = true; this.T = T; this.fanMat.uniforms.uEdge.value = this.edgeP; this.updateZones(); }
  // ---------- scanner fan ----------
  buildFan() {
    const pos = new Float32Array((NR + 1) * 3), idx = [];
    for (let i = 1; i < NR; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    this.fanMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uEdge: { value: 2.45 }, uTime: { value: 0 }, uAlarm: { value: 0 }, uWarn: { value: 0 }, uScan: { value: new THREE.Vector2(L.scanner.x, L.scanner.z) } },
      vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vW; uniform float uEdge,uTime,uAlarm,uWarn; uniform vec2 uScan;
        void main(){ float inP = step(vW.z, uEdge); vec3 red = vec3(0.86,0.16,0.12), amb = vec3(0.93,0.60,0.05); vec3 col = mix(amb, red, inP);
          vec2 d = vW.xz - uScan; float r = length(d); float ang = atan(d.x, d.y);
          float ring = smoothstep(0.86, 1.0, sin(r*26.0 - uTime*5.0)*0.5+0.5);
          float sw = fract(ang/3.3301 + 0.5 - uTime*0.55); float sweep = smoothstep(0.88,1.0,sw);
          float act = mix(uWarn, uAlarm, inP); float pulse = 0.5+0.5*sin(uTime*9.0);
          float a = 0.085 + 0.05*ring + 0.16*sweep + act*(0.16+0.10*pulse);
          a *= smoothstep(0.0, 0.10, r);
          gl_FragColor = vec4(col, a); }`,
    });
    this.fan = new THREE.Mesh(g, this.fanMat); this.fan.frustumCulled = false; this.fan.renderOrder = 5; this.scene.add(this.fan);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 3), 3)); lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NR * 3), 3));
    this.edge = new THREE.Line(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })); this.edge.frustumCulled = false; this.edge.renderOrder = 6; this.scene.add(this.edge);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 3), 3));
    this.hits = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, depthTest: false, transparent: true })); this.hits.frustumCulled = false; this.hits.renderOrder = 7; this.scene.add(this.hits);
  }
  updateFan() {
    const sx = L.scanner.x, sz = L.scanner.z, y = L.scanner.y, zO = this.zOuter, eP = this.edgeP;
    const P = this.fan.geometry.attributes.position, E = this.edge.geometry.attributes.position, C = this.edge.geometry.attributes.color, Hh = this.hits.geometry.attributes.position; let nh = 0;
    P.setXYZ(0, sx, y, sz);
    const circles = []; for (const p of this.people) for (const lp of p.legPts) circles.push(lp);
    for (let i = 0; i < NR; i++) {
      const a = -FOV / 2 + FOV * i / (NR - 1), dx = Math.sin(a), dz = Math.cos(a);
      let t = 1e9;
      if (dz > 1e-6) t = Math.min(t, (zO - sz) / dz); else if (dz < -1e-6) t = Math.min(t, (HAZ - sz) / dz); 
      if (dx > 1e-6) t = Math.min(t, (X1 - sx) / dx); else if (dx < -1e-6) t = Math.min(t, (X0 - sx) / dx);
      t = Math.max(0, t); let hit = false;
      for (const c of circles) { const ox = c[0] - sx, oz = c[1] - sz, b = ox * dx + oz * dz, q = ox * ox + oz * oz - LEG_R * LEG_R, disc = b * b - q; if (disc > 0 && b > 0) { const th = b - Math.sqrt(disc); if (th < t) { t = th; hit = true; } } }
      const x = sx + dx * t, z = sz + dz * t; P.setXYZ(i + 1, x, y, z); E.setXYZ(i, x, y + 0.002, z);
      if (hit) { C.setXYZ(i, 1, 1, 1); Hh.setXYZ(nh++, x, y + 0.004, z); } else if (z < eP + 1e-3 && !(Math.abs(z - zO) < 1e-3 && zO > eP + 1e-3)) C.setXYZ(i, 0.80, 0.18, 0.14); else C.setXYZ(i, 0.82, 0.52, 0.05);
    }
    P.needsUpdate = E.needsUpdate = C.needsUpdate = Hh.needsUpdate = true; this.hits.geometry.setDrawRange(0, nh);
  }
  // ---------- floor graphics (one canvas laid on the floor) ----------
  buildFloor() {
    this.fc = { x0: -1.7, z0: -0.05, w: 5.4, h: 4.1, s: 380 };
    const c = document.createElement('canvas'); c.width = Math.round(this.fc.w * this.fc.s); c.height = Math.round(this.fc.h * this.fc.s); this.fcv = c;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; this.ftex = t;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(this.fc.w, this.fc.h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(this.fc.x0 + this.fc.w / 2, 0.016, this.fc.z0 + this.fc.h / 2); m.renderOrder = 2; this.scene.add(m); this.floorMesh = m;
  }
  // Static floor markings, drawn once: hazard band, cell area, and the fixed part of the safety distance.
  drawFloor() {
    const { x0, z0, s } = this.fc, c = this.fcv, g = c.getContext('2d'), X = x => (x - x0) * s, Z = z => (z - z0) * s;
    g.clearRect(0, 0, c.width, c.height);
    const R = (xa, za, xb, zb) => [X(xa), Z(za), (xb - xa) * s, (zb - za) * s];
    g.fillStyle = 'rgba(192,57,43,0.10)'; g.fillRect(...R(0, 0, 2.0, HAZ));
    g.setLineDash([14, 12]); g.lineWidth = 3; g.strokeStyle = 'rgba(28,38,46,0.55)'; g.strokeRect(...R(0, 0, 2.0, 1.8)); g.setLineDash([]);
    const dx = DIMX, col = '#2F4B5E', za = HAZ, zb = HAZ + 1.18;
    g.strokeStyle = col; g.lineWidth = 7; g.beginPath(); g.moveTo(X(dx), Z(za)); g.lineTo(X(dx), Z(zb)); g.stroke();
    g.lineWidth = 5; for (const z of [za, zb]) { g.beginPath(); g.moveTo(X(dx - 0.07), Z(z)); g.lineTo(X(dx + 0.07), Z(z)); g.stroke(); }
    g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '600 46px IBM Plex Mono, monospace'; g.fillText('1,18 m', X(dx + 0.12), Z((za + zb) / 2) - 20);
    g.font = '500 32px IBM Plex Sans, sans-serif'; g.fillText('fixe (C + Z)', X(dx + 0.12), Z((za + zb) / 2) + 24);
    g.fillStyle = 'rgba(28,38,46,0.6)'; g.font = '500 34px IBM Plex Sans, sans-serif'; g.fillText('zone cellule 2,0 × 1,8 m', X(0.04), Z(1.8) + 30);
    this.ftex.needsUpdate = true;
  }
  // Everything that depends on T is made of a few flat meshes that are only moved and scaled: changing T costs
  // no canvas redraw (the three small labels are redrawn only when their text changes).
  buildZones() {
    const G = new THREE.Group(); this.zones = G; this.scene.add(G);
    const unit = new THREE.PlaneGeometry(1, 1); unit.rotateX(-Math.PI / 2);
    const flat = (color, opacity, map, order = 3) => { const m = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color, opacity, map: map || null, transparent: true, depthWrite: false, toneMapped: false })); m.renderOrder = order; G.add(m); return m; };
    const tex = (w, h, draw, rx) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
    const RED = 0xc0392b, AMB = 0xd18e0c;
    this.zP = flat(RED, 0.13); this.zW = flat(AMB, 0.30); this.zI = flat(RED, 0.42);
    this.hatchTex = tex(64, 64, g => { g.strokeStyle = 'rgba(192,57,43,0.34)'; g.lineWidth = 4; for (const o of [-64, 0, 64]) { g.beginPath(); g.moveTo(o - 4, -4); g.lineTo(o + 68, 68); g.stroke(); } });
    this.zH = flat(0xffffff, 1, this.hatchTex);
    this.dashTex = tex(58, 4, g => { g.fillStyle = '#C0392B'; g.fillRect(0, 0, 36, 4); }); this.dashTex.repeat.set((X1 - X0) / 0.153, 1);
    this.zEdge = flat(0xffffff, 1, this.dashTex, 4);
    this.zL = flat(RED, 0.75, null, 4); this.zR = flat(RED, 0.75, null, 4); this.zN = flat(RED, 0.75, null, 4);
    this.dVar = flat(0xb7791f, 1, null, 4); this.dMar = flat(0x23824f, 1, null, 4); this.tE = flat(0xb7791f, 1, null, 4); this.tW = flat(0x23824f, 1, null, 4);
    const label = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w * 400); c.height = Math.round(h * 400); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; const m = flat(0xffffff, 1, t, 4); m.scale.set(w, 1, h); return { m, c, t, key: '' }; };
    this.lS = label(1.3, 0.16); this.lV = label(1.25, 0.26); this.lM = label(1.25, 0.26);
    this.setRect(this.zN, X0, X1, HAZ - 0.005, HAZ + 0.005);
  }
  setRect(m, xa, xb, za, zb, y = 0.0175) { m.position.set((xa + xb) / 2, y, (za + zb) / 2); m.scale.set(Math.max(1e-4, xb - xa), 1, Math.max(1e-4, zb - za)); }
  drawLabel(L, key, lines) { if (L.key === key) return; L.key = key; const g = L.c.getContext('2d'); g.clearRect(0, 0, L.c.width, L.c.height); g.textAlign = 'left'; g.textBaseline = 'middle'; let y = lines.length > 1 ? 30 : L.c.height / 2; for (const [txt, font, col] of lines) { g.font = font; g.fillStyle = col; g.fillText(txt, 2, y); y += 44; } L.t.needsUpdate = true; }
  updateZones() {
    const eP = this.edgeP, intr = eP > WALK, mg = WALK - eP, dx = DIMX, w = X1 - X0, d = eP - HAZ;
    this.setRect(this.zP, X0, X1, HAZ, Math.min(eP, WALK));
    this.setRect(this.zH, X0, X1, HAZ, eP, 0.018); this.hatchTex.repeat.set(w / 0.12, d / 0.12); this.hatchTex.offset.set(0, -(d / 0.12));
    this.zW.visible = !intr; this.zI.visible = intr; if (intr) this.setRect(this.zI, X0, X1, WALK, eP); else this.setRect(this.zW, X0, X1, eP, WALK);
    this.setRect(this.zEdge, X0, X1, eP - 0.009, eP + 0.009, 0.0185);
    this.setRect(this.zL, X0 - 0.005, X0 + 0.005, HAZ, eP); this.setRect(this.zR, X1 - 0.005, X1 + 0.005, HAZ, eP);
    const col = mg >= 0.1 ? 0x23824f : mg >= 0 ? 0xb7791f : 0xc0392b, css = mg >= 0.1 ? '#23824F' : mg >= 0 ? '#B7791F' : '#C0392B';
    this.setRect(this.dVar, dx - 0.009, dx + 0.009, HAZ + 1.18, eP); this.setRect(this.tE, dx - 0.07, dx + 0.07, eP - 0.0065, eP + 0.0065);
    this.setRect(this.dMar, dx - 0.009, dx + 0.009, Math.min(eP, WALK), Math.max(eP, WALK)); this.setRect(this.tW, dx - 0.07, dx + 0.07, WALK - 0.0065, WALK + 0.0065);
    this.dMar.material.color.setHex(col); this.tW.material.color.setHex(col);
    const sTxt = 'S = ' + fmt(S_of(this.T) / 1000, 2) + ' m', vTxt = fmt(1.6 * this.T, 2) + ' m', mTxt = (mg >= 0 ? '+' : '−') + fmt(Math.abs(mg) * 1000, 0) + ' mm';
    this.drawLabel(this.lS, sTxt, [[sTxt, '600 46px IBM Plex Mono, monospace', '#C0392B']]);
    this.drawLabel(this.lV, vTxt, [[vTxt, '600 48px IBM Plex Mono, monospace', '#B7791F'], ['1600 mm/s × T', '500 33px IBM Plex Sans, sans-serif', '#B7791F']]);
    this.drawLabel(this.lM, mTxt + css, [[mTxt, '600 48px IBM Plex Mono, monospace', css], [mg >= 0 ? 'marge avant l’allée' : 'dans l’allée', '500 33px IBM Plex Sans, sans-serif', css]]);
    this.lS.m.position.set(X0 + 0.06 + 0.65, 0.019, eP - 0.10);
    this.lV.m.position.set(dx + 0.12 + 0.625, 0.019, (HAZ + 1.18 + eP) / 2); this.lM.m.position.set(dx + 0.12 + 0.625, 0.019, Math.max((eP + WALK) / 2, (HAZ + 1.18 + eP) / 2 + 0.27));
  }
  buildWalkway() {
    const sc = this.scene, band = new THREE.Mesh(new THREE.PlaneGeometry(40, L.walkFar - L.walkNear), new THREE.MeshStandardMaterial({ color: 0xcdd8d3, roughness: 0.95 })); band.rotation.x = -Math.PI / 2; band.position.set(1, 0.004, (L.walkNear + L.walkFar) / 2); band.receiveShadow = true; sc.add(band);
    for (const z of [L.walkNear + 0.04, L.walkFar - 0.04]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.08), new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.8 })); l.rotation.x = -Math.PI / 2; l.position.set(1, 0.006, z); l.receiveShadow = true; sc.add(l); }
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.fillStyle = 'rgba(28,38,46,0.55)'; g.font = '600 64px IBM Plex Sans, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ALLÉE', 256, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(3.25, 0.008, 3.25); sc.add(m);
  }
  // distance walked during the stopping time (drawn at the moment of a protective stop)
  buildMarker() {
    const c = document.createElement('canvas'); c.width = 640; c.height = 150; this.mcv = c; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.mtex = t;
    const g = new THREE.Group(); this.marker = g; g.visible = false; this.scene.add(g);
    this.mLine = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); this.mLine.rotation.x = -Math.PI / 2; g.add(this.mLine);
    this.mA = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.03), this.mLine.material); this.mA.rotation.x = -Math.PI / 2; g.add(this.mA); this.mB = this.mA.clone(); g.add(this.mB);
    this.mLab = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })); this.mLab.rotation.x = -Math.PI / 2; g.add(this.mLab);
  }
  setMarker(x, zDetect, zNow) {
    const g = this.marker; g.visible = true; const len = Math.max(0.002, Math.abs(zDetect - zNow)), y = 0.02;
    this.mLine.scale.y = len; this.mLine.position.set(x + 0.32, y, (zDetect + zNow) / 2); this.mA.position.set(x + 0.32, y, zDetect); this.mB.position.set(x + 0.32, y, zNow); this.mLab.position.set(x + 0.86, y, (zDetect + zNow) / 2);
    const c = this.mcv, k = c.getContext('2d'); k.clearRect(0, 0, c.width, c.height); k.fillStyle = 'rgba(28,38,46,0.88)'; k.beginPath(); k.roundRect(0, 20, 640, 110, 22); k.fill(); k.fillStyle = '#fff'; k.font = '600 54px IBM Plex Mono, monospace'; k.textBaseline = 'middle'; k.textAlign = 'center'; k.fillText(fmt(len * 1000, 0) + ' mm en ' + fmt(this.trip ? Math.min(this.trip.t, this.T) : this.T, 2) + ' s', 320, 78); this.mtex.needsUpdate = true;
  }
  // ---------- people ----------
  // Walkway traffic keeps to two lanes, one per direction; nobody overtakes and walkers give way to anyone ahead.
  addWalker(lane) {
    const p = makePerson(false), dir = lane === 0 ? 1 : -1; p.x = dir > 0 ? -9 : 11; p.z = (lane === 0 ? 2.84 : 3.40) + Math.random() * 0.10; p.hx = dir; p.hz = 0; p.v0 = 1.15 + Math.random() * 0.35; p.speed = p.v0; p.kind = 'walker'; p.lane = lane; p.phase = Math.random() * 6;
    this.scene.add(p.g); this.people.push(p); return p;
  }
  spawnWalkers(dt) {
    this.lanes = this.lanes || [{ t: 0.4 }, { t: 1.6 }];
    this.lanes.forEach((ln, i) => { ln.t -= dt; if (ln.t > 0) return; const ex = i === 0 ? -9 : 11; if (this.people.some(p => p.kind === 'walker' && p.lane === i && Math.abs(p.x - ex) < 1.6)) { ln.t = 0.3; return; } ln.t = 2.6 + Math.random() * 3.4; this.addWalker(i); });
  }
  // speed allowed for p along its heading: never run into someone ahead in the same corridor
  aheadLimit(p, v) {
    for (const q of this.people) { if (q === p) continue; const rx = q.x - p.x, rz = q.z - p.z, ahead = rx * p.hx + rz * p.hz, lat = Math.abs(rx * p.hz - rz * p.hx); if (ahead > 0 && ahead < 1.15 && lat < 0.4) v = Math.min(v, Math.max(0, (q.hx * p.hx + q.hz * p.hz) * q.speed) * (ahead < 0.8 ? 0.6 : 1)); }
    return v;
  }
  approach() { if (this.op || this.pendingOp || !this.enabled) return false; this.pendingOp = true; return true; }
  spawnOperator() {
    const p = makePerson(true); p.kind = 'operator'; p.x = 0.26; p.z = 3.17; p.hx = 0; p.hz = -1; this.scene.add(p.g); this.people.push(p); this.op = p;
    p.plan = [{ to: [0.26, 1.22], v: K_APPROACH, gate: [-0.9, 1.4], zRel: 2.5 }, { wait: 2.2 }, { to: [L.reset.x, L.reset.z + 0.34], v: 1.3 }, { face: [0, -1], wait: 0.5 }, { press: true, wait: 0.9 }, { to: [-1.6, 3.45], v: 1.3, gate: [-2.7, 0.0] }, { to: [-9.6, 3.45], v: 1.35, lane: true }];
    p.step = 0; p.wt = 0; this.events.push({ type: 'approach' }); return true;
  }
  stepOperator(p, dt) {
    const s = p.plan[p.step]; if (!s) { this.removePerson(p); this.op = null; this.claim = null; return; }
    if (s.gate) {      // the walkway is crossed only when it is free; meanwhile nobody new enters that stretch
      if (!s.rel) this.claim = s.gate;
      if (!s.open) { if (this.people.some(q => q.kind === 'walker' && q.x > s.gate[0] && q.x < s.gate[1])) { p.speed = 0; return; } s.open = true; }
      if (s.zRel && p.z < s.zRel && !s.rel) { s.rel = true; this.claim = null; }
    }
    if (s.to) {
      const dx = s.to[0] - p.x, dz = s.to[1] - p.z, d = Math.hypot(dx, dz); if (d > 1e-6) { p.hx = dx / d; p.hz = dz / d; }
      const v = s.lane ? this.aheadLimit(p, s.v) : s.v, mv = v * dt;
      if (d <= mv) { p.x = s.to[0]; p.z = s.to[1]; p.speed = 0; p.step++; if (s.gate) this.claim = null; } else { p.x += p.hx * mv; p.z += p.hz * mv; p.speed = v; }
    } else {
      p.speed = 0; if (s.face) { p.hx = s.face[0]; p.hz = s.face[1]; }
      if (s.press) { p.reach = -1.25 * Math.sin(Math.min(1, p.wt / 0.9) * Math.PI); if (p.wt > 0.4 && !s.done) { s.done = true; this.pressReset(); } }
      p.wt += dt; if (p.wt >= s.wait) { p.wt = 0; p.reach = 0; p.step++; }
    }
  }
  removePerson(p) { p.g.removeFromParent(); const i = this.people.indexOf(p); if (i >= 0) this.people.splice(i, 1); }
  clearPeople() { for (const p of [...this.people]) this.removePerson(p); this.op = null; this.pendingOp = false; this.claim = null; this.estop = false; }
  // ---------- modes ----------
  // MODE-05: immediate stop, the gripper keeps holding the part. Unlocking the button does not restart the cell:
  // it leaves a latched stop that still needs reset + start.
  estopToggle() {
    if (!this.enabled) return;
    if (!this.estop) { this.estop = true; this.mode = 5; this.rate = 0; this.trip = null; this.resume = undefined; }
    else { this.estop = false; this.mode = 4; this.trip = { t: this.T + 1, rate0: 0, stopped: true, who: null, x: 0, z: 0 }; }
  }
  estopClear() { if (!this.estop) return; this.estop = false; this.mode = 2; this.trip = null; this.rate = 1; this.resume = undefined; }
  pressReset() { if (this.mode !== 4) return false; if (this.inP) { this.events.push({ type: 'resetRefused' }); return false; } this.mode = 2; this.trip = null; this.resume = 0; this.events.push({ type: 'reset' }); return true; }
  update(dt) {
    this.time += dt;
    if (this.walkOn) this.spawnWalkers(dt);
    if (this.pendingOp && !this.people.some(q => Math.abs(q.x - 0.26) < 1.3 && q.z > 2.6)) { this.pendingOp = false; this.spawnOperator(); }
    for (const p of [...this.people]) {
      if (p.kind === 'walker') { let v = this.aheadLimit(p, p.v0); if (this.claim) { const c = this.claim, inside = p.x > c[0] && p.x < c[1], edge = p.hx > 0 ? c[0] : c[1], gap = (edge - p.x) * p.hx; if (!inside && gap > 0 && gap < 0.9) v = 0; } p.speed += (v - p.speed) * Math.min(1, dt * 6); if (v === 0 && p.speed < 0.05) p.speed = 0; p.x += p.hx * p.speed * dt; if (p.x < -10 || p.x > 12) { this.removePerson(p); continue; } } else this.stepOperator(p, dt);
      placePerson(p, dt);
    }
    if (!this.enabled) { this.inP = this.inW = false; this.reduced = false; return; }
    const eP = this.edgeP, zO = this.zOuter; let inP = false, inW = false, who = null;
    if (this.detect !== false) for (const p of this.people) for (const c of p.legPts) {
      if (c[0] > X0 - LEG_R && c[0] < X1 + LEG_R && c[1] > HAZ - LEG_R) { if (c[1] - LEG_R < eP) { inP = true; who = who || p; } else if (c[1] - LEG_R < zO) inW = true; }
    }
    this.inP = inP; this.inW = inW;
    if (this.estop) { this.mode = 5; this.rate = 0; }
    else if (this.mode !== 4) {
      if (inP) { this.mode = 4; this.trip = { t: 0, rate0: this.rate, x: who.x, z: who.z, who }; this.stops++; this.events.push({ type: 'trip', who: who.kind }); }
      else { this.mode = inW ? 3 : 2; if (this.resume !== undefined) { this.resume += dt; this.rate = Math.min(1, this.resume / 0.6); if (this.rate >= 1) this.resume = undefined; } else this.rate = 1; }
    }
    if (this.mode === 4) {
      const tr = this.trip; tr.t += dt; this.rate = Math.max(0, tr.rate0 * (1 - tr.t / this.T));
      if (tr.who && tr.who.kind === 'operator' && tr.t <= this.T + 0.6) { const zn = tr.t <= this.T ? tr.who.z : (tr.zStop ?? (tr.zStop = tr.who.z)); this.setMarker(tr.x, tr.z, zn); }
      if (tr.t > this.T && !tr.stopped) { tr.stopped = true; this.events.push({ type: 'stopped' }); }
    } else if (this.marker.visible && !(this.op && this.op.step < 2)) this.marker.visible = false;
    this.reduced = this.mode === 3;
    const k = Math.min(1, dt * 8 + 0.02); this.alarm += ((this.mode === 4 ? 1 : 0) - this.alarm) * k; this.warn += ((this.mode === 3 ? 1 : 0) - this.warn) * k;
    this.fanMat.uniforms.uTime.value = this.time; this.fanMat.uniforms.uAlarm.value = this.alarm; this.fanMat.uniforms.uWarn.value = this.warn;
    this.updateFan();
    // stack light + reset lamp
    const st = this.W.stack, on = (m, v) => { m.emissiveIntensity = v; };
    const md = this.lightMode || this.mode; on(st.green, md === 2 ? 1.6 : 0.02); on(st.amber, md === 3 ? 1.8 : 0.02); on(st.red, md === 4 ? 1.9 : md === 5 ? (Math.sin(this.time * 9) > 0 ? 2.2 : 0.15) : 0.02);
    if (this.W.estopBtn) this.W.estopBtn.position.y = this.estop ? 0.812 : 0.82;
    this.W.resetMat.emissiveIntensity = this.mode === 4 && !inP ? 0.9 + 0.9 * Math.sin(this.time * 8) : 0;
  }
}
