// GLSL sources for the single fullscreen-triangle raymarching pass.
// MB_CENTER / MB_SCALE must stay in sync with MB_* in config.js.

export const vsSrc = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const fsSrc = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCamPos;
uniform mat3 uCamMat;
uniform vec3 uSunDir;
uniform float uFov;
uniform vec2 uJitter;
uniform float uPixScale;
uniform vec3 uCraftPos;
uniform mat3 uCraftMat;
uniform vec4 uRingsPos[8];
uniform mat3 uRingMats[8];

out vec4 fragColor;

const float WATER_LEVEL = -8.0;
const float T_MAX = 9000.0;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    v += a * noise(p);
    p = p * 2.0 + vec2(13.7, 7.3);
    a *= 0.5;
  }
  return v;
}
float ridged(vec2 p, int oct) {
  float v = 0.0, a = 0.5, prev = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
    n = n * n;
    v += a * n * prev;
    prev = n;
    p = p * 2.0 + vec2(7.3, 13.7);
    a *= 0.5;
  }
  return v;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

const vec2  MB_CENTER = vec2(-0.55, 0.0);
const float MB_SCALE  = 2.5e-4;

float mandelDE(vec2 c, int maxIter) {
  vec2 z = vec2(0.0), dz = vec2(0.0);
  float m2 = 0.0;
  for (int i = 0; i < 26; i++) {
    if (i >= maxIter) break;
    dz = 2.0 * vec2(z.x*dz.x - z.y*dz.y, z.x*dz.y + z.y*dz.x) + vec2(1.0, 0.0);
    z  = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    m2 = dot(z, z);
    if (m2 > 1e6) break;
  }
  if (m2 < 4.0) return 0.0;
  return sqrt(m2 / max(dot(dz, dz), 1e-12)) * 0.5 * log(m2);
}

float terrainShape(vec2 p) {
  float de   = mandelDE(p * MB_SCALE + MB_CENTER, 26);
  float mass = exp(-de * 14.0);
  float baseElev = fbm(p * 0.0004, 3) * 90.0 - 12.0;
  vec2 q  = vec2(fbm(p * 0.0009, 3), fbm(p * 0.0009 + vec2(5.2, 1.3), 3));
  vec2 pw = p + q * 60.0;
  float mountain = (80.0 + 400.0 * ridged(pw * 0.0016, 5)) * mass;
  mountain = 460.0 * tanh(mountain / 460.0);
  float h = smax(baseElev, mountain, 45.0);
  float valley = fbm(p * 0.0003 + 200.0, 3);
  float lake   = smoothstep(0.55, 0.7, valley) * (1.0 - mass);
  h = mix(h, -15.0, lake * 0.7);
  return h;
}

float terrainCheapH(vec2 p) {
  float de   = mandelDE(p * MB_SCALE + MB_CENTER, 14);
  float mass = exp(-de * 14.0);
  float mountain = (80.0 + 400.0 * ridged(p * 0.0016, 2)) * mass;
  mountain = 460.0 * tanh(mountain / 460.0);
  return smax(fbm(p * 0.0004, 2) * 90.0 - 12.0, mountain, 45.0);
}

