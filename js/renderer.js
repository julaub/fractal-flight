// WebGL2 setup and per-frame rendering: shader compilation, uniform upload,
// canvas sizing and adaptive render-scale quality control.

import { vsSrc, fsSrc } from './shaders.js';
import { TAN_HALF_FOV } from './config.js';

export const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });

const view = {
  renderScale: 0.85,
  DPR: Math.min(window.devicePixelRatio || 1, 1.0),
};

let U = null;

function fatal(msg) {
  const e = document.getElementById('err');
  e.textContent = 'SHADER / GL ERROR\n\n' + msg;
  e.style.display = 'block';
  console.error(msg);
}

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { fatal(gl.getShaderInfoLog(s)); return null; }
  return s;
}

// Returns false (after showing the error overlay) if WebGL2 or the shaders fail.
export function initRenderer() {
  if (!gl) {
    document.body.innerHTML = '<p style="color:#fff;font-family:monospace;padding:20px">WebGL2 required.</p>';
    return false;
  }
  const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return false;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fatal(gl.getProgramInfoLog(prog)); return false; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const locPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(locPos);
  gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

  U = {};
  ['uResolution','uTime','uCamPos','uCamMat','uSunDir','uFov','uJitter','uPixScale','uCraftPos','uCraftMat','uRingsPos','uRingMats']
    .forEach(n => U[n] = gl.getUniformLocation(prog, n));

  window.addEventListener('resize', resize);
  resize();
  return true;
}

export function setRenderScale(s) {
  view.renderScale = s;
}

// Called with the measured FPS every ~0.75s; trades resolution for frame rate.
export function adjustQuality(fps) {
  if (fps < 32 && view.renderScale > 0.4) view.renderScale = Math.max(0.4, view.renderScale - 0.15);
  else if (fps > 56 && view.renderScale < 1.0) view.renderScale = Math.min(1.0, view.renderScale + 0.05);
}

export function resize() {
  const w = Math.round(canvas.clientWidth * view.DPR * view.renderScale);
  const h = Math.round(canvas.clientHeight * view.DPR * view.renderScale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

export function render(f) {
  gl.uniform2f(U.uResolution, canvas.width, canvas.height);
  gl.uniform1f(U.uTime, f.time);
  gl.uniform3fv(U.uCamPos, f.camPos);
  gl.uniformMatrix3fv(U.uCamMat, false, f.camMat);
  gl.uniform3fv(U.uSunDir, f.sunDir);
  gl.uniform1f(U.uFov, TAN_HALF_FOV);
  gl.uniform2f(U.uJitter, 0, 0);
  gl.uniform1f(U.uPixScale, 2 * TAN_HALF_FOV / canvas.height);
  gl.uniform3fv(U.uCraftPos, f.craftPos);
  gl.uniformMatrix3fv(U.uCraftMat, false, f.craftMat);
  gl.uniform4fv(U.uRingsPos, f.ringsPos);
  gl.uniformMatrix3fv(U.uRingMats, false, f.ringMats);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
