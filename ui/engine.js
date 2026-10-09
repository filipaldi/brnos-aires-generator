// Adapter between the UI and the composition engine. The real engine lives in
// core/kompozicia/ (phase 2, built in parallel); until it exists we
// fall back to the local stub.js with the same signatures, so the UI works now
// and switches over automatically.

let impl;
let usingStub = false;
try {
  impl = await import('../core/kompozicia/index.js');
} catch (err) {
  impl = await import('./stub.js');
  usingStub = true;
  console.warn('Jadro kompozície (core/kompozicia) nie je dostupné, beží náhradný engine.', err);
}

export const isStubEngine = usingStub;
export const normalizujSpec = impl.normalizujSpec;
export const komponuj = impl.komponuj;

// renderShapeSvg is only needed by the shape viewer; keep a local fallback in
// case core/svg.js changes shape while the other agents work on it.
export let renderShapeSvg = null;
try {
  ({ renderShapeSvg } = await import('../core/svg.js'));
} catch {
  renderShapeSvg = null;
}

// Minimal fallback with the same call contract as core/svg.js renderShapeSvg.
export function renderShapeSvgFallback(shape, { pxPerDielik = 100, margin = 0.25 } = {}) {
  const s = pxPerDielik;
  const vbX = (shape.bbox.x - margin) * s;
  const vbY = (shape.bbox.y - margin) * s;
  const vbW = (shape.bbox.w + 2 * margin) * s;
  const vbH = (shape.bbox.h + 2 * margin) * s;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(vbW))}" `
      + `height="${Math.max(1, Math.round(vbH))}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">`,
    `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#fff"/>`,
    `<path d="${shape.paths.join(' ')}" fill="#000" fill-rule="nonzero"/>`,
    '</svg>',
    '',
  ].join('\n');
}

// ---------- composing off the main thread ----------
//
// komponuj() of a full sheet takes seconds; on the main thread it froze
// every drag. The work runs in ./worker.js, a module worker: at most one
// request is in flight and only the newest spec is ever posted, so answers
// to older ids never reach the sheet. When the worker cannot be created or
// its module fails to load, requests are composed right here — exactly the
// pre-worker behaviour — so the UI never loses its drawing.

let worker = null;
let workerMrtvy = false; // the worker proved unusable: compose on the main thread
let voVlakne = null;     // request the worker is composing right now
let voFronte = null;     // the newest request waiting for the worker

async function vyriesNaMieste({ id, spec, fontUrls, resolve }) {
  try {
    const { vytvorMeranie } = await import('./meranie.js');
    const zmerajText = vytvorMeranie(fontUrls);
    await zmerajText.ready;
    resolve({ id, ...impl.komponuj(spec, { fontUrls, zmerajText }) });
  } catch (err) {
    resolve({ id, error: err.message || String(err) });
  }
}

function odosli() {
  if (!worker || voVlakne || !voFronte) return;
  voVlakne = voFronte;
  voFronte = null;
  try {
    worker.postMessage({ id: voVlakne.id, spec: voVlakne.spec, fontUrls: voVlakne.fontUrls });
  } catch (err) {
    zrusWorkera(err.message); // unusable data or a dead worker: main thread it is
  }
}

function zrusWorkera(dovod) {
  if (workerMrtvy) return;
  workerMrtvy = true;
  try { worker?.terminate(); } catch { /* already gone */ }
  worker = null;
  console.warn(`Skladanie vo workeri zlyhalo${dovod ? `: ${dovod}` : ''}, kreslím na hlavnom vlákne.`);
  // the queued request is the newest; the one in flight (if any) is older
  // and its answer would be dropped by id anyway
  const starsia = voFronte ? voVlakne : null;
  const najnovsia = voFronte ?? voVlakne;
  voVlakne = voFronte = null;
  if (starsia) starsia.resolve({ id: starsia.id, zastarale: true });
  if (najnovsia) vyriesNaMieste(najnovsia);
}

function zalistujWorkera() {
  if (worker || workerMrtvy) return;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    workerMrtvy = true;
    console.warn(`Workera sa nepodarilo spustiť: ${err.message}. Kreslím na hlavnom vlákne.`);
    return;
  }
  worker.onmessage = (e) => {
    const data = e.data;
    if (!voVlakne || data.id !== voVlakne.id) return;
    const { resolve } = voVlakne;
    voVlakne = null;
    resolve(data);
    odosli(); // the queue may hold a newer spec by now
  };
  // a module that never loaded (blocked workers, import error…) or a worker
  // that died: fall back for good, starting with the newest waiting request
  worker.onerror = (e) => zrusWorkera(e.message);
  // an unreadable answer would otherwise leave every later request queued
  worker.onmessageerror = () => zrusWorkera('odpoveď workera sa nedala prečítať');
}

// Resolves with {id, ...vysledok} on success, {id, error} when the spec is
// rejected (show the message) or {id, zastarale} when a newer request
// replaced this one before it was even sent.
export function komponujAsync(id, spec, { fontUrls } = {}) {
  return new Promise((resolve) => {
    zalistujWorkera();
    if (workerMrtvy || !worker) {
      vyriesNaMieste({ id, spec, fontUrls, resolve });
      return;
    }
    if (voFronte) voFronte.resolve({ id: voFronte.id, zastarale: true });
    voFronte = { id, spec, fontUrls, resolve };
    odosli();
  });
}
