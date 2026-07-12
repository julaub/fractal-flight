// Entry point: wires the modules together and runs the main loop.

import { START } from './config.js';
import { craft, camPos, sun } from './state.js';
import { canvas, initRenderer, setRenderScale, adjustQuality, resize, render } from './renderer.js';
import { initRings, updateRings, packRingData, getScore } from './rings.js';
import { update } from './flight.js';
import { updateHUD, pulseScore } from './hud.js';
import { initInput, IS_TOUCH } from './input.js';

function resetGame() {
  craft.pos = [START.x, START.y, START.z];
  craft.yaw = START.yaw; craft.pitch = START.pitch; craft.roll = 0;
  initRings();
}

function main() {
  if (!initRenderer()) return;

  if (IS_TOUCH) {
    document.body.classList.add('touch');
    setRenderScale(0.6); // heavy shader: start lower on mobile GPUs, auto-scaler adjusts from there
  }

  initInput(canvas, resetGame);
  initRings();

  // Debug handle for the browser console (read-only inspection)
  window.__fractalFlight = { craft, camPos, sun };

  let lastT = performance.now();
  let fpsAcc = 0, fpsN = 0, fpsShown = 0, fpsTimer = 0;

  function frame(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    const { craftBasis, camBasis } = update(dt);
    updateRings(craft.pos, craftBasis.fwd, pulseScore);
    resize();

    fpsAcc += dt; fpsN++; fpsTimer += dt;
    if (fpsTimer > 0.75) {
      const fps = fpsN / fpsAcc;
      fpsShown = Math.round(fps);
      adjustQuality(fps);
      fpsAcc = 0; fpsN = 0; fpsTimer = 0;
    }
    updateHUD(getScore(), fpsShown);

    const sunDir = [
      Math.cos(sun.el) * Math.sin(sun.az),
      Math.sin(sun.el),
      Math.cos(sun.el) * Math.cos(sun.az)
    ];

    const ringData = packRingData();
    render({
      time: now / 1000,
      camPos,
      camMat: camBasis.mat,
      sunDir,
      craftPos: craft.pos,
      craftMat: craftBasis.mat,
      ringsPos: ringData.pos,
      ringMats: ringData.mats,
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
