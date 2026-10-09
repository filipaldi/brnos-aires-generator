// Precise text widths for the composition engine: canvas measureText with the
// same two fonts the SVG sets text in ('Brnos Aires', 'Nunito') and the same
// font features as the sheet text ('liga', 'ss01'). Runs on the main thread
// and in a Web Worker: fonts load through FontFace added to self.fonts (a
// worker has no document), the canvas is an OffscreenCanvas when the engine
// has one, else a DOM canvas.

const MERNA_VELKOST = 100; // px: measure at one fixed size, scale to velkost
const FONT_FEATURES = "'liga', 'ss01'";

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

// Returns zmerajText(text, pismo, velkost) → width in velkost units
// (dieliks), the contract core komponuj expects in opts.zmerajText. Until the
// fonts land the canvas measures with a fallback face; zmerajText.ready
// settles after the load and the caller should redraw then.
export function vytvorMeranie(fontUrls) {
  const kluc = JSON.stringify(fontUrls || {});
  if (zdielane && zdielane.kluc === kluc) return zdielane.meranie;

  const ctx = vytvorKontext();
  // Not every 2D context takes font features (the canvas spec added them
  // late); without them ligatures measure in their unligated widths and the
  // wrap can differ from the SVG by a glyph or two.
  let featurey = false;
  if ('fontFeatureSettings' in ctx) {
    try {
      ctx.fontFeatureSettings = FONT_FEATURES;
      featurey = ctx.fontFeatureSettings !== 'normal';
    } catch {
      featurey = false;
    }
  }

  const mnozina = (typeof self !== 'undefined' && self.fonts) || document.fonts;
  const nacitania = [];
  for (const [name, url] of Object.entries(fontUrls || {})) {
    const face = new FontFace(name, `url("${url}")`);
    // a window already declares both faces in CSS with the same URLs — the
    // extra FontFace only makes the load awaitable, the browser fetches once
    mnozina.add(face);
    nacitania.push(face.load().catch((err) => {
      console.warn(`Písmo ${name} sa nepodarilo načítať, meriam náhradným písmom.`, err);
    }));
  }

  function zmerajText(text, pismo, velkost) {
    ctx.font = `${MERNA_VELKOST}px '${pismo}'`;
    if (featurey) ctx.fontFeatureSettings = FONT_FEATURES;
    return (ctx.measureText(text).width / MERNA_VELKOST) * velkost;
  }

  zmerajText.ready = Promise.all(nacitania).then(() => {});
  zdielane = { kluc, meranie: zmerajText };
  return zmerajText;
}
