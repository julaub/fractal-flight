// ============ TUNING PANEL ============
// Each knob: v = live value, d = default, min/max/step, fmt = display formatting.
export const TUNE = {
  shadows:    { label: 'shadows',     v: 1,       d: 1,       min: 0,      max: 1,      step: 1,       fmt: x => x > 0.5 ? 'on' : 'off' },
  cursorA:    { label: 'cursor',      v: 0,       d: 0,       min: 0,      max: 100,    step: 5,       fmt: x => x.toFixed(0) + '%' },
  oceanSlope: { label: 'ocean slope', v: 0.026,   d: 0.026,    min: 0.004,  max: 0.06,   step: 0.001,   fmt: x => x.toFixed(3) },
  oceanMax:   { label: 'ocean depth', v: 116,     d: 116,      min: 20,     max: 140,    step: 1,       fmt: x => x.toFixed(0) },
  massDecay:  { label: 'coast width', v: 0.001,  d: 0.001,  min: 0.001,  max: 0.01,   step: 0.0001,  fmt: x => x.toFixed(4) },
  mountAmp:   { label: 'peak height', v: 420,     d: 420,     min: 100,    max: 800,    step: 10,      fmt: x => x.toFixed(0) },
  snowLine:   { label: 'snow line',   v: 220,     d: 220,     min: 60,     max: 400,    step: 5,       fmt: x => x.toFixed(0) },
  snowyPct:   { label: 'snowy peaks', v: 10,      d: 10,      min: 0,      max: 100,    step: 5,       fmt: x => x.toFixed(0) + '%' },
  fogDens:    { label: 'fog',         v: 0.00012, d: 0.00012, min: 0.00005,max: 0.0009, step: 0.00001, fmt: x => (x*1000).toFixed(2) },
  floraDens:  { label: 'flora density',v: 0.1,    d: 0.1,     min: 0,      max: 1,      step: 0.05,    fmt: x => (x*100).toFixed(0) + '%' },
  treeSize:   { label: 'tree size',   v: 13,      d: 13,      min: 4,      max: 22,     step: 1,       fmt: x => x.toFixed(0) + 'm' },
  treeShare:  { label: 'tree share',  v: 0.55,    d: 0.55,     min: 0,      max: 1,      step: 0.05,    fmt: x => (x*100).toFixed(0) + '%' },
  treeTiers:  { label: 'fronds',      v: 11,       d: 11,       min: 3,      max: 14,     step: 1,       fmt: x => x.toFixed(0) },
  treeFract:  { label: 'tree fractal',v: 0.45,     d: 0.45,    min: 0,      max: 1,      step: 0.05,    fmt: x => (x*100).toFixed(0) + '%' },
  floraRange: { label: 'flora range', v: 6000,    d: 6000,    min: 150,    max: 6000,   step: 50,      fmt: x => x.toFixed(0) },
  juliaRe:    { label: 'flora c·re',  v: 0.22,    d: 0.22,    min: -1.0,   max: 0.4,    step: 0.01,    fmt: x => x.toFixed(2) },
  juliaIm:    { label: 'flora c·im',  v: 1.00,    d: 1.00,    min: -1.0,   max: 1.0,    step: 0.01,    fmt: x => x.toFixed(2) },
  bombAngle:  { label: 'bomb angle',  v: 3,       d: 3,       min: -45,    max: 45,     step: 1,       fmt: x => x.toFixed(0) + '°' },
  cloudCount: { label: 'cloud count', v: 11,       d: 11,       min: 0,      max: 16,     step: 1,       fmt: x => x.toFixed(0) },
  cloudSize:  { label: 'cloud size',  v: 250,     d: 250,     min: 60,     max: 280,    step: 5,       fmt: x => x.toFixed(0) + ' m' },
};

export function buildTunePanel() {
  const panel = document.getElementById('tune');
  const body = document.getElementById('tuneBody');
  document.getElementById('tuneHead').addEventListener('click', () => {
    panel.classList.toggle('closed');
    panel.querySelector('.caret').textContent = panel.classList.contains('closed') ? '▸' : '▾';
  });
  for (const key in TUNE) {
    const t = TUNE[key];
    const row = document.createElement('div');
    row.className = 'trow';
    row.innerHTML = `<label>${t.label}</label><input type="range" min="${t.min}" max="${t.max}" step="${t.step}" value="${t.v}"><span class="val">${t.fmt(t.v)}</span>`;
    const slider = row.querySelector('input');
    const val = row.querySelector('.val');
    slider.addEventListener('input', () => { t.v = parseFloat(slider.value); val.textContent = t.fmt(t.v); });
    // keep flight keys working while a slider has focus
    slider.addEventListener('keydown', e => e.preventDefault());
    t._slider = slider; t._val = val;
    body.appendChild(row);
  }
  const reset = document.createElement('button');
  reset.className = 'treset'; reset.textContent = 'RESET DEFAULTS';
  reset.addEventListener('click', () => {
    for (const key in TUNE) { const t = TUNE[key]; t.v = t.d; t._slider.value = t.d; t._val.textContent = t.fmt(t.d); }
  });
  body.appendChild(reset);
}
