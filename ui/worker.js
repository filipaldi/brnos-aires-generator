// Composes the sheet off the main thread (engine.js owns the protocol and
// the fallback). Receives {id, spec, fontUrls} and answers {id, ...vysledok}
// or {id, error}: a rejected spec is a message for the user, not a worker
// failure, so it travels as data like every other result.

import { komponuj } from '../core/kompozicia/index.js';

self.onmessage = (e) => {
  const { id, spec, fontUrls } = e.data;
  try {
    self.postMessage({ id, ...komponuj(spec, { fontUrls }) });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
