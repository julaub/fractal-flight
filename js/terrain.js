// CPU-side terrain height, mirroring the GPU terrainShape() in shaders.js
// (fewer octaves/iterations — good enough for gameplay queries like ring
// placement, cheap enough to call per spawn).

import { MB_CX, MB_CY, MB_SCL } from './config.js';

function fract(x) { return x - Math.floor(x); }

function jhash(x, y) {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const d = px * px + py * py + (px + py) * 45.32;
  px += d; py += d;
  return fract(px * py);
}

function jnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = jhash(ix, iy);
  const b = jhash(ix + 1, iy);
  const c = jhash(ix, iy + 1);
  const d = jhash(ix + 1, iy + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function jfbm(x, y, oct) {
  let v = 0, a = 0.5;
  for (let i = 0; i < oct; i++) {
    v += a * jnoise(x, y);
    x = x * 2 + 13.7; y = y * 2 + 7.3;
    a *= 0.5;
  }
  return v;
}

function jridged(x, y, oct) {
  let v = 0, a = 0.5, prev = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(jnoise(x, y) * 2 - 1);
    n = n * n;
    v += a * n * prev;
    prev = n;
    x = x * 2 + 7.3; y = y * 2 + 13.7;
    a *= 0.5;
  }
  return v;
}

function jsmoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function jMandelDE(cx, cy, maxIter) {
  let zx = 0, zy = 0, dzx = 0, dzy = 0, m2 = 0;
  for (let i = 0; i < maxIter; i++) {
    const ndzx = 2 * (zx * dzx - zy * dzy) + 1;
    const ndzy = 2 * (zx * dzy + zy * dzx);
    dzx = ndzx; dzy = ndzy;
    const nzx = zx * zx - zy * zy + cx;
    const nzy = 2 * zx * zy + cy;
    zx = nzx; zy = nzy;
    m2 = zx * zx + zy * zy;
    if (m2 > 1e6) break;
  }
  if (m2 < 4) return 0;
  return Math.sqrt(m2 / Math.max(dzx * dzx + dzy * dzy, 1e-12)) * 0.5 * Math.log(m2);
}

export function terrainHeightJS(x, z) {
  const cx = x * MB_SCL + MB_CX;
  const cy = z * MB_SCL + MB_CY;
  const de = jMandelDE(cx, cy, 18);
  const mass = Math.exp(-de * 14);

  const qx = jfbm(x * 0.0009, z * 0.0009, 3);
  const qy = jfbm(x * 0.0009 + 5.2, z * 0.0009 + 1.3, 3);
  const pwx = x + qx * 60;
  const pwz = z + qy * 60;

  const mountain = (80 + 400 * jridged(pwx * 0.0016, pwz * 0.0016, 4)) * mass;
  const mountainCapped = 460 * Math.tanh(mountain / 460);

  const baseElev = jfbm(x * 0.0004, z * 0.0004, 3) * 90 - 12;

  // smax(baseElev, mountainCapped, 45)
  const k = 45;
  const t = Math.max(0, Math.min(1, 0.5 + 0.5 * (mountainCapped - baseElev) / k));
  const h = baseElev * (1 - t) + mountainCapped * t + k * t * (1 - t);

  // lake/ocean carving (matches GPU terrainShape): mix(h, -15, lake * 0.7)
  const valley = jfbm(x * 0.0003 + 200, z * 0.0003 + 200, 3);
  const lake = jsmoothstep(0.55, 0.7, valley) * (1 - mass);
  return h * (1 - lake * 0.7) - 15 * lake * 0.7;
}
