// HUD readouts (altitude / speed / heading / FPS / score), compass needle,
// score pulse animation, and the toast used for transient messages.

import { WATER_LEVEL } from './config.js';
import { craft } from './state.js';

const $alt = document.getElementById('alt');
const $spd = document.getElementById('spd');
const $hdg = document.getElementById('hdg');
const $fps = document.getElementById('fps');
const $needle = document.getElementById('cneedle');
const $score = document.getElementById('score');
const $scoreBox = document.getElementById('rings-score');
const $toast = document.getElementById('toast');

let toastTimer = 0;

export function updateHUD(score, fps) {
  $alt.textContent = Math.round(craft.pos[1] - WATER_LEVEL);
  $spd.textContent = Math.round(craft.speed);
  let deg = Math.round(craft.yaw * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  $hdg.textContent = String(deg).padStart(3, '0');
  $needle.setAttribute('transform', 'rotate(' + (-deg) + ')');
  $fps.textContent = fps;
  $score.textContent = score;
}

export function pulseScore() {
  $scoreBox.style.transform = 'translateX(-50%) scale(1.3)';
  setTimeout(() => { $scoreBox.style.transform = 'translateX(-50%) scale(1)'; }, 150);
}

export function toast(msg, ms) {
  $toast.textContent = msg;
  $toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.style.display = 'none'; }, ms || 4000);
}

export function hideToast() {
  $toast.style.display = 'none';
}
