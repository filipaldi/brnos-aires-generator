// SVG assembly for compositions. One standalone document with layers
// fotky → pattern → text → spadavka (photos sit under the pattern so the
// `prekrytie` mode shows shapes over the image; clipped modes are unaffected
// because zones keep shapes away anyway). All numbers rounded to 4 decimals,
// output byte-deterministic.

import { fmt } from '../geometry.js';
import { fontFeatureSettings } from './features.js';

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Translate serialized path data (absolute M/L/C/Z only, as produced by the
// core) without a per-shape transform attribute.
export function translatePathD(d, dx, dy) {
  const out = [];
  let cmd = null;
  let nums = [];
  const flush = () => {
    if (!cmd) return;
    if (cmd === 'Z') {
      out.push('Z');
    } else {
      const n = nums.map(Number);
      if (cmd === 'C') {
        out.push(`C ${f(n[0] + dx)} ${f(n[1] + dy)} ${f(n[2] + dx)} ${f(n[3] + dy)} ${f(n[4] + dx)} ${f(n[5] + dy)}`);
      } else {
        out.push(`${cmd} ${f(n[0] + dx)} ${f(n[1] + dy)}`);
      }
    }
    nums = [];
  };
  for (const m of d.match(/-?[\d.]+(?:e-?\d+)?|[A-Za-z]/g) || []) {
    if (/[A-Za-z]/.test(m)) {
      flush();
      cmd = m;
    } else {
      nums.push(m);
    }
  }
  flush();
  return out.join(' ');
}

function f(n) {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? '0' : String(r);
}

function fontFace(name, url, format) {
  return `@font-face { font-family: '${name}'; src: url('${url}') format('${format}'); }`;
}

const FONT_FORMATS = { 'Brnos Aires': 'woff2', Nunito: 'truetype' };

export function styleForFonts(fontUrls) {
  const faces = Object.entries(fontUrls || {})
    .filter(([name]) => FONT_FORMATS[name])
    .map(([name, url]) => fontFace(name, url, FONT_FORMATS[name]));
  return faces.length ? `<style>${faces.join(' ')}</style>` : '';
}

// --- layers -----------------------------------------------------------------

function photoLayer(zony, placed, cfg, uid) {
  const parts = [];
  const defs = [];
  for (const z of zony) {
    if (z.typ !== 'fotka') continue;
    const r = z.rect;
    if (!z.zdroj) {
      // empty photo zone — a light grey placeholder keeps the frame visible
      parts.push(`<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" fill="${cfg.placeholderFarba}"/>`);
      continue;
    }
    const href = esc(z.zdroj);
    const w = r.w * z.zoom;
    const h = r.h * z.zoom;
    const x = r.x + (z.posun ? z.posun[0] : 0) * r.w;
    const y = r.y + (z.posun ? z.posun[1] : 0) * r.h;
    if (z.rezim === 'maska') {
      // clip to the largest placed shape overlapping the zone, else the rect
      const overlapping = placed
        .filter((p) => p.bbox.x < r.x + r.w && p.bbox.x + p.bbox.w > r.x
          && p.bbox.y < r.y + r.h && p.bbox.y + p.bbox.h > r.y)
        .sort((a, b) => (b.bbox.w * b.bbox.h) - (a.bbox.w * a.bbox.h));
      const shape = overlapping[0];
      const id = `maska-${uid()}`;
      if (shape) {
        defs.push(`<clipPath id="${id}"><path d="${shape.d}" clip-rule="nonzero"/></clipPath>`);
        parts.push(`<image href="${href}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`);
      } else {
        parts.push(`<image href="${href}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="xMidYMid slice"/>`);
      }
      continue;
    }
    if (z.rezim === 'prekrytie') {
      // full-zone image under the pattern layer — no clip at all
      parts.push(`<image href="${href}" x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" preserveAspectRatio="xMidYMid slice"/>`);
      continue;
    }
    // ramik — clipped to the zone rect
    const id = `ramik-${uid()}`;
    defs.push(`<clipPath id="${id}"><rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}"/></clipPath>`);
    parts.push(`<image href="${href}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`);
  }
  return { parts, defs };
}

// --- text -------------------------------------------------------------------

// Fallback width estimate when no measuring function is injected (CLI, tests
// in Node — the core has no canvas): the average glyph width as a share of
// the font size, per font in proporcie.json (kompozicia.svg.priemerneZnaky).
// The UI injects a precise canvas measure through komponuj; this only keeps
// long lines roughly inside the zone. Features are ignored: without a real
// measure the estimate cannot see ligatures anyway.
function odhadSirky(text, pismo, velkost, cfg) {
  const podiel = (cfg.priemerneZnaky && cfg.priemerneZnaky[pismo]) ?? 0.6;
  return text.length * podiel * velkost;
}

// Word-wraps text to `sirka` (dieliks). Explicit '\n' always breaks. A word
// wider than `sirka` keeps its own line, unsplit. Spaces between words on one
// line stay; spaces at a wrap point are dropped and never measured. The
// zone's features travel to zmerajText, so ligatures measure at their real
// width and the wrap matches what the sheet renders.
export function zalamujText(text, sirka, { pismo, velkost, features, zmerajText = null, cfg }) {
  const sirkaTextu = zmerajText
    ? (t) => zmerajText(t, pismo, velkost, features)
    : (t) => odhadSirky(t, pismo, velkost, cfg);
  const riadky = [];
  for (const odstavec of String(text).split('\n')) {
    // split with the separator runs kept: [word, sep, word, sep, …]
    const kusy = odstavec.split(/( +)/);
    let riadok = null; // null = nothing placed on this line yet
    for (let i = 0; i < kusy.length; i += 2) {
      const slovo = kusy[i] ?? '';
      if (!slovo) continue; // separators alone (start or end of a paragraph)
      if (riadok === null) {
        riadok = slovo; // a separator at a line start is dropped, not measured
        continue;
      }
      const kandidat = riadok + (kusy[i - 1] ?? '') + slovo;
      if (sirkaTextu(kandidat) <= sirka) {
        riadok = kandidat;
      } else {
        riadky.push(riadok);
        riadok = slovo;
      }
    }
    riadky.push(riadok ?? '');
  }
  return riadky;
}

// One text zone's wrapped lines in poster coordinates: the string, the pen x
// of its left edge (the alignment resolved to a left edge), the baseline y,
// the measured width and the font size. The text layer renders from this and
// the placement wraps around it, so both always see the same lines.
export function riadkyZony(z, { zmerajText = null, cfg } = {}) {
  const r = z.rect;
  // The row is the unit: baselines sit `riadok` dieliks apart, on the dielik
  // grid, and the glyphs fill `velkost` % of the row — over 100 % the lines
  // overlap, on purpose.
  const velkostPisma = (z.riadok * z.velkost) / 100;
  const sirkaRiadku = zmerajText
    ? (t) => zmerajText(t, z.pismo, velkostPisma, z.features)
    : (t) => odhadSirky(t, z.pismo, velkostPisma, cfg);
  return zalamujText(z.text, r.w, {
    pismo: z.pismo, velkost: velkostPisma, features: z.features, zmerajText, cfg,
  }).map((line, j) => ({
    text: line,
    x: z.zarovnanie === 'stred' ? r.x + r.w / 2 - sirkaRiadku(line) / 2
      : z.zarovnanie === 'vpravo' ? r.x + r.w - sirkaRiadku(line) : r.x,
    y: r.y + velkostPisma * cfg.riadokPrvy + j * z.riadok,
    sirka: sirkaRiadku(line),
    velkost: velkostPisma,
  }));
}

// The boxes the pattern wraps a text zone around: a tight box per glyph when
// glyph metrics are injected (the canvas measure), else one box per line —
// its width from the wrap measurement, its ascent/descent from the
// riadokHore/riadokDole constants. Lines without a visible character block
// nothing. Returns [] for a zone whose text has no ink at all.
export function prekazkyTextu(z, { zmerajText = null, zmerajGlyfy = null, cfg } = {}) {
  const boxes = [];
  for (const riadok of riadkyZony(z, { zmerajText, cfg })) {
    if (!/\S/.test(riadok.text)) continue;
    if (zmerajGlyfy) {
      for (const g of zmerajGlyfy(riadok.text, z.pismo, riadok.velkost, z.features)) {
        // a character the measure saw no ink for blocks nothing; a box with
        // no width or height would still repel shapes, so drop it
        if (!(g.sirka > 0) || !((g.hore + g.dole) > 0)) continue;
        boxes.push({ x: riadok.x + g.x, y: riadok.y - g.hore, w: g.sirka, h: g.hore + g.dole });
      }
    } else {
      const hore = riadok.velkost * cfg.riadokHore;
      const dole = riadok.velkost * cfg.riadokDole;
      boxes.push({ x: riadok.x, y: riadok.y - hore, w: riadok.sirka, h: hore + dole });
    }
  }
  return boxes;
}

function textLayer(zony, fg, cfg, zmerajText) {
  const parts = [];
  const varovania = [];
  zony.forEach((z, i) => {
    if (z.typ !== 'text' || !z.text) return;
    const r = z.rect;
    const riadky = riadkyZony(z, { zmerajText, cfg });
    // A line fits while its baseline sits inside the zone (descenders may
    // still poke below); text that overflows only warns, it is never cut.
    if (riadky[0].velkost * cfg.riadokPrvy + (riadky.length - 1) * z.riadok > r.h + 1e-9) {
      varovania.push(`Text v zóne ${i + 1} sa nezmestí, zmenši veľkosť.`);
    }
    const anchor = z.zarovnanie === 'stred' ? 'middle' : z.zarovnanie === 'vpravo' ? 'end' : 'start';
    for (const { text, x, y, sirka, velkost } of riadky) {
      const ax = z.zarovnanie === 'stred' ? x + sirka / 2 : z.zarovnanie === 'vpravo' ? x + sirka : x;
      // every feature explicit, on as 1 and off as 0: a disabled liga must
      // read 'liga' 0 in the sheet, never fall back to the browser default
      parts.push(
        `<text x="${f(ax)}" y="${f(y)}" font-family="${esc(z.pismo)}" font-size="${f(velkost)}"`
        + ` text-anchor="${anchor}" fill="${fg}" style="font-feature-settings: ${fontFeatureSettings(z.features)}">`
        + `${esc(text)}</text>`);
    }
  });
  return { parts, varovania };
}

// --- document ---------------------------------------------------------------

export function renderSvg({
  stlpce, vyskaD, bleedD, jednotka, sirka, vyska, spadavka,
  placed, zony, inverzia, fontUrls, zmerajText, cfg,
}) {
  const fg = inverzia ? '#fff' : '#000';
  const bg = inverzia ? '#000' : '#fff';
  const unit = jednotka === 'mm' ? 'mm' : 'px';

  let uidN = 0;
  const uid = () => String(uidN++);

  const patternD = placed.map((p) => p.d).join(' ');
  const { parts: fotoParts, defs: fotoDefs } = photoLayer(zony, placed, cfg, uid);
  const { parts: textParts, varovania: varovaniaTextu } = textLayer(zony, fg, cfg, zmerajText);
  const style = styleForFonts(fontUrls);

  const vb = `${f(-bleedD)} ${f(-bleedD)} ${f(stlpce + 2 * bleedD)} ${f(vyskaD + 2 * bleedD)}`;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(sirka + 2 * spadavka)}${unit}"`
    + ` height="${f(vyska + 2 * spadavka)}${unit}" viewBox="${vb}">`,
    style,
    ...(fotoDefs.length ? [`<defs>${fotoDefs.join('')}</defs>`] : []),
    `<rect x="${f(-bleedD)}" y="${f(-bleedD)}" width="${f(stlpce + 2 * bleedD)}" height="${f(vyskaD + 2 * bleedD)}" fill="${bg}"/>`,
    `<g id="fotky">${fotoParts.join('')}</g>`,
    `<g id="pattern">${patternD ? `<path d="${patternD}" fill="${fg}" fill-rule="nonzero"/>` : ''}</g>`,
    `<g id="text">${textParts.join('')}</g>`,
    `<g id="spadavka">${spadavka > 0
      ? `<rect x="0" y="0" width="${f(stlpce)}" height="${f(vyskaD)}" fill="none" stroke="${cfg.spadavkaFarba}" stroke-width="${f(cfg.spadavkaHrubka)}"/>`
      : ''}</g>`,
    '</svg>',
  ];
  return { svg: `${out.filter(Boolean).join('\n')}\n`, varovania: varovaniaTextu };
}
