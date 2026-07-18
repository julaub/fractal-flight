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
// Rodrigues: rotate v around unit axis by ang (radians)
export function rotV(v, ax, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const cr = cross3(ax, v);
  const d = ax[0]*v[0] + ax[1]*v[1] + ax[2]*v[2];
  const t = d * (1 - c);
  return [v[0]*c + cr[0]*s + ax[0]*t,
          v[1]*c + cr[1]*s + ax[1]*t,
          v[2]*c + cr[2]*s + ax[2]*t];
}
