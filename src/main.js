import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, drawHMI } from './scene.js';
import { buildRobot } from './robot.js';
import { Sim } from './sim.js';
import { Safety } from './safety.js';
import { Today } from './today.js';
import { initUI } from './ui.js';
import { DEFAULTS } from './model.js';
import { L } from './layout.js';

const CAMS = {
  wide: { p: [6.2, 3.7, 4.5], t: [1.0, 0.55, 1.0] },
  vice: { p: [1.92, 1.42, 0.92], t: [1.0, 1.06, -0.28] },
  top: { p: [1.0, 8.6, 2.75], t: [1.0, 0, 1.7] },
  eye: { p: [1.85, 1.66, 3.7], t: [0.9, 0.95, 0.2] },
  approach: { p: [3.7, 2.5, 5.2], t: [0.8, 0.6, 1.45] },
  swap: { p: [3.3, 2.3, 2.6], t: [1.1, 0.9, 0.15] },
};
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

async function start() {
  const canvas = document.getElementById('gl');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { document.getElementById('nogl').hidden = false; document.getElementById('hud').hidden = true; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef2f4); scene.fog = new THREE.Fog(0xeef2f4, 12, 34);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 0.55;
  const cam = new THREE.PerspectiveCamera(38, 1, 0.05, 90); cam.position.set(...CAMS.wide.p);
  const ctl = new OrbitControls(cam, canvas); ctl.target.set(...CAMS.wide.t); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.495; ctl.minDistance = 0.35; ctl.maxDistance = 18;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d1d6, 0.9));
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.6); sun.position.set(-2.5, 7, 5.5); sun.target.position.set(1, 0.6, 0.6); scene.add(sun, sun.target);
  const coarse = matchMedia('(pointer:coarse)').matches; sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096); const sc = sun.shadow.camera; sc.left = -6; sc.right = 7; sc.top = 6; sc.bottom = -5; sc.near = 1; sc.far = 24; sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015; sun.shadow.radius = 3;
  await Promise.all(['600 20px "IBM Plex Sans"', '500 20px "IBM Plex Sans"', '500 20px "IBM Plex Mono"', '600 20px "IBM Plex Mono"'].map(f => document.fonts.load(f).catch(() => {})));

  const W = buildWorld(scene);
  const robot = await buildRobot(scene, window.__UR_GLB__);
  const sim = new Sim(scene, W, robot);
  const safety = new Safety(scene, W);
  const today = new Today(scene, W);
  const app = { sim, safety, today, mode: 'live', scn: 'dual', cur: sim, set: { ...DEFAULTS }, timeScale: 1, speed: 1, paused: false, cam, ctl };

  // ghost trail of the tool point
  const TR = 220, tpos = new Float32Array(TR * 3), tcol = new Float32Array(TR * 4), tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tcol, 4));
  const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })); trail.frustumCulled = false; scene.add(trail);
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(); let tn = 0, tAcc = 0;
  const tipNow = () => { robot.A.tip.getWorldPosition(tv); robot.B.tip.getWorldPosition(tv2); return tv.y < tv2.y ? tv : tv2; };
  function pushTrail(dt, reset) {
    const p = tipNow(); if (reset) { for (let i = 0; i < TR; i++) tpos.set([p.x, p.y, p.z], i * 3); tn = 0; }
    tAcc += dt; if (tAcc < 0.03) return; tAcc = 0;
    tpos.copyWithin(3, 0, (TR - 1) * 3); tpos.set([p.x, p.y, p.z], 0);
    for (let i = 0; i < TR; i++) { const a = Math.pow(1 - i / TR, 1.6) * 0.75; tcol.set([0.82, 0.56, 0.05, a], i * 4); }
    tg.attributes.position.needsUpdate = tg.attributes.color.needsUpdate = true;
  }
  // camera presets with smooth transitions
  let camTw = null;
  app.camTo = (name, dur = 1.5) => { const c = CAMS[name]; if (!c) return; app.camName = name; const t1 = new THREE.Vector3(...c.t), p1 = new THREE.Vector3(...c.p).sub(t1).multiplyScalar(app.camK || 1).add(t1); camTw = { t: 0, dur, p0: cam.position.clone(), t0: ctl.target.clone(), p1, t1 }; };
  ctl.addEventListener('start', () => { camTw = null; });
  app.person = () => safety.approach();
  app.resetStart = () => { if (safety.mode === 4) safety.pressReset(); };
  app.estop = () => safety.estopToggle();
  app.setScenario = (k, force) => {
    if (k === app.scn && app.started && !force) return; app.started = true; app.scn = k; const robotOn = k !== 'today';
    robot.root.visible = robotOn; W.cellOnly.visible = robotOn; W.post.visible = robotOn; trail.visible = robotOn; safety.setEnabled(robotOn);
    if (robotOn) { today.clear(); sim.setScenario(k); app.cur = sim; } else { sim.clearParts(); today.reset(); app.cur = today; }
    app.uiScenario(); pushTrail(0, true);
  };
  app.resetAll = () => { safety.clearPeople(); safety.mode = 2; safety.trip = null; safety.rate = 1; if (app.scn === 'today') today.reset(); else sim.reset(); app.uiReset(); pushTrail(0, true); };
  initUI(app); app.started = true;
  // guided tour: ten steps, driven by the two buttons of the CoBot-Cell card
  const rampT = to => { if (Math.abs(to - safety.T) < 1e-6) { app.tRamp = null; return; } app.tRamp = { to, from: safety.T, t: 0 }; };
  const BEATS = [
    { name: 'Aujourd’hui : la machine attend', run: () => { app.setScenario('today'); app.camTo('wide'); } },
    { name: 'Pince simple : deux entrées', run: () => { app.setScenario('single'); app.camTo('swap'); rampT(0.20); } },
    { name: 'Pince double : la cellule', run: () => { app.setScenario('dual'); app.camTo('wide'); rampT(0.20); } },
    { name: 'Pince double : l’échange', run: () => { app.setScenario('dual'); app.camTo('vice'); } },
    { name: 'Les champs de sécurité', run: () => { app.setScenario('dual'); app.camTo('top'); } },
    { name: 'Une personne approche', run: () => { app.setScenario('dual'); app.camTo('approach'); app.person(); } },
    { name: 'Réarmement et redémarrage', run: () => { app.camTo('wide'); app.resetStart(); } },
    { name: 'Temps d’arrêt à 0,40 s', run: () => { app.camTo('top'); rampT(0.40); } },
    { name: 'Retour à 0,20 s', run: () => { rampT(0.20); app.resetStart(); } },
    { name: 'Comparaison des exigences', cmp: true, run: () => { rampT(0.20); app.setScenario('dual'); app.camTo('wide'); app.resetStart(); } },
  ];
  app.beat = -1;
  app.goBeat = i => { i = Math.max(0, Math.min(BEATS.length - 1, i)); app.beat = i; safety.estopClear();   // a tour step sets its own state: an emergency stop left on from the options must not block it
    app.setCompare(!!BEATS[i].cmp); BEATS[i].run(); app.uiBeat(i, BEATS.length, BEATS[i].name); };
  app.restart = () => { app.setCompare(false); app.resetAll(); app.setSpeedIdx(6); app.goBeat(0); };
  // on opening: guided tour at step 1, playback at x4
  app.setSpeedIdx(6); app.goBeat(0);
  const hmiState = { k: '' };
  function hmi() {
    const md = safety.mode, k = md + '|' + sim.cycles + '|' + (safety.inP ? 1 : 0); if (k === hmiState.k) return; hmiState.k = k;
    if (md === 5) drawHMI(W, ['ARRÊT D’URGENCE', 'La pince garde la pièce', 'MODE-05', 'pièces : ' + sim.cycles], '#C0392B');
    else if (md === 4) drawHMI(W, ['ARRÊT DE PROTECTION', safety.inP ? 'Personne dans la zone' : 'Zone libre : réarmer', 'MODE-04', 'pièces : ' + sim.cycles], '#C0392B');
    else if (md === 3) drawHMI(W, ['VITESSE RÉDUITE', 'Personne en zone d’avertissement', 'MODE-03', 'pièces : ' + sim.cycles], '#D18E0C');
    else drawHMI(W, ['PRODUCTION', 'Cycle automatique', 'MODE-02', 'pièces : ' + sim.cycles], '#23824F');
  }
  // portrait screens (phones): wider lens and the camera pulled back so the whole cell stays in frame
  const fit = () => {
    const w = innerWidth, h = innerHeight, a = w / h, portrait = a < 1; renderer.setSize(w, h, false); cam.aspect = a; cam.fov = portrait ? 55 : 38;
    const k = portrait ? Math.min(2.6, Math.max(1, 0.5 / (Math.tan(27.5 * Math.PI / 180) * a))) : 1;
    if (k !== app.camK) { app.camK = k; ctl.maxDistance = 18 * k; scene.fog.near = 12 * k; scene.fog.far = 34 * k; if (app.camName && app.camTo) app.camTo(app.camName, 0.01); }
    cam.setViewOffset(w, h, 0, Math.round(h * (portrait ? -0.07 : 0.03)), w, h); cam.updateProjectionMatrix();
  };
  addEventListener('resize', fit); fit();

  // one simulation step of dtReal wall seconds
  app.step = dtReal => {
    // scrubbing: the timeline was clicked or dragged
    if (app.scrub) {
      const v = app.scrub.v; app.scrub = null; app.scrubbing = true;
      app.cur.seek(v); sim.events.length = 0; today.newCycle = false; pushTrail(0, true);
    }
    if (app.scrubEnd) { app.scrubEnd = false; app.scrubbing = false; }
    // playback speed from the speed bar; automatic slow motion while a person crosses the fields
    let target = app.speed ?? 1; const op = safety.op; app.autoSlowOn = false;
    if (op && app.autoSlow !== false) { const near = op.step === 0 && op.z < safety.zOuter + 0.45, stopping = safety.mode === 4 && safety.trip && safety.trip.t < safety.T + 0.35 && safety.trip.who === op; if (near || stopping) { target = Math.min(target, 0.12); app.autoSlowOn = true; } }
    app.timeScale = target === 0 ? 0 : app.timeScale + (target - app.timeScale) * Math.min(1, dtReal * 7);
    if (app.tRamp) { const r = app.tRamp; r.t += dtReal; const u = Math.min(1, r.t / 2.2), Tf = r.from + (r.to - r.from) * ease(u); safety.setT(Tf); app.setParam('T', Tf.toFixed(2)); if (u >= 1) { app.tRamp = null; app.setParam('T', r.to.toFixed(2)); safety.setT(r.to); } }
    const dt = app.paused || app.scrubbing ? 0 : dtReal * app.timeScale;
    { const n = Math.max(1, Math.ceil(dt / 0.034)), h = dt / n; for (let i = 0; i < n; i++) { safety.update(h); if (app.scn === 'today') today.update(h); else sim.update(h, safety.rate, safety.reduced); } }
    for (const ev of sim.events.splice(0)) { if (ev.type === 'doorOpen') pushTrail(0, true); if (ev.type === 'newCycle') app.uiRibbon(); }
    if (today.newCycle) { today.newCycle = false; app.uiRibbon(); }
    safety.events.length = 0;
    pushTrail(dt); hmi();
    W.lamp.intensity = 1.2 + 1.4 * app.cur.m.door;
    { const ph = app.cur.m.phase, cut = ph === 'machining' || ph === 'toLoad'; app.clock = (app.clock || 0) + dt; W.mlamp.green.emissiveIntensity = cut ? 1.6 : 0.02; W.mlamp.amber.emissiveIntensity = cut ? 0.02 : ph === 'waiting' ? (Math.sin(app.clock * 7) > 0 ? 2.0 : 0.1) : 1.5; }
    if (camTw) { camTw.t += dtReal; const u = ease(Math.min(1, camTw.t / camTw.dur)); cam.position.lerpVectors(camTw.p0, camTw.p1, u); ctl.target.lerpVectors(camTw.t0, camTw.t1, u); if (camTw.t >= camTw.dur) camTw = null; }
    app.uiUpdate();
  };
  let lastT = performance.now();
  window.__dbg = { THREE, app, sim, safety, scene, cam, ctl, W, robot, renderer, manual: false,
    view(p, t) { cam.position.set(...p); ctl.target.set(...t); ctl.update(); },
    adv(seconds, h = 1 / 60) { for (let t = 0; t < seconds - 1e-9; t += h) app.step(h); },
    until(fn, max = 60, h = 1 / 60) { let t = 0; while (t < max && !fn()) { app.step(h); t += h; } return t; },
    run(seconds, h = 1 / 60) { this.adv(seconds, h); ctl.update(); renderer.render(scene, cam); } };
  renderer.setAnimationLoop(() => { const now = performance.now(), d = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now; if (!window.__dbg.manual) app.step(d); ctl.update(); renderer.render(scene, cam); });
  pushTrail(0, true);
  document.body.dataset.ready = '1';
}
start().catch(e => { console.error(e); document.body.dataset.error = String(e && e.stack || e); });
