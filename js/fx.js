// 2D overlay effects: wingtip contrails, tracer glow, falling-bomb blink,
// impact/blast/harvest rings — world-space particles projected onto the fx
// canvas each frame, zero cost inside the raymarcher.

import { TAN_HALF_FOV, TRAIL_LIFE, POP_LIFE, MAXB, MAXBOMB, RING_N, BLAST_R } from './config.js';
import { craft, camPos } from './state.js';

const fxCanvas = document.getElementById('fx');
const fxCtx = fxCanvas.getContext('2d');
export const trail = [];
export const pops = [];            // expanding rings where a spore was harvested
export function emitTrail(b, now, boost) {
  for (const side of [-1, 1]) {
    trail.push({
      x: craft.pos[0] + b.right[0] * 3.0 * side - b.fwd[0] * 0.4,
      y: craft.pos[1] + b.right[1] * 3.0 * side - b.fwd[1] * 0.4,
      z: craft.pos[2] + b.right[2] * 3.0 * side - b.fwd[2] * 0.4,
      t0: now, boost
    });
  }
  while (trail.length > 300) trail.shift();
}
function projectFx(camB, px, py, pz, W, H) {
  const vx = px - camPos[0], vy = py - camPos[1], vz = pz - camPos[2];
  const lz = vx * camB.fwd[0] + vy * camB.fwd[1] + vz * camB.fwd[2];
  if (lz < 1.0) return null;
  const lx = vx * camB.right[0] + vy * camB.right[1] + vz * camB.right[2];
  const ly = vx * camB.up[0] + vy * camB.up[1] + vz * camB.up[2];
  const ux = lx / (lz * TAN_HALF_FOV), uy = ly / (lz * TAN_HALF_FOV);
  return { x: (ux * H + W) / 2, y: H * (1 - uy) / 2, z: lz };
}
export function drawTrail(camB, now, bullets, bombs, impacts) {
  const W = fxCanvas.clientWidth, H = fxCanvas.clientHeight;
  if (fxCanvas.width !== W || fxCanvas.height !== H) { fxCanvas.width = W; fxCanvas.height = H; }
  fxCtx.clearRect(0, 0, W, H);
  // tracer rounds: additive warm glow + bright core along this frame's segment
  fxCtx.globalCompositeOperation = 'lighter';
  fxCtx.lineCap = 'round';
  for (let i = 0; i < MAXB; i++) {
    const B = bullets[i];
    if (!B) continue;
    const a = projectFx(camB, B.px, B.py, B.pz, W, H);
    const c = projectFx(camB, B.x, B.y, B.z, W, H);
    if (!a || !c) continue;
    const fade = Math.max(0.25, 1 - c.z / 1500);
    fxCtx.beginPath(); fxCtx.moveTo(a.x, a.y); fxCtx.lineTo(c.x, c.y);
    fxCtx.strokeStyle = 'rgba(255,185,80,' + (0.35 * fade).toFixed(3) + ')';
    fxCtx.lineWidth = Math.max(2.5, 240 / c.z);
    fxCtx.stroke();
    fxCtx.beginPath(); fxCtx.moveTo(a.x, a.y); fxCtx.lineTo(c.x, c.y);
    fxCtx.strokeStyle = 'rgba(255,246,214,' + (0.9 * fade).toFixed(3) + ')';
    fxCtx.lineWidth = Math.max(1, 90 / c.z);
    fxCtx.stroke();
  }
  fxCtx.globalCompositeOperation = 'source-over';
  // falling bombs: slow black↔yellow blink (per-slot phase) + glint + streak
  for (let i = 0; i < MAXBOMB; i++) {
    const B = bombs[i];
    if (!B) continue;
    const s = projectFx(camB, B.x, B.y, B.z, W, H);
    if (!s) continue;
    const t = projectFx(camB, B.x - B.vx * 0.06, B.y - B.vy * 0.06, B.z - B.vz * 0.06, W, H);
    const r = Math.max(3.2, 220 / s.z);   // v5.3: doubled
    if (t) {
      fxCtx.beginPath(); fxCtx.moveTo(t.x, t.y); fxCtx.lineTo(s.x, s.y);
      fxCtx.strokeStyle = 'rgba(60,60,70,0.35)'; fxCtx.lineWidth = r * 0.6; fxCtx.stroke();
    }
    const bl = 0.5 + 0.5 * Math.sin(now * 0.016 + i * 2.1);   // ~0.4 s blink cycle (v5.3: quicker)
    const cr2 = Math.round(38 + (255 - 38) * bl);
    const cg = Math.round(38 + (210 - 38) * bl);
    const cb = Math.round(46 + (60 - 46) * bl);
    fxCtx.beginPath(); fxCtx.arc(s.x, s.y, r, 0, 6.2832);
    fxCtx.fillStyle = 'rgba(' + cr2 + ',' + cg + ',' + cb + ',0.95)'; fxCtx.fill();
    fxCtx.beginPath(); fxCtx.arc(s.x - r * 0.3, s.y - r * 0.3, r * 0.3, 0, 6.2832);
    fxCtx.fillStyle = 'rgba(255,255,255,0.5)'; fxCtx.fill();
  }
  // bullet impacts: quick dust (ground) / spray (water) rings;
  // kind 3 = bomb detonation: a world-space ring LYING ON THE TERRAIN,
  // expanding to the true blast radius — each vertex sits at sampled ground
  // height and is projected in perspective, so the circle tilts with slopes.
  for (let i = impacts.length - 1; i >= 0; i--) {
    const p = impacts[i];
    const life = (p.kind === 3) ? 0.9 : 0.45;
    const age = (now - p.t0) / 1000;
    if (age > life) { impacts.splice(i, 1); continue; }
    const k = age / life;
    if (p.kind === 3) {
      const frac = Math.min(1, k * 2.2);            // expands to full radius fast
      const dx = p.x - camPos[0], dy = p.y - camPos[1], dz = p.z - camPos[2];
      const dist = Math.max(20, Math.hypot(dx, dy, dz));
      const pxPerM = H / (2 * dist * TAN_HALF_FOV); // world→screen at blast depth
      const traceRing = (fr) => {
        let started = false, drew = false;
        fxCtx.beginPath();
        for (let v = 0; v <= RING_N; v++) {
          const vi = v % RING_N;
          const a = (vi / RING_N) * 6.28318;
          const wx = p.x + Math.cos(a) * BLAST_R * fr;
          const wz = p.z + Math.sin(a) * BLAST_R * fr;
          const wy = p.y + (p.ringH[vi] - p.y) * fr; // lerp center→sampled rim height
          const s = projectFx(camB, wx, wy, wz, W, H);
          if (!s) { started = false; continue; }     // vertex behind camera: break path
          if (!started) { fxCtx.moveTo(s.x, s.y); started = true; }
          else fxCtx.lineTo(s.x, s.y);
          drew = true;
        }
        return drew;
      };
      fxCtx.globalCompositeOperation = 'lighter';
      if (k < 0.22) {                                // initial flash at ground zero
        const c = projectFx(camB, p.x, p.y, p.z, W, H);
        if (c) {
          fxCtx.beginPath();
          fxCtx.arc(c.x, c.y, Math.max(2, 10 * pxPerM * (1 - k * 4.5) + 2), 0, 6.2832);
          fxCtx.fillStyle = 'rgba(255,230,170,' + Math.max(0, 0.85 * (1 - k * 4.5)).toFixed(3) + ')';
          fxCtx.fill();
        }
      }
      if (traceRing(frac)) {                         // fire ring on the ground
        fxCtx.strokeStyle = 'rgba(255,170,90,' + ((1 - k) * 0.8).toFixed(3) + ')';
        fxCtx.lineWidth = Math.max(1.2, 4 * pxPerM * (1 - k) + 1);
        fxCtx.stroke();
      }
      fxCtx.globalCompositeOperation = 'source-over';
      if (traceRing(frac * 0.78)) {                  // trailing smoke ring
        fxCtx.strokeStyle = 'rgba(120,110,100,' + ((1 - k) * 0.4).toFixed(3) + ')';
        fxCtx.lineWidth = Math.max(1, 2.5 * pxPerM * (1 - k) + 0.8);
        fxCtx.stroke();
      }
      continue;
    }
    const s = projectFx(camB, p.x, p.y, p.z, W, H);
    if (!s) continue;
    const r = (2 + k * 18) * (60 / Math.min(s.z, 300));
    fxCtx.beginPath();
    fxCtx.arc(s.x, s.y, Math.max(1.5, r), 0, 6.2832);
    fxCtx.strokeStyle = (p.kind === 2 ? 'rgba(190,225,255,' : 'rgba(212,192,152,') + ((1 - k) * 0.75).toFixed(3) + ')';
    fxCtx.lineWidth = 2 * (1 - k) + 0.6;
    fxCtx.stroke();
  }
  // harvest pops: soft expanding cyan rings (matches the alien blue flora)
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    const age = (now - p.t0) / 1000;
    if (age < 0) continue;   // staggered blast pop not started yet
    if (age > POP_LIFE) { pops.splice(i, 1); continue; }
    const s = projectFx(camB, p.x, p.y, p.z, W, H);
    if (!s) continue;
    const k = age / POP_LIFE;
    const r = (4 + k * 46) * (60 / Math.min(s.z, 200));
    fxCtx.beginPath();
    fxCtx.arc(s.x, s.y, Math.max(2, r), 0, 6.2832);
    fxCtx.strokeStyle = 'rgba(130,215,255,' + ((1 - k) * 0.8).toFixed(3) + ')';
    fxCtx.lineWidth = 2.5 * (1 - k) + 0.5;
    fxCtx.stroke();
  }
  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i];
    const age = (now - p.t0) / 1000;
    if (age > TRAIL_LIFE) { trail.splice(i, 1); continue; }
    const s = projectFx(camB, p.x, p.y, p.z, W, H);
    if (!s) continue;
    const sx = s.x, sy = s.y;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    const k = 1 - age / TRAIL_LIFE;
    const r = (1.0 + age * 2.4) * (60 / s.z) * (p.boost ? 1.6 : 1.0);
    fxCtx.beginPath();
    fxCtx.arc(sx, sy, Math.max(0.6, Math.min(r, 26)), 0, 6.2832);
    fxCtx.fillStyle = 'rgba(255,255,255,' + (k * k * (p.boost ? 0.34 : 0.16)).toFixed(3) + ')';
    fxCtx.fill();
  }
}
