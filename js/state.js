// Central mutable game state. Modules mutate these objects in place;
// none of the bindings are ever reassigned.

import { START } from './config.js';

export const craft = {
  pos: [START.x, START.y, START.z],
  // v4.0 FREE FLIGHT: orientation is an orthonormal triad (right/up/fwd)
  // rotated incrementally in the craft's own body frame — no Euler angles,
  // no gimbal lock. Loops, rolls, and inverted flight all just work.
  r: [-1, 0, 0], u: [0, 1, 0], f: [0, 0, 1],
  rollVel: 0, pitchVel: 0,     // smoothed angular rates (rad/s)
  speed: 90
};
export function craftB() {
  return { right: craft.r, up: craft.u, fwd: craft.f,
           mat: new Float32Array([...craft.r, ...craft.u, ...craft.f]) };
}

export const camPos = [craft.pos[0], craft.pos[1] + 6, craft.pos[2] - 18];
export const sun = { az: 2.55, el: 0.20 };   // low sun -> long shadows

export const flags = { crashed: false };

// GPU collision probe answers (decoded each frame in main.js; one frame of
// latency — probe.pos is the craft position the current values answer for)
export const probe = { ground: null, plantD: 99, pos: [0, 0, 0] };
