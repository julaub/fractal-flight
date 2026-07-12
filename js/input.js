// All input sources: keyboard, sun drag (mouse/touch), virtual joystick,
// touch buttons, and gyroscope tilt. Each source writes into its own state
// object; the flight model sums and clamps them, so sources can be combined.

import { sun } from './state.js';
import { toast, hideToast } from './hud.js';

export const keys = Object.create(null);
export const touchInput = { steer: 0, pitch: 0, lift: 0, boost: false };
export const gyroInput = { steer: 0, pitch: 0 };

export const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// setPointerCapture throws on synthetic events and must never block input
function capture(el, id) { try { el.setPointerCapture(id); } catch (_) {} }

export function initInput(canvas, onReset) {
  // ---- keyboard ----
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') onReset();
    if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // ---- sun drag (pointer events: mouse and touch) ----
  let dragId = null, lastMX = 0, lastMY = 0;
  canvas.addEventListener('pointerdown', e => {
    if (dragId !== null) return;
    dragId = e.pointerId; lastMX = e.clientX; lastMY = e.clientY;
    capture(canvas, e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== dragId) return;
    sun.az += (e.clientX - lastMX) * 0.005;
    sun.el = Math.min(1.25, Math.max(0.04, sun.el - (e.clientY - lastMY) * 0.004));
    lastMX = e.clientX; lastMY = e.clientY;
  });
  const endSunDrag = e => { if (e.pointerId === dragId) dragId = null; };
  canvas.addEventListener('pointerup', endSunDrag);
  canvas.addEventListener('pointercancel', endSunDrag);

  initTouch(onReset);
  initGyro();

  // Debug handle for the browser console (read-only inspection)
  window.__fractalInput = { keys, touchInput, gyroInput };

  // Block iOS Safari scroll / pull-to-refresh / double-tap zoom
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}

// ---- virtual joystick + touch buttons ----
function initTouch(onReset) {
  const joyEl = document.getElementById('joystick');
  const stickEl = document.getElementById('stick');
  let joyId = null;

  function moveStick(e) {
    const rect = joyEl.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.35;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    stickEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    touchInput.steer = -dx / max;  // stick right = bank right (matches D)
    touchInput.pitch = dy / max;   // stick up = nose down (matches W)
  }
  joyEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    joyId = e.pointerId;
    moveStick(e);
    capture(joyEl, e.pointerId);
  });
  joyEl.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveStick(e); });
  const endJoy = e => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    touchInput.steer = 0; touchInput.pitch = 0;
    stickEl.style.transform = 'translate(0px,0px)';
  };
  joyEl.addEventListener('pointerup', endJoy);
  joyEl.addEventListener('pointercancel', endJoy);

  function holdButton(id, on, off) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.classList.add('on');
      on();
      capture(el, e.pointerId);
    });
    const end = () => { el.classList.remove('on'); off(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  holdButton('btn-boost', () => { touchInput.boost = true; }, () => { touchInput.boost = false; });
  holdButton('btn-up',    () => { touchInput.lift = 1; },     () => { touchInput.lift = 0; });
  holdButton('btn-down',  () => { touchInput.lift = -1; },    () => { touchInput.lift = 0; });
  document.getElementById('btn-reset').addEventListener('pointerdown', e => {
    e.preventDefault();
    onReset();
  });
}

// ---- gyroscope tilt ----
function initGyro() {
  const gyro = { on: false, needCal: false, calSteer: 0, calPitch: 0, lastData: -1, source: null, checkTimer: 0 };
  const tiltBtn = document.getElementById('btn-tilt');

  function orientAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return window.orientation || 0;
  }

  // Remap beta (front-back) / gamma (left-right) to steer/pitch axes for the
  // current screen rotation, so tilt works in both portrait and landscape.
  function tiltAxes(e) {
    const a = ((orientAngle() % 360) + 360) % 360;
    const beta = e.beta || 0, gamma = e.gamma || 0;
    if (a === 90)  return { steer: beta,  pitch: -gamma };
    if (a === 270) return { steer: -beta, pitch: gamma };
    if (a === 180) return { steer: -gamma, pitch: -beta };
    return { steer: gamma, pitch: beta };
  }

  function onTilt(e) {
    if (e.beta === null && e.gamma === null) return; // event fired but sensor blocked/empty
    // Prefer relative events; use 'deviceorientationabsolute' only if that's all the browser delivers
    if (e.type === 'deviceorientationabsolute') {
      if (gyro.source === 'deviceorientation') return;
    } else {
      gyro.source = 'deviceorientation';
    }
    gyro.lastData = performance.now();
    if (!gyro.on) return;
    if (tiltBtn.classList.contains('err')) {
      tiltBtn.classList.remove('err');
      hideToast();
    }
    const ax = tiltAxes(e);
    if (gyro.needCal) { gyro.calSteer = ax.steer; gyro.calPitch = ax.pitch; gyro.needCal = false; }
    const DEAD = 2.5, RANGE = 22; // degrees: deadzone, then full input at DEAD+RANGE
    const shape = d => {
      const m = Math.abs(d) < DEAD ? 0 : (Math.abs(d) - DEAD) / RANGE;
      return Math.sign(d) * Math.min(1, m);
    };
    gyroInput.steer = -shape(ax.steer - gyro.calSteer); // tilt right = bank right (matches D)
    gyroInput.pitch = shape(ax.pitch - gyro.calPitch);  // tilt forward = nose down (matches W)
  }
  window.addEventListener('deviceorientation', onTilt);
  window.addEventListener('deviceorientationabsolute', onTilt);
  if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', () => { if (gyro.on) gyro.needCal = true; });
  }

  function setTilt(on) {
    gyro.on = on;
    gyro.needCal = on; // current pose becomes neutral on enable
    gyroInput.steer = 0; gyroInput.pitch = 0;
    tiltBtn.classList.toggle('on', on);
    tiltBtn.classList.remove('err');
    clearTimeout(gyro.checkTimer);
    if (on) {
      const enabledAt = performance.now();
      gyro.checkTimer = setTimeout(() => {
        if (gyro.on && gyro.lastData < enabledAt) {
          tiltBtn.classList.add('err');
          toast('NO MOTION SENSOR DATA — allow "Motion sensors" in your browser’s site settings (Vanadium blocks them by default), then tap TILT again', 8000);
        }
      }, 1500);
    } else {
      hideToast();
    }
  }
  tiltBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (gyro.on) { setTilt(false); return; }
    // iOS 13+ requires an explicit permission request from a user gesture
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(state => setTilt(state === 'granted'))
        .catch(() => setTilt(false));
    } else {
      setTilt(true);
    }
  });
}
