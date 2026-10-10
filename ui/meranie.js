// Precise text widths for the composition engine: canvas measureText with the
// same faces the SVG sets text in (rezy of Brnos Aires, the weight axis of
// Nunito) and the font features of the measured text zone, handed in by the
// core (a disabled liga must measure unligated). Runs on the main thread and
// in a Web Worker: fonts load through FontFace added to self.fonts (a worker
// has no document), the canvas is an OffscreenCanvas when the engine has one,
// else a DOM canvas.

import { fontFeatureSettings } from '../core/kompozicia/features.js';
import { facesFontov } from '../core/kompozicia/pisma.js';

const MERNA_VELKOST = 100; // px: measure at one fixed size, scale to velkost

function vytvorKontext() {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(1, 1).getContext('2d');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.getContext('2d');
}

// The sheet and every export measure the same font set: one canvas and one
// font load serve all callers with the same URLs.
let zdielane = null;

// Returns zmerajText(text, pismo, velkost, features, face) → width in
// velkost units (dieliks), the contract core komponuj expects in
// opts.zmerajText; `face` ({ family, weight }) is the zone's rez or axis
// weight, so a heavy line measures as heavy. Until the fonts land the canvas
// measures with a fallback face; zmerajText.ready settles after the load and
// the caller should redraw then.
export function vytvorMeranie(fontUrls) {
  const kluc = JSON.stringify(fontUrls || {});
  if (zdielane && zdielane.kluc === kluc) return zdielane.meranie;

  const ctx = vytvorKontext();
  // Setting font features on a 2D context is best effort: Chromium parses
  // fontFeatureSettings but ignores it for glyph selection, so the canvas
  // measures the font's default rendering. The wrap can then differ from the
  // SVG by a glyph or two where the zone's features change glyph widths.
  let featurey = false;
  if ('fontFeatureSettings' in ctx) {
    try {
      ctx.fontFeatureSettings = "'liga' 1";
      featurey = ctx.fontFeatureSettings !== 'normal';
    } catch {
      featurey = false;
    }
  }

  const mnozina = (typeof self !== 'undefined' && self.fonts) || document.fonts;
  const nacitania = [];
  for (const face of facesFontov(fontUrls)) {
    // the weight descriptor matters: a variable font must load as the whole
    // axis ('200 1000'), a rez with its exact weight — otherwise the canvas
    // would clamp every zone to the file's default weight
    const ff = new FontFace(face.family, `url("${face.url}")`, {
      weight: face.weight,
      style: face.style,
    });
    // a window already declares the same faces in CSS with the same URLs —
    // the extra FontFace only makes the load awaitable, the browser fetches
    // once
    mnozina.add(ff);
    nacitania.push(ff.load().catch((err) => {
      console.warn(`Písmo ${face.family} (${face.weight}) sa nepodarilo načítať, meriam náhradným písmom.`, err);
    }));
  }

  function zmerajText(text, pismo, velkost, features, face) {
    ctx.font = `${face?.weight ?? 400} ${MERNA_VELKOST}px '${face?.family ?? pismo}'`;
    // features arrive per zone; without them (legacy callers) measure plain
    if (featurey) ctx.fontFeatureSettings = fontFeatureSettings(features);
    return (ctx.measureText(text).width / MERNA_VELKOST) * velkost;
  }

  zmerajText.ready = Promise.all(nacitania).then(() => {});
  zdielane = { kluc, meranie: zmerajText };
  return zmerajText;
}
