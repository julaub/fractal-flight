import { TUNE } from './tune.js';

// ============ CPU TERRAIN MIRROR (for collision) ============
// Exact port of the shader's terrainShape so the crash check agrees with the
// pixels. Uses the live TUNE values, so tuned worlds collide correctly too.
const fract = x => x - Math.floor(x);
function hashJ(px, py) {
  // exact port of the GLSL hash12 (v4.5)
  let ax = fract(px * 0.1031), ay = fract(py * 0.1031), az = fract(px * 0.1031);
  const d = ax * (ay + 33.33) + ay * (az + 33.33) + az * (ax + 33.33);
  ax += d; ay += d; az += d;
  return fract((ax + ay) * az);
}
function noiseJ(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  let fx = px - ix, fy = py - iy;
  // quintic fade — MUST match the GLSL noise() (v4.2)
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hashJ(ix, iy), b = hashJ(ix + 1, iy), c = hashJ(ix, iy + 1), d = hashJ(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
function fbmJ(px, py, oct) {
  let v = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { v += a * noiseJ(px, py); px = px * 2 + 13.7; py = py * 2 + 7.3; a *= 0.5; }
  return v;
}
function ridgedJ(px, py, oct) {
  let v = 0, a = 0.5, prev = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noiseJ(px, py) * 2 - 1); n *= n;
    v += a * n * prev; prev = n; px = px * 2 + 7.3; py = py * 2 + 13.7; a *= 0.5;
  }
  return v;
}
function mandelDEJ(cx, cy) {
  let zx = 0, zy = 0, dzx = 0, dzy = 0, m2 = 0;
  for (let i = 0; i < 26; i++) {
    const ndzx = 2 * (zx * dzx - zy * dzy) + 1, ndzy = 2 * (zx * dzy + zy * dzx);
    dzx = ndzx; dzy = ndzy;
    const nzx = zx * zx - zy * zy + cx, nzy = 2 * zx * zy + cy;
    zx = nzx; zy = nzy;
    m2 = zx * zx + zy * zy;
    if (m2 > 1e6) break;
  }
  if (m2 < 4) return 0;
  return Math.sqrt(m2 / Math.max(dzx * dzx + dzy * dzy, 1e-12)) * 0.5 * Math.log(m2);
}
function smaxJ(a, b, k) {
  const hh = Math.max(0, Math.min(1, 0.5 + 0.5 * (a - b) / k));
  return -((-b) * (1 - hh) + (-a) * hh - k * hh * (1 - hh));
}
export function terrainShapeJ(px, pz) {
  const w1 = mandelDEJ(px * 2.5e-4 - 0.55, pz * 2.5e-4) / 2.5e-4;
  const w2 = mandelDEJ(px * 1e-4 - 0.55, (pz - 14000) * 1e-4) / 1e-4;
  const wde = Math.min(w1, w2);
  const mass = Math.exp(-wde * TUNE.massDecay.v);
  const base = fbmJ(px * 0.0004, pz * 0.0004, 3) * 70 + 4 - Math.min(wde * TUNE.oceanSlope.v, TUNE.oceanMax.v);
  const qx = fbmJ(px * 0.0009, pz * 0.0009, 3), qy = fbmJ(px * 0.0009 + 5.2, pz * 0.0009 + 1.3, 3);
  const wx = px + qx * 60, wz = pz + qy * 60;
  const th = 17.3 / (TUNE.snowyPct.v / 100 + 6.44) - 2.32;
  const sel = fbmJ(px * 0.00018, pz * 0.00018, 2);
  let tt = Math.max(0, Math.min(1, (sel - (th - 0.05)) / 0.1)); tt = tt * tt * (3 - 2 * tt);
  let m = (80 + TUNE.mountAmp.v * ridgedJ(wx * 0.0016, wz * 0.0016, 5)) * mass * (0.42 + 0.68 * tt);
  m = 460 * Math.tanh(m / 460) - 70 * (1 - mass);
  let hh = smaxJ(base, m, 45);
  const val = fbmJ(px * 0.0003 + 200, pz * 0.0003 + 200, 3);
  let lk = Math.max(0, Math.min(1, (val - 0.58) / 0.14)); lk = lk * lk * (3 - 2 * lk);
  let mk = Math.max(0, Math.min(1, (mass - 0.4) / 0.5)); mk = mk * mk * (3 - 2 * mk);
  let pk = 1 - Math.max(0, Math.min(1, (m - 30) / 50)); const s3 = x => x * x * (3 - 2 * x);
  const lake = lk * mk * s3(Math.max(0, Math.min(1, pk)));
  return hh * (1 - lake * 0.65) + (-15) * lake * 0.65;
}
