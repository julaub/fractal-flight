// Cumulonimbus clusters: generated once at startup (positions seek fitting
// terrain via the CPU mirror), drift together in one random wind. Pure
// visuals: no collision. Count and size are live tune-panel sliders.

import { MAXCLOUD, START } from './config.js';
import { craft } from './state.js';
import { TUNE } from './tune.js';
import { terrainShapeJ } from './terrain.js';

export const clouds = [];
let windX = 0, windZ = 0;
export function genClouds() {
  clouds.length = 0;
  const wa = Math.random() * Math.PI * 2;       // wind: random heading,
  const ws = 1.6 + Math.random() * 1.6;         // 1.6–3.2 m/s — a slow drift
  windX = Math.cos(wa) * ws; windZ = Math.sin(wa) * ws;
  // size classes (v4.4): 4 big, 6 middle, 6 small. Placement seeks terrain
  // to match: BIG clouds over lowlands/sea, SMALL ones over snowy peaks,
  // mids anywhere — up to 14 random probes of the terrain mirror each.
  for (let i = 0; i < MAXCLOUD; i++) {
    const cl = i < 4 ? 2 : (i < 10 ? 1 : 0);    // 2 big · 1 mid · 0 small
    let x = 0, z = 0, gh = 0;
    for (let tries = 0; tries < 14; tries++) {
      x = START.x + (Math.random() - 0.5) * 8400;
      z = START.z + (Math.random() - 0.5) * 8400;
      gh = terrainShapeJ(x, z);
      if (cl === 2 && gh < 120) break;          // big: found lowland
      if (cl === 0 && gh > 280) break;          // small: found a high peak
      if (cl === 1) break;
    }
    const f = cl === 2 ? 1.45 + Math.random() * 0.55
            : cl === 1 ? 0.85 + Math.random() * 0.40
            :            0.50 + Math.random() * 0.28;
    const y = (gh > 230)
      ? gh + 90 + Math.random() * 90            // riding a mountain top
      : 250 + Math.random() * 190;              // hovering in open air
    clouds.push({ x, y, z, f });
  }
}
export const cloudArr = new Float32Array(MAXCLOUD * 4);

export function cloudImmersion() {
  // 0..1 how deep the craft sits inside the nearest cloud (soft edge)
  let cim = 0;
  const cn = Math.min(MAXCLOUD, Math.round(TUNE.cloudCount.v));
  for (let i = 0; i < cn; i++) {
    const c = clouds[i], r = c.f * TUNE.cloudSize.v;
    const qx = (craft.pos[0] - c.x) / r;
    const qy = (craft.pos[1] - c.y) / (r * 0.80);   // covers base + bubbles
    const qz = (craft.pos[2] - c.z) / r;
    const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
    const a = Math.max(0, Math.min(1, (1.05 - d) / 0.35));
    if (a > cim) cim = a;
  }
  return cim;
}

export function driftClouds(dt) {
  for (let ci = 0; ci < MAXCLOUD; ci++) { clouds[ci].x += windX * dt; clouds[ci].z += windZ * dt; }
}
