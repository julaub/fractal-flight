// Central mutable game state. Modules mutate these objects in place;
// none of the bindings are ever reassigned.

import { START } from './config.js';

export const craft = {
  pos: [START.x, START.y, START.z],
  yaw: START.yaw,
  pitch: START.pitch,
  roll: 0,
  speed: 90,
};

export const camPos = [craft.pos[0], craft.pos[1] + 6, craft.pos[2] - 18];

export const sun = { az: 2.55, el: 0.20 };
