// Ring course: spawning, pass-through detection, scoring, and packing the
// ring data into the uniform arrays the shader expects.

import { MAX_RINGS, START } from './config.js';
import { craft } from './state.js';
import { normalize3, cross3 } from './math.js';
import { terrainHeightJS } from './terrain.js';

const rings = [];
let score = 0;

const ringsPosData = new Float32Array(MAX_RINGS * 4);
const ringsMatsData = new Float32Array(MAX_RINGS * 9);

export function getScore() { return score; }

export function initRings() {
  score = 0;
  rings.length = 0;
  for (let i = 0; i < MAX_RINGS; i++) {
    rings.push({ pos: [0,0,0], fwd: [0,0,1], right: [1,0,0], up: [0,1,0], radius: 18, active: false });
  }
  let lastPos = [START.x, START.y, START.z];
  let lastFwd = [Math.sin(START.yaw) * Math.cos(START.pitch), Math.sin(START.pitch), Math.cos(START.yaw) * Math.cos(START.pitch)];
  for (let i = 0; i < MAX_RINGS; i++) {
    spawnRing(i, lastPos, lastFwd);
    lastPos = rings[i].pos;
    lastFwd = rings[i].fwd;
  }
}

const LAND_MIN_H = 30; // minimum terrain height (m) to anchor a ring over land

function spawnRing(index, fromPos, fromFwd) {
  // Try a fan of candidate directions: early attempts follow the chain
  // heading, later ones swing wider so the course turns back over mountains
  // instead of continuing out over water. If nothing clears LAND_MIN_H,
  // fall back to the highest-terrain candidate seen.
  const baseYaw = Math.atan2(fromFwd[0], fromFwd[2]);
  let best = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const spread = 0.4 + 2.0 * attempt / 11; // total fan width in radians
    const yaw = baseYaw + (Math.random() - 0.5) * spread;
    const dist = 400 + Math.random() * 300;
    const x = fromPos[0] + Math.sin(yaw) * dist;
    const z = fromPos[2] + Math.cos(yaw) * dist;
    const h = terrainHeightJS(x, z);
    if (best === null || h > best.h) best = { x, z, h };
    if (h > LAND_MIN_H) { best = { x, z, h }; break; }
  }

  // Place ring above terrain with generous clearance (100–220m above ground),
  // with a minimum flying altitude
  const clearance = 100 + Math.random() * 120;
  const pos = [best.x, Math.max(best.h + clearance, 150), best.z];

  // Orient ring to face the travel direction (from previous ring to this one)
  let fwd = normalize3([pos[0] - fromPos[0], pos[1] - fromPos[1], pos[2] - fromPos[2]]);
  let right = normalize3(cross3(fwd, [0, 1, 0]));
  if (!isFinite(right[0])) right = [1, 0, 0];
  let up = cross3(right, fwd);

  rings[index].pos = pos;
  rings[index].fwd = fwd;
  rings[index].right = right;
  rings[index].up = up;
  rings[index].radius = 18;
  rings[index].active = true;
}

// onScore is called once per collected ring (UI feedback lives in hud.js).
export function updateRings(craftPos, craftFwd, onScore) {
  for (let i = 0; i < MAX_RINGS; i++) {
    const r = rings[i];
    if (!r.active) continue;

    const dx = r.pos[0] - craftPos[0];
    const dy = r.pos[1] - craftPos[1];
    const dz = r.pos[2] - craftPos[2];
    const dist = Math.hypot(dx, dy, dz);

    // Collision: close enough AND flying towards it
    if (dist < r.radius * 0.8) {
      const dot = (dx * craftFwd[0] + dy * craftFwd[1] + dz * craftFwd[2]) / Math.max(dist, 0.001);
      if (dot > 0.3) {
        score++;
        r.active = false;
        if (onScore) onScore();
        spawnNextRing(i, craftPos);
      }
    }

    // Behind check: recycle if we've flown past it
    const behindDot = (r.pos[0] - craftPos[0]) * craftFwd[0] +
                      (r.pos[1] - craftPos[1]) * craftFwd[1] +
                      (r.pos[2] - craftPos[2]) * craftFwd[2];
    if (behindDot < -200) {
      r.active = false;
      spawnNextRing(i, craftPos);
    }
  }
}

function spawnNextRing(index, craftPos) {
  // Find the furthest active ring to chain from
  let furthestIdx = -1;
  let maxDistSq = -1;
  for (let j = 0; j < MAX_RINGS; j++) {
    if (rings[j].active) {
      const fdx = rings[j].pos[0] - craftPos[0];
      const fdy = rings[j].pos[1] - craftPos[1];
      const fdz = rings[j].pos[2] - craftPos[2];
      const dsq = fdx * fdx + fdy * fdy + fdz * fdz;
      if (dsq > maxDistSq) { maxDistSq = dsq; furthestIdx = j; }
    }
  }
  if (furthestIdx === -1) {
    spawnRing(index, craftPos, [Math.sin(craft.yaw), 0, Math.cos(craft.yaw)]);
  } else {
    spawnRing(index, rings[furthestIdx].pos, rings[furthestIdx].fwd);
  }
}

// Fills and returns the uniform-ready arrays for the current frame.
export function packRingData() {
  for (let i = 0; i < MAX_RINGS; i++) {
    const r = rings[i];
    if (r.active) {
      ringsPosData[i*4]   = r.pos[0];
      ringsPosData[i*4+1] = r.pos[1];
      ringsPosData[i*4+2] = r.pos[2];
      ringsPosData[i*4+3] = r.radius;
      ringsMatsData[i*9]   = r.right[0];
      ringsMatsData[i*9+1] = r.right[1];
      ringsMatsData[i*9+2] = r.right[2];
      ringsMatsData[i*9+3] = r.up[0];
      ringsMatsData[i*9+4] = r.up[1];
      ringsMatsData[i*9+5] = r.up[2];
      ringsMatsData[i*9+6] = r.fwd[0];
      ringsMatsData[i*9+7] = r.fwd[1];
      ringsMatsData[i*9+8] = r.fwd[2];
    } else {
      ringsPosData[i*4+3] = -1.0;
    }
  }
  return { pos: ringsPosData, mats: ringsMatsData };
}
