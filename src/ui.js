import { phases, total, idle, payback, COST, margin, fmt, DEFAULTS } from './model.js';
import { T_MANUAL } from './today.js';
const $ = id => document.getElementById(id);
const setTxt = (el, t) => { if (el.textContent !== t) el.textContent = t; };
const setCls = (el, c) => { if (el.className !== c) el.className = c; };
const SUB = {
  dual: 'Équipe 605 · pince double, notre choix · pièce FC 5,0 kg',
  single: 'Équipe 605 · pince simple, option écartée · même bras affiché (dossier : classe 10 kg, modèle non choisi)',
  today: 'Équipe 605 · aujourd’hui : chargement à la main, opérateur partagé avec CNC-05',
};
const NAMES = { dual: 'pince double', single: 'pince simple' };

export function initUI(app) {
  const { sim, safety } = app, st = app.set;
  let BMAX = 30;
  const X = k => total(phases(k, st.v));
  // ----- exigences (formules du dossier) -----
  const chipDefs = [['Échange', '≤ 10 s · REQ-PERF-02'], ['Plus rapide que l’opérateur', '< 12 s · NEED-02'], ['Attente machine', '≤ 5 % · REQ-PERF-03'],
    ['Budget', '≤ 90 k€ · CST-07'], ['Amortissement', '< 24 mois · CST-08'], ['Zone de sécurité', 'face à l’allée · REQ-SAF-01']];
  $('chips').innerHTML = chipDefs.map((c, i) => `<div class="chip" id="chip${i}"><span><b>${c[0]}</b><i>${c[1]}</i></span><em></em></div>`).join('');
  const chip = (i, s, t, sub) => { const el = $('chip' + i); setCls(el, 'chip ' + s); setTxt(el.lastChild, (s === 'ok' ? '✓ ' : s === 'bad' ? '✗ ' : s === 'warn' ? '! ' : '') + t); setTxt(el.querySelector('i'), sub || chipDefs[i][1]); };
  function board() {
    const k = app.scn;
    if (k === 'today') {
      chip(0, 'ref', fmt(T_MANUAL) + ' s', 'à la main'); chip(1, 'ref', '—'); chip(2, 'bad', '20 %', '≤ 5 % · environ 700 h par an à 60 €/h');
      chip(3, 'ref', '—'); chip(4, 'ref', '—'); chip(5, 'ref', '—', 'pas encore de cellule'); return;
    }
    const x = X(k), i = idle(x, st.tm), pb = payback(k), m = margin(st.T);
    chip(0, x <= 10 ? 'ok' : 'bad', fmt(x) + ' s'); chip(1, x < 12 ? 'ok' : 'bad', x < 12 ? 'oui' : 'non'); chip(2, i <= 0.05 ? 'ok' : 'bad', fmt(i * 100) + ' %');
    chip(3, COST[k] <= 90000 ? 'ok' : 'bad', fmt(COST[k] / 1000, 1) + ' k€'); chip(4, pb < 24 ? 'ok' : 'bad', fmt(pb) + ' mois');
    chip(5, m >= 0.1 ? 'ok' : m >= 0 ? 'warn' : 'bad', (m >= 0 ? '+' : '−') + fmt(Math.abs(m) * 1000, 0) + ' mm');
  }
  // ----- curseurs : où chaque exigence casse -----
  const col = { ok: '#23824F', warn: '#D18E0C', bad: '#C0392B', off: '#C9D2D8' };
  function track(id, min, max, fn) { let h = '', prev = null, n = 0; const N = 80; for (let k = 0; k <= N; k++) { const s = k < N ? fn(min + (max - min) * (k + 0.5) / N) : null; if (s !== prev) { if (prev) h += `<i style="width:${n / N * 100}%;background:${col[prev]}"></i>`; prev = s; n = 0; } n++; } $(id).innerHTML = h; }
  function tracks() {
    const k = app.scn, off = k === 'today';
    track('vTrk', 0.2, 1.0, v => off ? 'off' : total(phases(k, v)) <= 10 ? 'ok' : total(phases(k, v)) < 12 ? 'warn' : 'bad');
    track('tmTrk', 4, 9, tm => off ? 'off' : idle(X(k), tm) <= 0.05 ? 'ok' : 'bad');
    track('TTrk', 0.10, 0.40, T => off ? 'off' : margin(T) >= 0.1 ? 'ok' : margin(T) >= 0 ? 'warn' : 'bad');
    for (const id of ['v', 'tm', 'T']) $(id).disabled = off;
  }
  // ----- timeline : toute la boucle (ligne du haut : bras ou opérateur ; ligne du bas : machine) -----
  let segEls = [], mEls = [], head, TL = null;
  function ribbon() {
    TL = app.cur.timeline(); const refs = [];
    if (app.scn !== 'dual') refs.push(['dual', X('dual')]); if (app.scn !== 'single') refs.push(['single', X('single')]);
    BMAX = Math.max(TL.len, TL.exStart + 12.6, ...refs.map(r => TL.exStart + r[1] + 0.6));
    const pc = t => t / BMAX * 100; let h = '', m = '', o = '';
    const wpx = $('tl').clientWidth || 1500, SHORT = { 'prise pièce': 'prise', 'rotation 180°': '180°', 'pose brut': 'pose', 'prise brut': 'prise', 'rot. poignet': 'rot.', 'ouverture porte': 'porte', 'vers plateau': 'plateau', 'vers station': 'station', 'vers porte': 'porte', 'vers bac': 'bac', 'descente': '↓', 'montée': '↑' };
    const fit = (name, dur, cw) => { const w = dur / BMAX * wpx - 8; return name.length * cw <= w ? name : (SHORT[name] || '').length * cw <= w ? (SHORT[name] || '') : ''; };
    for (const s of TL.segs) h += `<div class="seg ${s.type}" style="left:${pc(s.t0)}%;width:calc(${pc(s.dur)}% - 2px)">${fit(s.name, s.dur, 6.3)}</div>`;
    for (const s of TL.mach) m += `<div class="ms ${s.type}" style="left:${pc(s.t0)}%;width:calc(${pc(s.dur)}% - 2px)">${fit(s.name, s.dur, 5.6) || fit(s.name.split(' · ')[0], s.dur, 5.6)}</div>`;
    for (const r of refs) o += `<div class="ghost" style="left:${pc(TL.exStart)}%;width:${pc(r[1])}%"><span>${NAMES[r[0]]} ${fmt(r[1])} s</span></div>`;
    o += `<div class="tick t10" style="left:${pc(TL.exStart + 10)}%;border-color:#23824F"><span style="color:#23824F">10 s</span></div><div class="tick" style="left:${pc(TL.exStart + 12)}%;border-color:#C0392B"><span style="color:#C0392B">12 s<b> · opérateur</b></span></div><div class="head"></div>`;
    $('ribbon').innerHTML = h; $('mrow').innerHTML = m; $('tlOver').innerHTML = o;
    segEls = [...$('ribbon').children]; mEls = [...$('mrow').children]; head = $('tlOver').querySelector('.head');
  }
  app.uiRibbon = ribbon;
  // ----- comparaison des trois scénarios, exigence par exigence -----
  const mark = s => s === 'ok' ? '✓ ' : s === 'bad' ? '✗ ' : s === 'warn' ? '! ' : '';
  function cmpDraw() {
    const m = margin(st.T), ms = m >= 0.1 ? 'ok' : m >= 0 ? 'warn' : 'bad', mt = (m >= 0 ? '+' : '−') + fmt(Math.abs(m) * 1000, 0) + ' mm';
    const col = k => { const x = X(k), i = idle(x, st.tm), pb = payback(k); return [[x <= 10 ? 'ok' : 'bad', fmt(x) + ' s'], [x < 12 ? 'ok' : 'bad', x < 12 ? 'oui' : 'non'], [i <= 0.05 ? 'ok' : 'bad', fmt(i * 100) + ' %'], [COST[k] <= 90000 ? 'ok' : 'bad', fmt(COST[k] / 1000, 1) + ' k€'], [pb < 24 ? 'ok' : 'bad', fmt(pb) + ' mois'], [ms, mt]]; };
    const T = [['', fmt(T_MANUAL) + ' s'], ['', '—'], ['bad', '20 %'], ['', '—'], ['', '—'], ['', '—']], S1 = col('single'), D = col('dual');
    let h = '<div></div><div class="hd">Aujourd’hui<small>à la main</small></div><div class="hd">Pince simple<small>option écartée</small></div><div class="hd ours">Pince double<small>notre choix</small></div>';
    chipDefs.forEach((c, i) => { h += `<div class="rl">${c[0]}<small>${c[1]}</small></div>`; for (const v of [T[i], S1[i], D[i]]) h += `<div class="c ${v[0]}">${mark(v[0])}${v[1]}</div>`; });
    h += '<div class="note">Mêmes formules que le dossier. Les valeurs suivent les curseurs.</div>';
    $('cmp').innerHTML = h;
  }
  app.setCompare = on => { app.compare = on; $('cmp').hidden = !on; $('chips').hidden = on; if (on) cmpDraw(); };
  let lastV = null, lastTm = null, lastScn = null;
  function recompute() {
    st.v = +$('v').value; st.tm = +$('tm').value; st.T = +$('T').value;
    setTxt($('vOut'), fmt(st.v, 2) + ' m/s'); setTxt($('tmOut'), fmt(st.tm, 1) + ' min'); setTxt($('TOut'), fmt(st.T, 2) + ' s');
    sim.v = st.v; sim.tm = st.tm; app.today.tm = st.tm; if (!app.tRamp) safety.setT(st.T);
    board(); if (app.compare) cmpDraw();
    if (st.v !== lastV || st.tm !== lastTm || app.scn !== lastScn) { lastV = st.v; lastTm = st.tm; lastScn = app.scn; tracks(); ribbon(); }   // T alone changes neither the tracks nor the timeline
  }
  ['v', 'tm', 'T'].forEach(id => $(id).addEventListener('input', () => recompute(true)));
  app.setParam = (k, val) => { if (+$(k).value === +val) return; $(k).value = val; recompute(); };
  app.uiScenario = () => { setTxt($('sub'), SUB[app.scn]); recompute(); };
  $('uReset').onclick = () => app.resetStart();
  // the bottom panel (timeline + parameters) appears when the pointer reaches it and stays while it is being used
  { const bot = $('bottom'), hud = $('hud'); let inside = false, down = false, tmr = 0, touchOpen = false;
    const small = matchMedia('(max-width:720px), (max-height:520px) and (pointer:coarse)');
    const set = on => { const was = bot.classList.contains('open'); bot.classList.toggle('open', on); hud.classList.toggle('open', on); if (on && !was && small.matches) ribbon(); };
    const upd = () => { clearTimeout(tmr); if (inside || down || touchOpen) set(true); else tmr = setTimeout(() => set(false), 450); };
    // mouse: hover. Touch has no hover: the pill at the bottom is a button, and touching the scene closes the panel.
    bot.addEventListener('pointerenter', e => { if (e.pointerType === 'touch') return; inside = true; upd(); }); bot.addEventListener('pointerleave', e => { if (e.pointerType === 'touch') return; inside = false; upd(); });
    bot.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; down = true; upd(); }); addEventListener('pointerup', () => { down = false; upd(); }); addEventListener('pointercancel', () => { down = false; upd(); });
    $('hint').addEventListener('click', () => { touchOpen = !touchOpen; clearTimeout(tmr); set(touchOpen); });
    document.getElementById('gl').addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && touchOpen) { touchOpen = false; set(false); } });
    // on phones the objectives live inside the bottom panel
    const place = () => { const ch = $('chips'); if (small.matches) { if (ch.parentNode !== bot) bot.insertBefore(ch, $('ctl')); } else if (ch.parentNode !== hud) { hud.insertBefore(ch, $('cmp')); touchOpen = false; } ribbon(); };
    small.addEventListener('change', place); app.placeChips = place; }
  $('bPrev').onclick = () => app.goBeat(app.beat - 1); $('bNext').onclick = () => app.goBeat(app.beat + 1);
  const SPEEDS = [0, 0.1, 0.25, 0.5, 1, 2, 4, 8];        // 0 = pause
  app.setSpeedIdx = i => { i = Math.max(0, Math.min(SPEEDS.length - 1, i)); $('spd').value = i; app.speed = SPEEDS[i]; setTxt($('spdOut'), SPEEDS[i] === 0 ? 'pause' : '×' + fmt(SPEEDS[i], SPEEDS[i] < 1 ? (SPEEDS[i] === 0.25 ? 2 : 1) : 0)); };
  $('spd').addEventListener('input', () => app.setSpeedIdx(+$('spd').value)); app.setSpeedIdx(6);
  // la timeline se manipule comme celle d'une vidéo : cliquer ou glisser pour avancer et reculer
  const scrub = (el, toVal) => {
    let down = false; const at = e => { const r = el.getBoundingClientRect(); return toVal(e.clientX - r.left, r.width); };
    el.addEventListener('pointerdown', e => { down = true; try { el.setPointerCapture(e.pointerId); } catch (err) {} app.scrub = { v: at(e) }; e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (down) app.scrub = { v: at(e) }; });
    const up = () => { if (down) { down = false; app.scrubEnd = true; } }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  scrub($('tl'), (x, w) => Math.max(0, x / w * BMAX));
  setTxt($('tLab'), 'Échange · porte ouverte → départ cycle');
  app.uiScenario(); app.placeChips(); addEventListener('resize', () => ribbon());

  const tNum = $('tNum'), tMark = $('tMark'), tRow = $('tRow'), phase = $('phase'), mode = $('mode'), modeTxt = $('modeTxt'), slowTag = $('slowTag');
  app.uiUpdate = () => {
    const c = app.cur, tm = c.timer, running = tm.running, val = running ? tm.t : (tm.last ?? 0), today = app.scn === 'today', t = c.ct;
    setTxt(tNum, fmt(Math.max(0, val)));
    const done = !running && tm.last != null, ok = val <= 10.049;
    setTxt(tMark, done && !today ? (ok ? '✓' : '✗') : ''); tRow.style.color = done && !today ? (ok ? '#23824F' : '#C0392B') : '';
    setTxt(phase, c.phaseText);
    for (let k = 0; k < segEls.length; k++) { const s = TL.segs[k]; setCls(segEls[k], 'seg ' + s.type + (t >= s.t0 + s.dur - 1e-4 ? ' done' : t >= s.t0 ? ' cur' : '')); }
    head.style.left = Math.min(100, t / BMAX * 100) + '%';
    const md = today ? 0 : safety.mode; setCls(mode, 'm' + md + (md === 0 && c.m.phase === 'waiting' ? ' wait' : '')); setTxt(modeTxt, md === 0 ? (c.m.phase === 'waiting' ? 'CNC-04 attend l’opérateur' : 'Chargement manuel') : md === 2 ? 'Production' : md === 3 ? 'Vitesse réduite' : 'Arrêt de protection');
    if (md === 4) { const u = mode.querySelectorAll('u'); setCls(u[0], safety.inP ? '' : 'on'); setCls(u[1], safety.inP ? '' : 'go'); }
    const slow = app.autoSlowOn; slowTag.hidden = !slow; if (slow) setTxt($('slowX'), fmt(app.timeScale, 2));
  };
  app.uiReset = () => { $('v').value = DEFAULTS.v; $('tm').value = DEFAULTS.tm; $('T').value = DEFAULTS.T; recompute(); };
  app.uiBeat = (i, n, name) => { $('beat').innerHTML = `<small>Visite guidée · étape ${i + 1} sur ${n}</small>${name}`; $('bPrev').disabled = i <= 0; $('bNext').disabled = i >= n - 1; };
}
