// Static world: generic vertical machining centre (no brand, dimensions are our assumption), cell furniture.
import * as THREE from 'three';
import { M, box, bb, cyl, label, extrudeXY, rect } from './mat.js';
import { L, PART, nest } from './layout.js';

export function buildWorld(scene) {
  const W = {};
  // ---------- floor ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xdfe4e7, roughness: 0.92, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // ---------- CNC-04 ----------
  const mc = new THREE.Group(); scene.add(mc); W.machine = mc;
  const { x0: X0, x1: X1, zb: ZB, h: H } = L.mach, D = L.door;
  mc.add(bb(X0 + 0.03, X1 - 0.03, 0, 0.12, ZB + 0.03, -0.03, M.paintDark, 0.01));
  const front = extrudeXY(rect(X0, 0.12, X1, H), [rect(D.x0, D.y0, D.x1, D.y1)], 0.05, M.paint, 0.006); front.position.z = -0.056; mc.add(front); W.front = front;
  mc.add(bb(X0, X0 + 0.05, 0.12, H, ZB, -0.05, M.paint), bb(X1 - 0.05, X1, 0.12, H, ZB, -0.05, M.paint), bb(X0, X1, 0.12, H, ZB, ZB + 0.05, M.paint));
  const roof = bb(X0, X1, H - 0.05, H, ZB, -0.05, M.paint); mc.add(roof); W.roof = roof;
  mc.add(bb(X0 - 0.004, X1 + 0.004, 1.98, 2.10, -0.02, 0.004, M.trim, 0.003));               // styling band, no brand
  const tag = label('CNC-04', 0.40, 0.11, { bg: '#2F4B5E', fg: '#FFFFFF', font: '600 84px IBM Plex Sans, sans-serif' }); tag.position.set(0.08, 2.04, 0.007); mc.add(tag);
  // interior liners
  mc.add(bb(X0 + 0.05, X1 - 0.05, 0.12, 0.56, ZB + 0.05, -0.06, M.inner, 0), bb(X0 + 0.051, X1 - 0.051, 0.56, H - 0.051, ZB + 0.051, ZB + 0.06, M.inner, 0));
  mc.add(bb(X0 + 0.05, X0 + 0.058, 0.56, H - 0.05, ZB + 0.05, -0.06, M.inner, 0), bb(X1 - 0.058, X1 - 0.05, 0.56, H - 0.05, ZB + 0.05, -0.06, M.inner, 0), bb(X0 + 0.05, X1 - 0.05, H - 0.058, H - 0.05, ZB + 0.05, -0.06, M.inner, 0));
  // control pendant (generic)
  const pend = new THREE.Group(); pend.position.set(1.98, 1.36, 0.06); pend.rotation.y = -0.25; mc.add(pend);
  pend.add(box(0.42, 0.62, 0.10, M.paintDark, 0, 0, 0, 0.012));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.20), M.screen); scr.position.set(0, 0.14, 0.052); pend.add(scr);
  for (let i = 0; i < 12; i++) pend.add(box(0.035, 0.022, 0.01, M.inner, -0.11 + (i % 4) * 0.073, -0.06 - Math.floor(i / 4) * 0.045, 0.052, 0.003));
  pend.add(cyl(0.022, 0.03, M.red, 0.13, -0.24, 0.06, 'z'), cyl(0.03, 0.012, M.yellow, 0.13, -0.24, 0.052, 'z'));
  // door (slides toward +x)
  const door = new THREE.Group(); mc.add(door); W.door = door;
  const dp = extrudeXY(rect(D.x0 - 0.03, D.y0 - 0.03, D.x1 + 0.03, D.y1 + 0.03), [rect(0.72, 1.02, 1.28, 1.64)], 0.028, M.paint, 0.004); dp.position.z = -0.105; door.add(dp);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.62), M.glass); win.position.set(1.0, 1.33, -0.09); door.add(win);
  door.add(cyl(0.012, 0.5, M.steel, 0.66, 1.25, -0.062, 'y'), box(0.03, 0.03, 0.03, M.steel, 0.66, 1.48, -0.07), box(0.03, 0.03, 0.03, M.steel, 0.66, 1.02, -0.07));
  W.setDoor = o => { door.position.x = 0.84 * o; };
  // door-open sensor PC-11
  mc.add(bb(D.x1 + 0.02, D.x1 + 0.07, D.y1 - 0.12, D.y1 - 0.06, 0, 0.03, M.yellow, 0.004));
  // machine status lamp (generic): green = machining, amber = stopped, waiting to be loaded
  mc.add(cyl(0.014, 0.16, M.steel, 2.05, H + 0.08, -0.25), cyl(0.04, 0.012, M.dark, 2.05, H + 0.295, -0.25));
  W.mlamp = {};
  [['green', 0x23a35a, H + 0.19], ['amber', 0xf0a000, H + 0.255]].forEach(([k, c, y]) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, emissive: c, emissiveIntensity: 0, transparent: true, opacity: 0.92 }); const l = cyl(0.036, 0.06, m, 2.05, y, -0.25); l.castShadow = false; mc.add(l); W.mlamp[k] = m; });
  // column, head, spindle
  mc.add(bb(0.70, 1.30, 0.56, 2.30, ZB + 0.06, -1.05, M.paint, 0.01));
  const head = new THREE.Group(); mc.add(head); W.head = head;
  head.add(bb(0.84, 1.16, 0.21, 0.66, -1.05, -0.34, M.paint, 0.015), cyl(0.075, 0.10, M.steel, 1.0, 0.16, -0.5), cyl(0.085, 0.02, M.dark, 1.0, 0.205, -0.5));
  const spin = new THREE.Group(); spin.position.set(1.0, 0, -0.5); head.add(spin); W.spin = spin;
  spin.add(cyl(0.022, 0.06, M.steel, 0, 0.08, 0, 'y', 24, 0.032), cyl(0.008, 0.05, M.bright, 0, 0.025, 0, 'y', 12), box(0.02, 0.012, 0.05, M.dark, 0, 0.095, 0, 0.002));
  W.setHead = y => { head.position.y = y; };
  // saddle + table (table carries the vice; moves in z between load and cutting positions)
  mc.add(bb(0.60, 1.40, 0.56, 0.70, -0.95, -0.15, M.paintDark, 0.01));
  const table = new THREE.Group(); mc.add(table); W.table = table;
  table.add(bb(0.42, 1.58, 0.70, 0.80, -0.62, -0.125, M.steel, 0.006));
  for (let i = 0; i < 4; i++) table.add(bb(0.42, 1.58, 0.792, 0.8005, -0.56 + i * 0.125, -0.545 + i * 0.125, M.dark, 0));
  // vice: fixed jaw at the back, moving jaw toward the door. Rest pads = Z stop (seat of the part).
  const vx = L.vice.x, vz = L.vice.z, hw = PART.FC.d / 2, jt = L.vice.bed + PART.FC.h / 2 - 0.0055;
  table.add(bb(vx - 0.10, vx + 0.10, 0.80, 0.90, vz - 0.20, vz + 0.168, M.vice, 0.008));
  table.add(bb(vx - 0.075, vx + 0.075, 0.90, jt, vz - hw - 0.03, vz - hw, M.steel, 0.002), bb(vx - 0.09, vx + 0.09, 0.90, jt - 0.006, vz - hw - 0.11, vz - hw - 0.03, M.vice, 0.004));
  const zs = M.bright.clone(); zs.color.set(0xf2d38a); W.zstopMat = zs;
  table.add(bb(vx - 0.055, vx + 0.055, 0.90, L.vice.bed, vz - hw + 0.004, vz - hw + 0.022, zs, 0.001), bb(vx - 0.055, vx + 0.055, 0.90, L.vice.bed, vz + hw - 0.022, vz + hw - 0.004, zs, 0.001));
  const jaw = new THREE.Group(); table.add(jaw); W.jaw = jaw;
  jaw.add(bb(vx - 0.075, vx + 0.075, 0.90, jt, vz + hw, vz + hw + 0.03, M.steel, 0.002), bb(vx - 0.09, vx + 0.09, 0.90, jt - 0.006, vz + hw + 0.03, vz + hw + 0.085, M.vice, 0.004));
  table.add(box(0.05, 0.07, 0.10, M.steel, vx + 0.125, 0.845, vz + 0.02, 0.006), cyl(0.012, 0.06, M.dark, vx + 0.165, 0.85, vz + 0.02, 'x'));   // hydraulic block on the side
  W.setJaw = o => { jaw.position.z = 0.012 * o; };          // o = 1 open, 0 clamped
  W.setTable = z => { table.position.z = z; };
  const lamp = new THREE.PointLight(0xfff2dc, 2.2, 3.2, 1.6); lamp.position.set(1.0, 2.05, -0.28); mc.add(lamp); W.lamp = lamp;
  mc.add(bb(0.86, 1.14, 2.30, 2.335, -0.34, -0.22, M.pad, 0.004));

  // ---------- cell: one pre-assembled plate (3-day install) ----------
  const cell = new THREE.Group(); scene.add(cell); W.cell = cell;
  const cx = new THREE.Group(); cell.add(cx); W.cellOnly = cx;       // everything that only exists with the robot cell
  const plate = extrudeXY([[0, 0.02], [2.0, 0.02], [2.0, 0.95], [0.515, 0.95], [0.515, 0.28], [0, 0.28]], null, 0.012, M.plate, 0.002);
  plate.rotation.x = Math.PI / 2; plate.position.y = 0.014; cx.add(plate);
  for (const [x, z] of [[0.06, 0.08], [1.94, 0.08], [1.94, 0.89], [0.6, 0.89], [1.2, 0.08], [1.25, 0.89]]) cx.add(cyl(0.012, 0.012, M.steel, x, 0.02, z, 'y', 6));
  // pedestal
  const B = L.base;
  cx.add(box(0.30, 0.02, 0.30, M.trim, B.x, 0.026, B.z, 0.004), box(0.19, B.y - 0.056, 0.19, M.trim, B.x, (B.y - 0.02 + 0.036) / 2, B.z, 0.012), box(0.25, 0.02, 0.25, M.steel, B.x, B.y - 0.01, B.z, 0.004));
  // cabinet PC-09 with its single connector to CNC-04
  cx.add(bb(0.03, 0.50, 0.016, 0.80, 0.03, 0.27, M.cabinet, 0.008), bb(0.045, 0.485, 0.05, 0.77, 0.268, 0.274, M.paint, 0.003), box(0.015, 0.10, 0.012, M.dark, 0.44, 0.45, 0.28, 0.003));
  cx.add(bb(0.225, 0.315, 0.98, 1.08, 0.0, 0.045, M.orange, 0.006), bb(0.24, 0.30, 0.96, 0.985, 0.005, 0.04, M.dark, 0.004));
  const cab = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.27, 0.80, 0.12), new THREE.Vector3(0.27, 0.88, 0.10), new THREE.Vector3(0.27, 0.94, 0.045), new THREE.Vector3(0.27, 0.965, 0.024)]), 20, 0.014, 10), M.cable); cab.castShadow = true; cx.add(cab);
  W.estopBtn = cyl(0.022, 0.03, M.red, 0.42, 0.82, 0.20, 'y'); cx.add(cyl(0.03, 0.012, M.yellow, 0.42, 0.806, 0.20, 'y'), W.estopBtn);   // e-stop on the cabinet
  // stack light PC-05
  cx.add(cyl(0.012, 0.55, M.steel, 0.10, 1.075, 0.15), cyl(0.034, 0.02, M.dark, 0.10, 1.36, 0.15), cyl(0.034, 0.012, M.dark, 0.10, 1.556, 0.15));
  W.stack = {};
  [['green', 0x23a35a, 1.40], ['amber', 0xf0a000, 1.46], ['red', 0xd63a2a, 1.52]].forEach(([k, c, y]) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, emissive: c, emissiveIntensity: 0, transparent: true, opacity: 0.92 });
    const lens = cyl(0.03, 0.058, m, 0.10, y, 0.15); lens.castShadow = false; cx.add(lens); W.stack[k] = m;
  });
  // tray cart: wheeled, 12 nests (3 x 4), docked on pins
  const tray = new THREE.Group(); cell.add(tray); W.tray = tray;
  const T = L.tray, tx0 = 0.03, tx1 = 0.49, tz0 = 0.29, tz1 = 0.92;
  tray.add(bb(tx0, tx1, T.top - 0.022, T.top, tz0, tz1, M.urTube, 0.004), bb(tx0 + 0.02, tx1 - 0.02, 0.22, 0.24, tz0 + 0.02, tz1 - 0.02, M.steel, 0.004));
  for (const x of [tx0 + 0.015, tx1 - 0.015]) for (const z of [tz0 + 0.015, tz1 - 0.015]) {
    tray.add(box(0.028, T.top - 0.022 - 0.09, 0.028, M.trim, x, (T.top - 0.022 + 0.09) / 2, z, 0.004), cyl(0.04, 0.026, M.rubber, x, 0.04, z, 'x'), box(0.04, 0.05, 0.05, M.steel, x, 0.085, z, 0.004));
  }
  tray.add(cyl(0.012, tx1 - tx0, M.steel, (tx0 + tx1) / 2, 0.93, tz1 + 0.03, 'x'), box(0.02, 0.15, 0.02, M.steel, tx0 + 0.02, 0.86, tz1 + 0.02, 0.004), box(0.02, 0.15, 0.02, M.steel, tx1 - 0.02, 0.86, tz1 + 0.02, 0.004));
  const pinG = new THREE.CylinderGeometry(0.005, 0.005, 0.014, 10);
  const pins = new THREE.InstancedMesh(pinG, M.steel, 12 * 4); let pi = 0; const mt = new THREE.Matrix4();
  for (let i = 0; i < 12; i++) { const n = nest(i); for (const sx of [-1, 1]) for (const sz of [-1, 1]) pins.setMatrixAt(pi++, mt.makeTranslation(n.x + sx * 0.07, T.top + 0.007, n.z + sz * 0.0715)); }
  pins.castShadow = true; tray.add(pins);
  cx.add(cyl(0.012, 0.03, M.yellow, 0.16, 0.03, 0.262, 'y', 16, 0.004), cyl(0.012, 0.03, M.yellow, 0.38, 0.03, 0.262, 'y', 16, 0.004));   // docking pins
  // centring station PC-08 (passive V nest)
  const S = L.station, hp = PART.FC.w / 2;
  cx.add(box(0.05, S.top - 0.02 - 0.014, 0.05, M.trim, S.x, (S.top - 0.02 + 0.014) / 2, S.z, 0.006), box(0.22, 0.02, 0.22, M.anod, S.x, S.top - 0.01, S.z, 0.004));
  cx.add(bb(S.x - hp - 0.012, S.x - hp, S.top, S.top + 0.018, S.z - hp - 0.012, S.z + 0.07, M.bright, 0.002), bb(S.x - hp - 0.012, S.x + 0.07, S.top, S.top + 0.018, S.z - hp - 0.012, S.z - hp, M.bright, 0.002));
  // output bin (lined), two columns
  const Bn = L.bin, bx0 = 1.41, bx1 = 1.71, bz0 = 0.50, bz1 = 0.70, bt = Bn.floor + 0.20;
  cell.add(bb(bx0 - 0.01, bx1 + 0.01, Bn.floor - 0.012, Bn.floor - 0.002, bz0 - 0.01, bz1 + 0.01, M.steel, 0.002), bb(bx0, bx1, Bn.floor - 0.004, Bn.floor, bz0, bz1, M.liner, 0));
  cell.add(bb(bx0 - 0.01, bx0, Bn.floor, bt, bz0 - 0.01, bz1 + 0.01, M.liner, 0.002), bb(bx1, bx1 + 0.01, Bn.floor, bt, bz0 - 0.01, bz1 + 0.01, M.liner, 0.002), bb(bx0, bx1, Bn.floor, bt, bz0 - 0.01, bz0, M.liner, 0.002), bb(bx0, bx1, Bn.floor, bt, bz1, bz1 + 0.01, M.liner, 0.002));
  for (const x of [bx0 + 0.01, bx1 - 0.01]) for (const z of [bz0, bz1]) cell.add(box(0.025, Bn.floor - 0.026, 0.025, M.trim, x, (Bn.floor - 0.012 + 0.014) / 2, z, 0.004));
  // safety laser scanner PC-04 (scan plane 300 mm above the floor)
  const Sc = L.scanner;
  cx.add(bb(Sc.x - 0.03, Sc.x + 0.03, 0.014, 0.225, Sc.z - 0.075, Sc.z - 0.035, M.steel, 0.004), bb(Sc.x - 0.052, Sc.x + 0.052, 0.225, 0.345, Sc.z - 0.085, Sc.z - 0.005, M.yellow, 0.01), bb(Sc.x - 0.054, Sc.x + 0.054, 0.345, 0.375, Sc.z - 0.087, Sc.z - 0.003, M.dark, 0.008));
  cx.add(cyl(0.046, 0.05, M.dark, Sc.x, Sc.y, Sc.z - 0.03, 'y', 32));
  // operator post outside the protective field: touch screen (French), reset, e-stop, key selector  PC-05 / PC-10
  const R = L.reset, post = new THREE.Group(); post.position.set(R.x, 0, R.z); scene.add(post); W.post = post;
  post.add(box(0.22, 0.012, 0.22, M.steel, 0, 0.006, 0, 0.003), cyl(0.025, 1.0, M.trim, 0, 0.5, 0), box(0.30, 0.40, 0.09, M.cabinet, 0, 1.19, 0, 0.012));
  const hmi = label('', 0.22, 0.14, { px: 440 }); hmi.position.set(0, 1.26, 0.0465); post.add(hmi); W.hmi = hmi;
  post.add(cyl(0.032, 0.008, M.yellow, -0.08, 1.07, 0.047, 'z'), cyl(0.022, 0.03, M.red, -0.08, 1.07, 0.06, 'z'));
  const resetMat = new THREE.MeshStandardMaterial({ color: 0x1f6fd0, roughness: 0.4, emissive: 0x2a86ff, emissiveIntensity: 0 }); W.resetMat = resetMat;
  post.add(cyl(0.02, 0.018, resetMat, 0.0, 1.07, 0.052, 'z'), cyl(0.026, 0.006, M.steel, 0.0, 1.07, 0.047, 'z'), cyl(0.016, 0.02, M.dark, 0.08, 1.07, 0.052, 'z'), box(0.006, 0.02, 0.012, M.steel, 0.08, 1.07, 0.066, 0.001));
  return W;
}
export function drawHMI(W, lines, color) {
  const c = W.hmi.userData.canvas, g = c.getContext('2d');
  g.fillStyle = '#F4F7F8'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = color; g.fillRect(0, 0, c.width, 56);
  g.fillStyle = '#fff'; g.font = '600 30px IBM Plex Sans, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(lines[0], 18, 30);
  g.fillStyle = '#1C262E'; g.font = '500 30px IBM Plex Sans, sans-serif'; g.fillText(lines[1] || '', 18, 110); g.fillStyle = '#66757F'; g.font = '500 24px IBM Plex Mono, monospace'; g.fillText(lines[2] || '', 18, 170); g.fillText(lines[3] || '', 18, 215);
  W.hmi.material.map.needsUpdate = true;
}