vec3 terrainColor(vec3 pos, vec3 normal, float h, float pixelSize) {
  float slope = 1.0 - normal.y;
  float snowAmt = smoothstep(35.0, 70.0, h) * (1.0 - smoothstep(0.4, 0.7, slope));
  snowAmt *= 0.7 + 0.3 * noise(pos.xz * 0.08);
  float rockAmt = smoothstep(0.4, 0.7, slope);
  vec3 rockCol = mix(vec3(0.30, 0.24, 0.19), vec3(0.44, 0.39, 0.34), noise(pos.xz * 0.03));
  float forestAmt = smoothstep(0.0, 30.0, h) * smoothstep(70.0, 30.0, h) * (1.0 - smoothstep(0.5, 0.8, slope));
  vec3 forestCol = vec3(0.05, 0.14, 0.05);
  if (pixelSize < 3.0) {
    float tn = noise(pos.xz * 1.2);
    forestCol = mix(forestCol, vec3(0.02, 0.08, 0.02), tn);
    float tn2 = noise(pos.xz * 3.5 + 50.0);
    forestCol = mix(forestCol, vec3(0.13, 0.24, 0.11), tn2 * 0.5);
  }
  vec3 grassCol = vec3(0.17, 0.27, 0.08);
  if (pixelSize < 1.0) {
    grassCol = mix(grassCol, vec3(0.24, 0.34, 0.12), noise(pos.xz * 0.8));
  }
  float shoreAmt = smoothstep(-5.0, 5.0, h) * (1.0 - smoothstep(5.0, 15.0, h));
  vec3 shoreCol = vec3(0.55, 0.50, 0.38);
  vec3 col = grassCol;
  col = mix(col, forestCol, forestAmt);
  col = mix(col, rockCol, rockAmt);
  col = mix(col, shoreCol, shoreAmt * (1.0 - rockAmt) * (1.0 - forestAmt));
  vec3 snowCol = mix(vec3(0.80, 0.85, 0.94), vec3(0.96, 0.97, 1.0), normal.y);
  col = mix(col, snowCol, snowAmt);
  return col;
}

vec3 terrainNormal(vec2 p, float pixelSize) {
  float e = max(0.4 * pixelSize, 0.15);
  float hL = terrainShape(p - vec2(e, 0.0));
  float hR = terrainShape(p + vec2(e, 0.0));
  float hD = terrainShape(p - vec2(0.0, e));
  float hU = terrainShape(p + vec2(0.0, e));
  return normalize(vec3(hL - hR, 2.0 * e, hD - hU));
}

float marchTerrain(vec3 ro, vec3 rd) {
  float t = 0.5;
  float pt = t, pd = 1e5;
  for (int i = 0; i < 150; i++) {
    vec3 p = ro + rd * t;
    if (p.y > 560.0 && rd.y > 0.0) return -1.0;
    float d = p.y - terrainShape(p.xz);
    if (d < 0.01 + 0.0015 * t) {
      float w = clamp(pd / (pd - d), 0.0, 1.0);
      return mix(pt, t, w);
    }
    pt = t; pd = d;
    t += d * 0.55 + t * 0.0018;
    if (t > T_MAX) break;
  }
  return -1.0;
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 4.0;
  for (int i = 0; i < 24; i++) {
    vec3 p = ro + rd * t;
    if (p.y > 560.0) break;
    float h = p.y - terrainCheapH(p.xz);
    res = min(res, 5.0 * h / t);
    if (res < 0.01) break;
    t += clamp(h, 6.0, 90.0);
  }
  return clamp(res, 0.0, 1.0);
}

vec3 skyColor(vec3 rd, vec3 sun) {
  float sd = clamp(dot(rd, sun), 0.0, 1.0);
  float horiz = 1.0 - smoothstep(0.0, 0.45, rd.y);
  vec3 col = mix(vec3(0.62, 0.70, 0.84), vec3(0.10, 0.24, 0.48), smoothstep(-0.05, 0.55, rd.y));
  col = mix(col, vec3(1.00, 0.58, 0.28), pow(sd, 5.0) * horiz * 0.75);
  col += vec3(1.00, 0.72, 0.42) * pow(sd, 48.0) * 0.55;
  col += vec3(1.00, 0.88, 0.65) * pow(sd, 900.0) * 3.0;
  if (rd.y > 0.015) {
    vec2 cuv = rd.xz / (rd.y + 0.18) * 1.4;
    float cl = fbm(cuv * 2.0 + vec2(uTime * 0.012, 0.0), 5);
    float cm = smoothstep(0.52, 0.82, cl) * smoothstep(0.015, 0.16, rd.y);
    vec3 cc = mix(vec3(0.92, 0.93, 0.95), vec3(1.0, 0.82, 0.62), pow(sd, 3.0));
    col = mix(col, cc, cm * 0.65);
  }
  return col;
}

