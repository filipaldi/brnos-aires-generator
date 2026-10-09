// Composes the sheet off the main thread (engine.js owns the protocol and
// the fallback). Receives {id, spec, fontUrls} and answers {id, ...vysledok}
// or {id, error}: a rejected spec is a message for the user, not a worker
// failure, so it travels as data like every other result.

// Text wraps through canvas measurement of the real fonts (meranie.js is
// worker-safe); the first request waits until they have loaded.

import { komponuj } from '../core/kompozicia/index.js';
import { vytvorMeranie } from './meranie.js';

self.onmessage = async (e) => {
  const { id, spec, fontUrls } = e.data;
  try {
    const { zmerajText, zmerajGlyfy, ready } = vytvorMeranie(fontUrls);
    await ready;
    self.postMessage({ id, ...komponuj(spec, { fontUrls, zmerajText, zmerajGlyfy }) });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
