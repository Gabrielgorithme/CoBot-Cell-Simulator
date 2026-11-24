// Dossier figures and formulas (D5, D6, H-18 to H-34). Nothing here is invented: same model as the 2D v3.
export const SEQ = {
  dual: [
    ['sig', 'signal', 0.2], ['mv', 'entrée', 0.4], ['fx', 'prise pièce', 1.0], ['fx', 'rotation 180°', 1.0], ['fx', 'pose brut', 1.0],
    ['fx', 'serrage', 1.0], ['fx', 'lâcher', 0.5], ['mv', 'sortie', 0.4], ['sig', 'signal', 0.2]],
  single: [
    ['sig', 'signal', 0.2], ['mv', 'entrée', 0.4], ['fx', 'prise pièce', 1.0], ['mv', 'sortie', 0.4], ['mv', 'vers bac', 0.8], ['fx', 'dépose', 0.5],
    ['mv', 'vers station', 0.5], ['fx', 'prise brut', 0.5], ['fx', 'rot. poignet', 0.5], ['mv', 'vers porte', 0.6], ['mv', 'entrée', 0.4],
    ['fx', 'pose brut', 1.0], ['fx', 'serrage', 1.0], ['fx', 'lâcher', 0.5], ['mv', 'sortie', 0.4], ['sig', 'signal', 0.2]],
};
export const COST = { dual: 83600, single: 68750 }, GUAR = { dual: 0.05, single: 0.06 };
export const moveTime = (dist, v) => dist / v + 0.3;                      // H-18..H-20
export const phases = (k, v) => SEQ[k].map(p => ({ type: p[0], name: p[1], dur: p[0] === 'mv' ? moveTime(p[2], v) : p[2], dist: p[0] === 'mv' ? p[2] : 0 }));
export const total = ph => ph.reduce((s, p) => s + p.dur, 0);
export const DOOR_S = 3;                                                  // H-23
export const idle = (X, tm) => { const pp = (DOOR_S + X) / 60, ex = 13.5, n = (960 - ex) / (tm + pp); return (n * pp + ex) / 960; };
export const partsPerDay = (X, tm) => (960 - 13.5) / (tm + (DOOR_S + X) / 60);
export const gain = i => 3520 * Math.max(0, 0.20 - i) * 60 + 4950;
export const payback = k => COST[k] / gain(GUAR[k]) * 12;
export const S_of = T => 1600 * T + 1180;                                 // mm, ISO 13855 (S300 method)
export const HAZ = 0.95, WALK = 2.60, RESERVE = 0.10;
export const fieldEdge = T => HAZ + S_of(T) / 1000;
export const margin = T => WALK - fieldEdge(T);
export const K_APPROACH = 1.6;                                            // m/s, ISO 13855 walking approach speed
export const V_REDUCED = 0.25;                                            // m/s, assumption for MODE-03 (not in the dossier)
export const DEFAULTS = { v: 0.5, tm: 6.5, T: 0.20 };
export const fmt = (x, d = 1) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
