// Cell layout. World axes: x = along the CNC-04 front (0..2.0 m), z = depth from the CNC-04 face
// (toward the walkway), y = up. Everything the arm touches lies inside the 0.95 m hazard band.
export const PART = { FC: { w: 0.12, d: 0.12, h: 0.055, kg: 5.0, name: 'FC · 42CrMo4 · 5.0 kg' } };
export const L = {
  cell: { w: 2.0, d: 1.8 }, hazard: 0.95, walkNear: 2.60, walkFar: 3.85,
  base: { x: 0.80, y: 0.75, z: 0.40 },
  vice: { x: 1.00, z: -0.30, bed: 0.915 },        // bed = Z stop (seat height of the part)
  doorPoint: { x: 1.00, z: 0.10, psi: -Math.PI / 2 }, // Safe Home, 0.40 m from the vice
  zMaxTip: 0.84, zMinTip: 0.10,
  door: { x0: 0.60, x1: 1.40, y0: 0.72, y1: 1.78 },
  bin: { x: 1.56, z: 0.60, floor: 0.60, slots: [1.49, 1.63], layers: 3, psi: 0 },
  station: { x: 1.07, z: 0.696, top: 0.80, psi: 0 },
  tray: { x0: 0.12, z0: 0.38, px: 0.14, pz: 0.15, cols: 3, rows: 4, top: 0.80, psi: Math.PI },
  hover: 1.04, lift: 0.08,
  scanner: { x: 1.0, y: 0.30, z: 0.955 },
  field: { x0: -0.2, x1: 2.2 },
  reset: { x: -0.75, z: 2.05 },
  mach: { x0: -0.35, x1: 2.35, zb: -1.75, h: 2.40, tableLoad: 0, tableCut: -0.20, toolPark: 1.62 },
};
export const nest = i => ({ x: L.tray.x0 + (i % L.tray.cols) * L.tray.px, z: L.tray.z0 + Math.floor(i / L.tray.cols) * L.tray.pz });
