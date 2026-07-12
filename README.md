# Fractal Alps — Mandelbrot Flight

A WebGL2 raymarched flight game over Mandelbrot-shaped mountains. Fly through
rings to score. Works with keyboard (desktop) and touch / gyroscope tilt
(mobile).

## Running

The game uses ES modules, so it must be served over HTTP (opening `index.html`
via `file://` will not work):

```sh
python3 -m http.server 8734
# then open http://localhost:8734/
```

Note for mobile: browsers only expose motion sensors (TILT mode) on secure
origins — serve over HTTPS, or use `adb reverse` so the phone sees
`localhost`. Vanadium/GrapheneOS additionally blocks motion sensors per
site setting by default.

## Structure

```
index.html          Markup only: canvas, HUD, touch controls, overlays
css/style.css       All styling, including touch-only UI (body.touch)
js/
  main.js           Entry point: wiring + the requestAnimationFrame loop
  config.js         Shared constants (FOV, water level, Mandelbrot params…)
  state.js          Central mutable game state (craft, camera, sun)
  math.js           Vector helpers and yaw/pitch/roll basis
  flight.js         Flight model + chase camera (per-frame update)
  input.js          Keyboard, sun drag, joystick, touch buttons, gyro tilt
  rings.js          Ring spawning, pass-through detection, scoring
  terrain.js        CPU terrain height (mirrors the GPU terrainShape)
  hud.js            HUD readouts, score pulse, toast messages
  shaders.js        GLSL vertex + fragment shader sources
  renderer.js       WebGL2 setup, uniforms, resize, adaptive render scale
```

Conventions worth knowing before editing:

- Input sources (keyboard / joystick / gyro) each write to their own state
  object in `input.js`; `flight.js` sums and clamps them. To add a new input
  (e.g. gamepad), write into a new object and add it to the sums.
- `terrain.js` must stay numerically in sync with `terrainShape()` in
  `shaders.js` (it is used to place rings above the ground), and `config.js`
  MB_* constants must match the shader's `MB_CENTER` / `MB_SCALE`.
- `window.__fractalFlight` / `window.__fractalInput` are console debug
  handles exposing live state.
