// Small vector / orientation helpers shared across modules.

export function clamp1(v) {
  return Math.max(-1, Math.min(1, v));
}

export function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function cross3(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

// Right/up/forward basis from yaw, pitch, roll, plus the column-major mat3
// ready for gl.uniformMatrix3fv.
export function basis(yaw, pitch, roll) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fwd = [Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp];
  let right = normalize3(cross3(fwd, [0, 1, 0]));
  if (!isFinite(right[0])) right = [1, 0, 0];
  let up = cross3(right, fwd);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const r2 = [right[0]*cr + up[0]*sr, right[1]*cr + up[1]*sr, right[2]*cr + up[2]*sr];
  const u2 = [up[0]*cr - right[0]*sr, up[1]*cr - right[1]*sr, up[2]*cr - right[2]*sr];
  return { right: r2, up: u2, fwd, mat: new Float32Array([...r2, ...u2, ...fwd]) };
}