float fogFactor(vec3 ro, vec3 rd, float t) {
  float midY = max(ro.y + rd.y * t * 0.5, 0.0);
  float hf = exp(-midY * 0.004);
  return 1.0 - exp(-t * 0.00045 * (0.30 + hf));
}
vec3 applyFog(vec3 col, vec3 ro, vec3 rd, float t, vec3 sun) {
  float f = fogFactor(ro, rd, t);
  float sd = clamp(dot(rd, sun), 0.0, 1.0);
  vec3 fcol = mix(vec3(0.58, 0.65, 0.78), vec3(1.0, 0.70, 0.40), pow(sd, 6.0));
  return mix(col, fcol, f);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdEll(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-5);
}
float sdCraft(vec3 p) {
  float d = sdEll(p, vec3(0.50, 0.42, 2.30));
  d = min(d, sdEll(p - vec3(0.0, 0.30, 0.55), vec3(0.28, 0.24, 0.72)));
  vec3 w = p - vec3(0.0, -0.05, 0.25);
  w.z += abs(w.x) * 0.28;
  d = min(d, sdBox(w, vec3(3.10, 0.05, 0.52 - abs(w.x) * 0.06)));
  vec3 tp = p - vec3(0.0, 0.06, -2.00);
  tp.z += abs(tp.x) * 0.32;
  d = min(d, sdBox(tp, vec3(1.05, 0.04, 0.30)));
  vec3 f = p - vec3(0.0, 0.45, -2.05);
  f.z += f.y * 0.55;
  d = min(d, sdBox(f, vec3(0.04, 0.52, 0.32)));
  return d;
}
vec3 toCraftLocal(vec3 wp) {
  return transpose(uCraftMat) * (wp - uCraftPos);
}
float marchCraft(vec3 ro, vec3 rd) {
  vec3 oc = ro - uCraftPos;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - 22.0;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float sq = sqrt(disc);
  float t0 = max(-b - sq, 0.0);
  float t1 = -b + sq;
  if (t1 < 0.0) return -1.0;
  float t = t0;
  for (int i = 0; i < 64; i++) {
    float d = sdCraft(toCraftLocal(ro + rd * t));
    if (d < 0.004) return t;
    t += d;
    if (t > t1) return -1.0;
  }
  return -1.0;
}
vec3 craftNormal(vec3 wp) {
  vec3 lp = toCraftLocal(wp);
  vec2 e = vec2(0.01, 0.0);
  vec3 n = normalize(vec3(
    sdCraft(lp + e.xyy) - sdCraft(lp - e.xyy),
    sdCraft(lp + e.yxy) - sdCraft(lp - e.yxy),
    sdCraft(lp + e.yyx) - sdCraft(lp - e.yyx)));
  return uCraftMat * n;
}

float sdTorusZ(vec3 p, float r, float th) {
  vec2 q = vec2(length(p.xy) - r, p.z);
  return length(q) - th;
}

float marchRings(vec3 ro, vec3 rd) {
  float tBest = 1e5;
  for (int i = 0; i < 8; i++) {
    if (uRingsPos[i].w <= 0.0) continue;
    vec3 p = uRingsPos[i].xyz;
    vec3 oc = ro - p;
    float b = dot(oc, rd);
    float r = uRingsPos[i].w;
    float c = dot(oc, oc) - (r * r + 10.0);
    float disc = b * b - c;
    if (disc < 0.0) continue;
    float sq = sqrt(disc);
    float t0 = max(-b - sq, 0.0);
    float t1 = -b + sq;
    float t = t0;
    for (int j = 0; j < 16; j++) {
      vec3 wp = ro + rd * t;
      vec3 lp = transpose(uRingMats[i]) * (wp - p);
      float d = sdTorusZ(lp, r, 1.5);
      if (d < 0.02) {
        tBest = min(tBest, t);
        break;
      }
      t += d * 0.75;
      if (t > t1) break;
    }
  }
  return tBest;
}

