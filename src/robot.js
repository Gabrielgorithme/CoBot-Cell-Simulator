// UR16e built from UR's public ROS description meshes (BSD-3-Clause) + our twin 90° gripper bracket.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { JOINTS, BASE_INERTIA, MESH_OFFSET, TIP_L, TOOL_Z } from './kin.js';
import { M, box, cyl } from './mat.js';
import { L, PART } from './layout.js';

function b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
const fixed = m => { const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(m); return g; };

export async function buildRobot(scene, glbB64) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((res, rej) => loader.parse(b64ToBuf(glbB64), '', res, rej));
  gltf.scene.updateMatrixWorld(true);
  const geo = {}, v = new THREE.Vector3();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    let name = o.name; if (!name.includes('__')) name = o.parent.name;
    const pos = o.geometry.attributes.position, arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); if (o.geometry.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(o.geometry.index.array), 1));
    geo[name] = toCreasedNormals(g, 0.7);
  });
  const mats = { cast: M.urCast, tube: M.urTube, cap: M.urCap, seal: M.urSeal };
  const visual = link => { const g = fixed(MESH_OFFSET[link]); for (const k in geo) if (k.startsWith(link + '__')) { const m = new THREE.Mesh(geo[k], mats[k.split('__')[1]]); m.castShadow = m.receiveShadow = true; g.add(m); } return g; };

  const root = new THREE.Group(); root.position.set(L.base.x, L.base.y, L.base.z); root.rotation.x = -Math.PI / 2; scene.add(root); root.updateMatrix();
  const bi = fixed(BASE_INERTIA); root.add(bi); bi.add(visual('base'));
  const links = ['shoulder', 'upperarm', 'forearm', 'wrist1', 'wrist2', 'wrist3'], rot = []; let parent = bi;
  for (let i = 0; i < 6; i++) { const j = fixed(JOINTS[i]); parent.add(j); const r = new THREE.Group(); j.add(r); r.add(visual(links[i])); rot.push(r); parent = r; }
  const flange = rot[5];

  // twin flange: gripper A along +X of the flange frame, gripper B along -X (back to back), fingers open along Y
  const tool = new THREE.Group(); flange.add(tool);
  tool.add(cyl(0.048, 0.014, M.dark, 0, 0, 0.007, 'z'), box(0.074, 0.10, 0.07, M.anod, 0, 0, TOOL_Z, 0.008), box(0.076, 0.012, 0.072, M.urCap, 0, 0, TOOL_Z, 0.002));
  const mk = sign => {
    const g = new THREE.Group(), X = new THREE.Vector3(0, 1, 0), Y = new THREE.Vector3(-sign, 0, 0), Z = new THREE.Vector3().crossVectors(X, Y);
    g.matrixAutoUpdate = false; g.matrix.makeBasis(X, Y, Z).setPosition(0, 0, TOOL_Z); tool.add(g);
    g.add(box(0.07, 0.022, 0.07, M.steel, 0, -0.046, 0, 0.004), box(0.13, 0.08, 0.078, M.anod, 0, -0.096, 0, 0.01), box(0.132, 0.008, 0.05, M.steel, 0, -0.07, 0, 0.002), box(0.156, 0.012, 0.042, M.steel, 0, -0.141, 0, 0.002));
    const fingers = [-1, 1].map(sg => {
      const fg = new THREE.Group(); g.add(fg);
      fg.add(box(0.014, TIP_L - 0.145, 0.036, M.steel, sg * 0.007, -(0.145 + TIP_L) / 2, 0, 0.002), box(0.004, PART.FC.h / 2 + 0.002, 0.036, M.pad, sg * -0.0012, -(TIP_L - PART.FC.h / 4), 0, 0.001));
      fg.userData.sg = sg; return fg;
    });
    const tip = new THREE.Group(); tip.position.set(0, -TIP_L, 0); g.add(tip);
    const G = { group: g, tip, fingers, open: 1, part: null, setOpen(o) { this.open = o; for (const f of fingers) f.position.x = f.userData.sg * (PART.FC.w / 2 + 0.0012 + 0.009 * o); } };
    G.setOpen(1); return G;
  };
  const A = mk(1), Bg = mk(-1);
  const q = [0, 0, 0, 0, 0, 0];
  return { root, rot, flange, tool, A, B: Bg, q, setQ(nq) { for (let i = 0; i < 6; i++) { q[i] = nq[i]; rot[i].rotation.z = nq[i]; } } };
}
