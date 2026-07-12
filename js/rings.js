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

function spawnRing(index, fromPos, fromFwd) {
  const dist = 400 + Math.random() * 300;
  const offsetRight = (Math.random() - 0.5) * 250;

  let right = normalize3(cross3(fromFwd, [0, 1, 0]));
  if (!isFinite(right[0])) right = [1, 0, 0];

  // Compute XZ position first
  const pos = [
    fromPos[0] + fromFwd[0] * dist + right[0] * offsetRight,
    0, // will be set from terrain below
    fromPos[2] + fromFwd[2] * dist + right[2] * offsetRight
  ];

  // Place ring above terrain with generous clearance (100–220m above ground)
  const terrainH = terrainHeightJS(pos[0], pos[2]);
  const clearance = 100 + Math.random() * 120;
  pos[1] = terrainH + clearance;

  // Ensure minimum flying altitude
  pos[1] = Math.max(pos[1], 150);

  // Orient ring to face the travel direction (from previous ring to this one)
  let fwd = normalize3([pos[0] - fromPos[0], pos[1] - fromPos[1], pos[2] - fromPos[2]]);
  right = normalize3(cross3(fwd, [0, 1, 0]));
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