vec3 ringNormal(vec3 wp) {
  float minD = 1e5;
  vec3 normal = vec3(0, 1, 0);
  for (int i = 0; i < 8; i++) {
    if (uRingsPos[i].w <= 0.0) continue;
    vec3 p = uRingsPos[i].xyz;
    vec3 lp = transpose(uRingMats[i]) * (wp - p);
    float r = uRingsPos[i].w;
    float d = sdTorusZ(lp, r, 1.5);
    if (d < minD) {
      minD = d;
      vec2 xy = lp.xy;
      float lenXY = max(length(xy), 0.001);
      vec3 nloc = normalize(vec3(xy.x, xy.y, 0.0) * (lenXY - r) / lenXY + vec3(0.0, 0.0, lp.z));
      normal = uRingMats[i] * nloc;
    }
  }
  return normal;
}

void main() {
  vec2 uv = (2.0 * (gl_FragCoord.xy + uJitter) - uResolution) / uResolution.y;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamMat * vec3(uv * uFov, 1.0));
  vec3 sun = normalize(uSunDir);

  float tT = marchTerrain(ro, rd);
  float tW = (rd.y < -1e-4 && ro.y > WATER_LEVEL) ? (WATER_LEVEL - ro.y) / rd.y : -1.0;
  float tC = marchCraft(ro, rd);
  float tR = marchRings(ro, rd);

  float t = T_MAX;
  int mat = 0;
  if (tT > 0.0 && tT < t) { t = tT; mat = 1; }
  if (tW > 0.0 && tW < t) { t = tW; mat = 2; }
  if (tC > 0.0 && tC < t) { t = tC; mat = 3; }
  if (tR > 0.0 && tR < t) { t = tR; mat = 4; }

  vec3 col;

  if (mat == 0) {
    col = skyColor(rd, sun);
  } else if (mat == 1) {
    vec3 pos = ro + rd * t;
    float px = t * uPixScale;
    vec3 n = terrainNormal(pos.xz, px);
    vec3 alb = terrainColor(pos, n, pos.y, px);
    float ndl = clamp(dot(n, sun), 0.0, 1.0);
    float sh = (ndl > 0.02) ? softShadow(pos + n * 1.0, sun) : 0.0;
    float dif = ndl * sh;
    float skyA = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
    float bnc = clamp(dot(n, normalize(vec3(-sun.x, 0.0, -sun.z))), 0.0, 1.0);
    vec3 lin = vec3(1.30, 1.02, 0.78) * 2.3 * dif
             + vec3(0.42, 0.56, 0.82) * 0.50 * skyA
             + vec3(0.90, 0.60, 0.40) * 0.12 * bnc;
    col = alb * lin;
    float snowy = smoothstep(35.0, 70.0, pos.y) * n.y;
    vec3 hlf = normalize(sun - rd);
    col += vec3(1.0, 0.9, 0.7) * pow(clamp(dot(n, hlf), 0.0, 1.0), 48.0) * snowy * sh * 0.6;
    col = applyFog(col, ro, rd, t, sun);
  } else if (mat == 2) {
    vec3 pos = ro + rd * t;
    float bed = terrainShape(pos.xz);
    float depth = clamp((WATER_LEVEL - bed) / 8.0, 0.0, 1.0);
    float w0 = noise(pos.xz * 0.12 + uTime * 0.25);
    float wx = noise(pos.xz * 0.12 + vec2(0.6, 0.0) + uTime * 0.25) - w0;
    float wz = noise(pos.xz * 0.12 + vec2(0.0, 0.6) + uTime * 0.25) - w0;
    vec3 n = normalize(vec3(-wx * 1.6, 1.0, -wz * 1.6));
    vec3 rr = reflect(rd, n);
    rr.y = abs(rr.y);
    vec3 refl = skyColor(rr, sun);
    float fres = 0.03 + 0.97 * pow(1.0 - clamp(dot(-rd, n), 0.0, 1.0), 5.0);
    vec3 base = mix(vec3(0.10, 0.30, 0.28), vec3(0.02, 0.10, 0.13), depth);
    float sh = softShadow(pos + vec3(0.0, 0.5, 0.0), sun);
    col = mix(base, refl, fres);
    col += vec3(1.0, 0.80, 0.50) * pow(clamp(dot(rr, sun), 0.0, 1.0), 260.0) * 3.0 * fres * sh;
    col = applyFog(col, ro, rd, t, sun);
  } else if (mat == 3) {
    vec3 pos = ro + rd * t;
    vec3 n = craftNormal(pos);
    vec3 lp = toCraftLocal(pos);
    vec3 alb = vec3(0.88, 0.89, 0.92);
    float red = clamp(step(1.65, lp.z) + step(2.55, abs(lp.x)) + ((lp.y > 0.35 && lp.z < -1.6) ? 1.0 : 0.0), 0.0, 1.0);
    alb = mix(alb, vec3(0.75, 0.10, 0.08), red);
    float sh = softShadow(pos, sun);
    float dif = clamp(dot(n, sun), 0.0, 1.0) * sh;
    float skyA = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
    vec3 lin = vec3(1.30, 1.02, 0.78) * 2.2 * dif + vec3(0.42, 0.56, 0.82) * 0.55 * skyA;
    vec3 hlf = normalize(sun - rd);
    col = alb * lin + vec3(1.0, 0.9, 0.75) * pow(clamp(dot(n, hlf), 0.0, 1.0), 60.0) * sh * 0.8;
    col = applyFog(col, ro, rd, t, sun);
  } else if (mat == 4) {
    vec3 pos = ro + rd * t;
    vec3 n = ringNormal(pos);
    vec3 lp = vec3(0.0);
    float minD = 1e5;
    for (int i = 0; i < 8; i++) {
      if (uRingsPos[i].w <= 0.0) continue;
      vec3 p = uRingsPos[i].xyz;
      vec3 l = transpose(uRingMats[i]) * (pos - p);
      float r = uRingsPos[i].w;
      float d = sdTorusZ(l, r, 1.5);
      if (d < minD) { minD = d; lp = l; }
    }
    float angle = atan(lp.y, lp.x);
    float stripe = step(0.0, sin(angle * 8.0 + uTime * 6.0));
    vec3 alb = mix(vec3(1.0, 0.85, 0.2), vec3(0.9, 0.5, 0.0), stripe * 0.6);
    float sh = softShadow(pos + n * 0.5, sun);
    float dif = clamp(dot(n, sun), 0.0, 1.0) * sh;
    float skyA = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
    vec3 lin = vec3(1.3, 1.02, 0.78) * 1.5 * dif + vec3(0.42, 0.56, 0.82) * 0.6 * skyA;
    vec3 hlf = normalize(sun - rd);
    float spec = pow(clamp(dot(n, hlf), 0.0, 1.0), 32.0);
    col = alb * lin + vec3(1.0, 0.9, 0.7) * spec * sh;
    float rim = 1.0 - max(dot(n, -rd), 0.0);
    col += vec3(1.0, 0.6, 0.1) * pow(rim, 2.0) * 0.8;
    col += alb * 0.4;
    col = applyFog(col, ro, rd, t, sun);
  }

  col = 1.0 - exp(-col * 1.15);
  col = pow(col, vec3(0.4545));
  vec2 vuv = gl_FragCoord.xy / uResolution;
  col *= 0.35 + 0.65 * pow(16.0 * vuv.x * vuv.y * (1.0 - vuv.x) * (1.0 - vuv.y), 0.20);
  fragColor = vec4(col, 1.0);
}`;
