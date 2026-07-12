// Shared constants. The MB_* values must match the ones hardcoded in the
// fragment shader (shaders.js) so the CPU terrain height mirrors the GPU.

export const FOV_DEG = 70;
export const TAN_HALF_FOV = Math.tan(FOV_DEG * 0.5 * Math.PI / 180);
export const WATER_LEVEL = -8.0;
export const START = { x: 0, y: 480, z: 0, yaw: 0, pitch: 0 };
export const MAX_RINGS = 8;

export const MB_CX = -0.55;
export const MB_CY = 0.0;
export const MB_SCL = 2.5e-4;
