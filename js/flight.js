// Flight model: reads the merged inputs, integrates craft motion, and
// derives the chase-camera basis for the frame.

import { WATER_LEVEL } from './config.js';
import { craft, camPos } from './state.js';
import { basis, normalize3, clamp1 } from './math.js';
import { keys, touchInput, gyroInput } from './input.js';

export function update(dt) {
  const steer = clamp1((keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) + touchInput.steer + gyroInput.steer);
  const pitchIn = clamp1((keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0) + touchInput.pitch + gyroInput.pitch);
  const lift = clamp1((keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0) + touchInput.lift);
  const boost = keys.ShiftLeft || keys.ShiftRight || touchInput.boost;

  const targetRoll = -steer * 0.85;
  craft.roll += (targetRoll - craft.roll) * Math.min(1, dt * 4.0);
  craft.yaw += -craft.roll * dt * 1.1;

  craft.pitch += pitchIn * dt * 0.9;
  craft.pitch = Math.max(-1.1, Math.min(1.1, craft.pitch));
  if (pitchIn === 0) craft.pitch *= Math.pow(0.5, dt * 0.7);

  const targetSpeed = boost ? 280 : 95;
  craft.speed += (targetSpeed - craft.speed) * Math.min(1, dt * 2.0);

  const b = basis(craft.yaw, craft.pitch, craft.roll);
  craft.pos[0] += b.fwd[0] * craft.speed * dt;
  craft.pos[1] += b.fwd[1] * craft.speed * dt + lift * 110 * dt;
  craft.pos[2] += b.fwd[2] * craft.speed * dt;
  craft.pos[1] = Math.max(craft.pos[1], WATER_LEVEL + 4);

  // Chase camera: spring towards a point behind/above the craft
  const desired = [
    craft.pos[0] - b.fwd[0] * 17 + b.up[0] * 5.5,
    craft.pos[1] - b.fwd[1] * 17 + b.up[1] * 5.5,
    craft.pos[2] - b.fwd[2] * 17 + b.up[2] * 5.5
  ];
  const k = Math.min(1, dt * 3.5);
  camPos[0] += (desired[0] - camPos[0]) * k;
  camPos[1] += (desired[1] - camPos[1]) * k;
  camPos[2] += (desired[2] - camPos[2]) * k;

  const lookAt = [
    craft.pos[0] + b.fwd[0] * 30,
    craft.pos[1] + b.fwd[1] * 30,
    craft.pos[2] + b.fwd[2] * 30
  ];
  const cf = normalize3([lookAt[0] - camPos[0], lookAt[1] - camPos[1], lookAt[2] - camPos[2]]);
  const camYaw = Math.atan2(cf[0], cf[2]);
  const camPitch = Math.asin(Math.max(-1, Math.min(1, cf[1])));
  return { craftBasis: b, camBasis: basis(camYaw, camPitch, craft.roll * 0.30) };
}
