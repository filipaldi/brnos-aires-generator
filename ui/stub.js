// Fallback engine used until core/kompozicia/ exists (phase 2).
// It implements the same normalizujSpec / komponuj contract with a trivial
// seeded random-grid placement built on buildShape from the core, so the UI
// is usable now and switches to the real engine automatically later.

import { buildShape, computeAxes, defaultParams, TYPES, proporcie } from '../core/index.js';
import { ValidationError } from '../core/errors.js';
import { fontFeatureSettings, normalizujFeatures } from '../core/kompozicia/features.js';
import { faceZony, facesFontov, fontFaceCss, normalizujRezZony } from '../core/kompozicia/pisma.js';
import { pasyZaoblenia } from '../core/kompozicia/rozmiestnenie.js';
import { obdlznikFotky, pritiahniFotku, zoStarehoZoomu } from '../core/kompozicia/fotka.js';
import { hrubkaZnaciek, orezoveZnacky, rozmerPlatna } from '../core/kompozicia/znacky.js';

const ALL_TYPES = TYPES.map((t) => t.id);
const ZNACKY = proporcie.kompozicia.svg.znacky;

const DEFAULTS = {
  format: { sirka: 420, vyska: 594, jednotka: 'mm', dpi: 300, spadavka: 3 },
  grid: { stlpce: 8, zvysok: 'okraje', okraj: 0 },
  kresba: { weight: 60, contrast: 70, zaoblenie: 30 },
  kompozicia: {
    velkost: [1, 6],
    typy: [...ALL_TYPES], rozmiestnenie: 'volne',
  },
  variant: '42',
  inverzia: false,
  zony: [],
};

// ---------- validation helpers ----------

function num(value, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} musí byť číslo (dostal som „${value}“).`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new ValidationError(`${name} musí byť celé číslo (dostal som ${value}).`);
  }
  if (value < min || value > max) {
    const rozsah = max === Infinity ? `aspoň ${min}` : `v rozsahu ${min}–${max}`;
    throw new ValidationError(`${name} musí byť ${rozsah} (dostal som ${value}).`);
  }
  return value;
}

function enumv(value, name, values) {
  if (!values.includes(value)) {
    throw new ValidationError(`${name} prijíma iba ${values.join(' | ')} (dostal som „${value}“).`);
  }
  return value;
}

// Legacy `spravanie` → numeric `okraj` (prazdna 0, okraj svg.okraj, presah −1),
// same conversion as the core's normalizujSpec.
function okrajZoSpravania(spravanie) {
  if (spravanie === undefined || spravanie === 'prazdna') return 0;
  if (spravanie === 'okraj') return proporcie.kompozicia.svg.okraj;
  if (spravanie === 'presah') return -1;
  throw new ValidationError(`Zóna: správanie prijíma iba prazdna | presah | okraj (dostal som „${spravanie}“).`);
}

// Legacy text model → the current one, the same conversion as the core's
// normalizujSpec: `riadkovanie` (a multiple of the font size in dieliks)
// became the row height `riadok` in whole dieliks with `velkost` as its
// whole percentage. The defaults are the ones the stub had before.
const STARY_TEXT = { velkost: 1.2, riadkovanie: 1.1 };

function naNovyText(z) {
  if ('riadok' in z || (!('riadkovanie' in z) && !('velkost' in z))) return z;
  const staraVelkost = z.velkost ?? STARY_TEXT.velkost;
  const riadok = Math.max(1, Math.round(staraVelkost * (z.riadkovanie ?? STARY_TEXT.riadkovanie)));
  const { riadkovanie, ...zvysok } = z;
  return {
    ...zvysok,
    riadok,
    velkost: Math.min(200, Math.max(10, Math.round((staraVelkost / riadok) * 100))),
  };
}

// Legacy photo zone → the current one, the same conversion as the core's
// normalizujSpec: `rezim` is gone (every photo sits in its frame), a zone
// without `mierka` carries the old decimal posun and zoom, converted to
// whole % and pulled into range; with both models `mierka` wins.
const MIERKA_MAX = proporcie.kompozicia.mierkaFotky.max;

function naNovuFotku(z) {
  const { rezim, zoom, ...zvysok } = z;
  if ('mierka' in z || (zoom === undefined && z.posun === undefined)) return zvysok;
  if (zoom !== undefined) num(zoom, 'Zóna: zoom', { min: 0.05, max: 10 });
  const posun = z.posun ?? [0, 0];
  if (!Array.isArray(posun) || posun.length !== 2 || posun.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new ValidationError('Zóna: posun musí byť dvojica čísel.');
  }
  const nove = zoStarehoZoomu(posun, zoom ?? 1);
  return { ...zvysok, mierka: Math.min(MIERKA_MAX, Math.max(100, nove.mierka)), posun: nove.posun };
}

function validateZone(z, index) {
  const kde = `Zóna č. ${index + 1}`;
  if (!z || typeof z !== 'object') throw new ValidationError(`${kde} nie je objekt.`);
  enumv(z.typ, `${kde}: typ`, ['text', 'fotka', 'prazdna']);
  num(z.x, `${kde}: x`, { integer: true });
  num(z.y, `${kde}: y`, { integer: true });
  num(z.w, `${kde}: šírka`, { min: 1, integer: true });
  num(z.h, `${kde}: výška`, { min: 1, integer: true });
  if (z.okraj !== undefined) num(z.okraj, `${kde}: okraj`, { min: -20, max: 20, integer: true });
  if (z.spravanie !== undefined) enumv(z.spravanie, `${kde}: správanie`, ['prazdna', 'presah', 'okraj']);
  if (z.typ === 'text') {
    if (typeof z.text !== 'string') throw new ValidationError(`${kde}: text musí byť reťazec.`);
    if (z.pismo !== undefined) enumv(z.pismo, `${kde}: písmo`, ['Brnos Aires', 'Nunito']);
    if (z.riadok !== undefined) num(z.riadok, `${kde}: riadok`, { min: 1, integer: true });
    if (z.velkost !== undefined) num(z.velkost, `${kde}: veľkosť`, { min: 10, max: 200, integer: true });
    if (z.zarovnanie !== undefined) enumv(z.zarovnanie, `${kde}: zarovnanie`, ['vlavo', 'stred', 'vpravo']);
    // same contract as the core: what the pattern wraps, defaulting to the
    // letters; foto and empty zones carry no such field
    if (z.obtekanie !== undefined) enumv(z.obtekanie, `${kde}: obtekanie`, ['ram', 'text']);
    // same contract as the core: unknown tag for the font is a clear error,
    // a missing field means the defaults (no ss01)
    if (z.features !== undefined) normalizujFeatures(z.features, z.pismo || 'Brnos Aires', kde);
  }
  if (z.typ === 'fotka') {
    // same contract as the core: a photo zone may wait for its photo (a
    // loaded template keeps none), a given source is a string
    if (z.zdroj != null && typeof z.zdroj !== 'string') {
      throw new ValidationError(`${kde}: zdroj fotky musí byť reťazec.`);
    }
    // same contract as the core: the photo's pixel size, whole % mierka
    // (100 covers the frame) and whole % posun of the frame
    if (z.rozmer != null && (!Array.isArray(z.rozmer) || z.rozmer.length !== 2
      || z.rozmer.some((v) => !Number.isInteger(v) || v < 1))) {
      throw new ValidationError(`${kde}: rozmer fotky musí byť dvojica celých kladných čísel.`);
    }
    if (z.mierka !== undefined) num(z.mierka, `${kde}: mierka`, { min: 100, max: MIERKA_MAX, integer: true });
    if (z.posun !== undefined) {
      if (!Array.isArray(z.posun) || z.posun.length !== 2 || !z.posun.every(Number.isInteger)) {
        throw new ValidationError(`${kde}: posun musí byť dvojica celých čísel (% rámika).`);
      }
    }
    // same contract as the core: whole %, a missing field is 0
    if (z.zaoblenie !== undefined) num(z.zaoblenie, `${kde}: zaoblenie`, { min: 0, max: 100, integer: true });
    if (z.border !== undefined) num(z.border, `${kde}: border`, { min: 0, max: 100, integer: true });
  }
}

export function normalizujSpec(input) {
  const spec = input && typeof input === 'object' ? input : {};
  const out = structuredClone(DEFAULTS);
  for (const key of ['format', 'grid', 'kresba', 'kompozicia']) {
    if (spec[key] && typeof spec[key] === 'object') Object.assign(out[key], spec[key]);
  }
  const f = out.format, g = out.grid, k = out.kresba, c = out.kompozicia;

  num(f.sirka, 'Šírka formátu', { min: 10, max: 20000 });
  num(f.vyska, 'Výška formátu', { min: 10, max: 20000 });
  enumv(f.jednotka, 'Jednotka', ['mm', 'px']);
  num(f.dpi, 'DPI', { min: 18, max: 2400, integer: true });
  num(f.spadavka, 'Spadávka', { min: 0, max: 50 });
  num(g.stlpce, 'Grid', { min: 1, max: 64, integer: true });
  enumv(g.zvysok, 'Zvyšok výšky', ['okraje', 'natiahnutie', 'orez']);
  // okraj in whole dieliky; at least one column and one whole row stay inside
  num(g.okraj, 'Okraj', { min: 0, integer: true });
  if (2 * g.okraj >= g.stlpce) {
    throw new ValidationError(`Okraj musí byť menší ako polovica stĺpcov gridu (${g.stlpce}, je ${g.okraj}).`);
  }
  const riadky = Math.floor((f.vyska * g.stlpce) / f.sirka + 1e-6);
  if (2 * g.okraj >= riadky) {
    throw new ValidationError(`Okraj musí byť menší ako polovica celých riadkov gridu (${riadky}, je ${g.okraj}).`);
  }
  num(k.weight, 'Weight', { min: 0, max: 100 });
  num(k.contrast, 'Contrast', { min: 0, max: 100 });
  num(k.zaoblenie, 'Zaoblenie', { min: 0, max: 100 });

  if (!Array.isArray(c.velkost) || c.velkost.length !== 2) {
    throw new ValidationError('Veľkosť musí byť dvojica [min, max] v dielikoch.');
  }
  num(c.velkost[0], 'Veľkosť min', { min: 0.2, max: 40 });
  num(c.velkost[1], 'Veľkosť max', { min: 0.2, max: 40 });
  if (c.velkost[0] > c.velkost[1]) {
    throw new ValidationError('Veľkosť min musí byť menšia alebo rovná max.');
  }
  if (!Array.isArray(c.typy) || c.typy.length === 0) {
    throw new ValidationError('Typy: vyber aspoň jeden typ tvaru.');
  }
  for (const t of c.typy) {
    if (!ALL_TYPES.includes(t)) {
      throw new ValidationError(`Neznámy typ tvaru „${t}“. Platné typy: ${ALL_TYPES.join(', ')}.`);
    }
  }
  enumv(c.rozmiestnenie, 'Rozmiestnenie', ['volne', 'dlazdice']);

  if (spec.variant !== undefined) {
    if (typeof spec.variant !== 'string' && typeof spec.variant !== 'number') {
      throw new ValidationError('Variant musí byť text alebo číslo.');
    }
    out.variant = String(spec.variant);
  }
  if (spec.inverzia !== undefined) {
    if (typeof spec.inverzia !== 'boolean') {
      throw new ValidationError('Inverzia musí byť true/false.');
    }
    out.inverzia = spec.inverzia;
  }
  if (spec.zony !== undefined) {
    if (!Array.isArray(spec.zony)) throw new ValidationError('Zóny musia byť pole.');
    out.zony = spec.zony.map((z, i) => {
      if (z?.typ === 'text') z = naNovyText(z);
      if (z?.typ === 'fotka') z = naNovuFotku(z);
      validateZone(z, i);
      const base = {
        typ: z.typ, x: z.x, y: z.y, w: z.w, h: z.h,
        okraj: z.okraj !== undefined ? z.okraj : okrajZoSpravania(z.spravanie),
      };
      if (z.typ === 'text') {
        return {
          ...base, text: z.text ?? '', pismo: z.pismo || 'Brnos Aires',
          riadok: z.riadok ?? 3, velkost: z.velkost ?? 80,
          zarovnanie: z.zarovnanie || 'vlavo',
          obtekanie: z.obtekanie || 'text',
          features: normalizujFeatures(z.features, z.pismo || 'Brnos Aires', `Zóna č. ${i + 1}`),
          // same contract as the core: rez for a static font, hrubka for a
          // variable one, missing means the font's default
          ...normalizujRezZony(z, z.pismo || 'Brnos Aires', `Zóna č. ${i + 1}`),
        };
      }
      if (z.typ === 'fotka') {
        return {
          ...base, zdroj: z.zdroj,
          ...(z.rozmer ? { rozmer: z.rozmer } : {}),
          ...pritiahniFotku(z, { mierka: z.mierka ?? 100, posun: z.posun ?? [0, 0], rozmer: z.rozmer }, MIERKA_MAX),
          zaoblenie: z.zaoblenie ?? 0, border: z.border ?? 0,
        };
      }
      return base;
    });
    // zones stay inside the grid's margin, as in the core
    if (g.okraj > 0) {
      const x1 = g.stlpce - g.okraj;
      const y1 = riadky - g.okraj;
      out.zony.forEach((z, i) => {
        if (z.x < g.okraj || z.y < g.okraj || z.x + z.w > x1 || z.y + z.h > y1) {
          throw new ValidationError(
            `Zóna č. ${i + 1} zasahuje do okraja gridu (${g.okraj} dielikov): musí ležať v stĺpcoch ${g.okraj}–${x1} a riadkoch ${g.okraj}–${y1}.`);
        }
      });
    }
  }
  return out;
}

// ---------- determinism ----------

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Round to 3 decimals, trim trailing zeros: stable bytes, readable SVG.
function fmt(n) {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

// ---------- placement ----------

// One size drawn uniformly from the whole range (rozlozenie is gone).
function pickSize(rng, c) {
  const [mn, mx] = c.velkost;
  return mn + rng() * (mx - mn);
}

function rectsIntersect(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x
    && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

function zoneBlockers(zony) {
  // Rects a placed shape's bbox must stay out of: okraj ≥ 0 grows the zone
  // by okraj on every side, a negative okraj shrinks it by |okraj| — a zone
  // shrunk out of existence (w or h ≤ 0) blocks nothing. A rounded
  // photo zone blocks its rounded shape as strips, as in the core, so the
  // pattern may fill the corners the rounding cuts off.
  const blockers = [];
  for (const z of zony) {
    const okraj = z.okraj ?? 0;
    if (okraj < 0 && (z.w + 2 * okraj <= 0 || z.h + 2 * okraj <= 0)) continue;
    if (z.typ === 'fotka' && z.zaoblenie > 0) {
      const n = Math.max(-okraj, 0);
      const r = { x: z.x + n, y: z.y + n, w: z.w - 2 * n, h: z.h - 2 * n };
      const rx = (Math.min(z.w, z.h) / 2) * (z.zaoblenie / 100) - n;
      const g = Math.max(okraj, 0);
      for (const p of pasyZaoblenia(r, rx)) {
        blockers.push({ x: p.x - g, y: p.y - g, w: p.w + 2 * g, h: p.h + 2 * g });
      }
      continue;
    }
    blockers.push({ x: z.x - okraj, y: z.y - okraj, w: z.w + 2 * okraj, h: z.h + 2 * okraj });
  }
  return blockers;
}

function placeShapes(spec, geom, rng, axes) {
  const c = spec.kompozicia;
  // the pattern's band: the whole format, or the inside of the grid's margin
  // (okraj whole dieliky in from the left, top and right edge and from the
  // last whole row), as in the core
  const { X0, Y0, W, H } = geom.pas;
  const blockers = zoneBlockers(spec.zony);
  const placed = [];
  const avg = (c.velkost[0] + c.velkost[1]) / 2;
  const target = Math.max(3, Math.round((W * H * 1.9) / (avg * avg)));
  for (let i = 0; i < target; i++) {
    const typ = c.typy[Math.floor(rng() * c.typy.length)];
    const size = pickSize(rng, c);
    const rotate = [0, 90, 180, 270][Math.floor(rng() * 4)];
    const mirror = rng() < 0.5;
    let shape;
    try {
      shape = buildShape(typ, { rotate, mirror }, axes);
    } catch {
      continue; // a type that rejects these axes: skip it
    }
    const maxDim = Math.max(shape.bbox.w, shape.bbox.h) || 1;
    const s = size / maxDim;
    const w = shape.bbox.w * s;
    const h = shape.bbox.h * s;
    let rect = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      const x = X0 + rng() * (W - w);
      const y = Y0 + rng() * (H - h);
      const candidate = { x, y, w, h };
      if (blockers.some((b) => rectsIntersect(candidate, b, 0.05))) continue;
      if (placed.some((p) => rectsIntersect(candidate, p.rect, 0.12))) continue;
      rect = candidate;
      break;
    }
    if (!rect) continue;
    placed.push({
      typ, rotate, mirror, scale: s, rect,
      params: { ...defaultParams(typ), rotate, mirror },
      d: shape.paths.join(' '),
      bx: shape.bbox.x,
      by: shape.bbox.y,
      bw: shape.bbox.w * s,
      bh: shape.bbox.h * s,
    });
  }
  return placed;
}

// ---------- SVG assembly ----------

// The @font-face declarations from the font model in proporcie.json — the
// same rules the real engine's styleForFonts writes (facesFontov).
function fontFacesStyl(fontUrls) {
  return facesFontov(fontUrls).map((face) => fontFaceCss(face)).join('');
}

function patternSvg(placed, fill) {
  return placed.map((p) => (
    `<path d="${p.d}" fill="${fill}" fill-rule="nonzero" `
    + `transform="translate(${fmt(p.rect.x - p.bx * p.scale)} ${fmt(p.rect.y - p.by * p.scale)}) `
    + `scale(${fmt(p.scale)})"/>`
  )).join('');
}

function textZoneSvg(z, fill, dielikUnits) {
  const anchor = z.zarovnanie === 'stred' ? 'middle' : (z.zarovnanie === 'vpravo' ? 'end' : 'start');
  const pad = 0.15;
  const x = z.zarovnanie === 'stred' ? z.x + z.w / 2
    : (z.zarovnanie === 'vpravo' ? z.x + z.w - pad : z.x + pad);
  const lines = String(z.text).split('\n');
  // same model as the core: baselines `riadok` dieliks apart, glyphs fill
  // `velkost` % of the row, the face comes from the zone's rez/hrubka
  const velkostPisma = (z.riadok * z.velkost) / 100;
  const face = faceZony(z);
  const tspans = lines.map((line, i) => (
    `<tspan x="${fmt(x)}" y="${fmt(z.y + velkostPisma * 0.78 + i * z.riadok)}">${esc(line)}</tspan>`
  )).join('');
  return `<text font-family="${escAttr(face.family)}" font-size="${fmt(velkostPisma)}" `
    + `font-weight="${fmt(face.weight)}" text-anchor="${anchor}" fill="${fill}" `
    + `style="font-feature-settings: ${fontFeatureSettings(z.features)}">`
    + `${tspans}</text>`;
}

function photoZoneSvg(z, i, geom, fill) {
  // no photo yet: nothing to draw, the editor shows its placeholder
  if (!z.zdroj) return '';
  const hair = Math.max(geom.b, 0.02) * 0.35; // frame line, visible at any format
  const px = z.x, py = z.y, pw = z.w, ph = z.h;
  // as in the core: the photo has its own rect (mierka, posun, its
  // proportions), clipped to the frame with its rounded corners (zaoblenie,
  // % of half the shorter side); the border (% of a dielik) only inside the
  // zone — a stroke of twice the width clipped by the same shape
  const foto = obdlznikFotky(z, z);
  const rx = (Math.min(pw, ph) / 2) * (z.zaoblenie / 100);
  const tvar = `x="${fmt(px)}" y="${fmt(py)}" width="${fmt(pw)}" height="${fmt(ph)}"${rx > 0 ? ` rx="${fmt(rx)}"` : ''}`;
  const stroke = z.border > 0 ? (2 * z.border) / 100 : hair;
  return `<clipPath id="ramik-${i}"><rect ${tvar}/></clipPath>`
    + `<image href="${escAttr(z.zdroj)}" x="${fmt(foto.x)}" y="${fmt(foto.y)}" width="${fmt(foto.w)}" height="${fmt(foto.h)}" `
    + `preserveAspectRatio="xMidYMid slice" clip-path="url(#ramik-${i})"/>`
    + `<rect ${tvar} fill="none" stroke="${fill}" stroke-width="${fmt(stroke)}" clip-path="url(#ramik-${i})"/>`;
}

// The crop marks, the same as the core's (core/kompozicia/znacky.js): eight
// hairlines in a band outside the bleed, empty without a bleed.
function spadavkaSvg(geom) {
  const { b, znackyD, hrubkaZnaciekD, W, H } = geom;
  if (!(znackyD > 0)) return '';
  return orezoveZnacky({ sirka: W, vyska: H, spadavka: b, dlzka: znackyD }).map(([x1, y1, x2, y2]) => (
    `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" `
    + `stroke="${ZNACKY.farba}" stroke-width="${fmt(hrubkaZnaciekD)}"/>`
  )).join('');
}

export function komponuj(spec, { fontUrls = {} } = {}) {
  spec = normalizujSpec(spec);
  const { format: f, grid: g, kresba: k } = spec;

  const axes = computeAxes(k.weight, k.contrast, proporcie, k.zaoblenie);
  const dielikUnits = f.sirka / g.stlpce; // mm or px per dielik
  const W = g.stlpce;
  const H = f.vyska / dielikUnits;
  const b = f.spadavka / dielikUnits; // bleed in dieliks
  const ok = g.okraj;
  const riadky = Math.floor((f.vyska * g.stlpce) / f.sirka + 1e-6);
  const pas = ok > 0
    ? { X0: ok, Y0: ok, W: W - 2 * ok, H: riadky - 2 * ok }
    : { X0: 0, Y0: 0, W, H };
  const platno = rozmerPlatna(f); // trim + bleed + crop-mark band
  const geom = {
    W, H, b, dielikUnits, axes, pas,
    znackyD: platno.pas / dielikUnits, hrubkaZnaciekD: hrubkaZnaciek(f) / dielikUnits,
  };

  const rng = mulberry32(hashString(spec.variant));
  const placed = placeShapes(spec, geom, rng, axes);

  const black = spec.inverzia ? '#fff' : '#000';
  const white = spec.inverzia ? '#000' : '#fff';
  const varovania = [];
  if (spec.kompozicia.rozmiestnenie === 'dlazdice') {
    varovania.push('Rozmiestnenie dlaždice ešte nie je postavené, používam voľné.');
  }
  if (placed.length === 0) {
    varovania.push('Nepodarilo sa umiestniť ani jeden tvar, skús iný variant alebo menšiu veľkosť.');
  }

  const svgParts = [];
  // the canvas, as in the core: trim + bleed + crop-mark band; the band
  // stays paper, the background covers trim and bleed only
  const o = b + geom.znackyD;
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(platno.sirka)}${f.jednotka === 'mm' ? 'mm' : ''}" `
    + `height="${fmt(platno.vyska)}${f.jednotka === 'mm' ? 'mm' : ''}" `
    + `viewBox="${fmt(-o)} ${fmt(-o)} ${fmt(W + 2 * o)} ${fmt(H + 2 * o)}">`);
  const css = fontFacesStyl(fontUrls);
  if (css) svgParts.push(`<defs><style>${css}}</style></defs>`);
  if (geom.znackyD > 0) {
    svgParts.push(`<rect x="${fmt(-o)}" y="${fmt(-o)}" width="${fmt(W + 2 * o)}" height="${fmt(H + 2 * o)}" fill="${ZNACKY.papier}"/>`);
  }
  svgParts.push(`<rect x="${fmt(-b)}" y="${fmt(-b)}" width="${fmt(W + 2 * b)}" height="${fmt(H + 2 * b)}" fill="${white}"/>`);

  svgParts.push('<g id="pattern">');
  svgParts.push(patternSvg(placed, black));
  svgParts.push('</g>');

  svgParts.push('<g id="fotky">');
  spec.zony.forEach((z, i) => {
    if (z.typ === 'fotka') svgParts.push(photoZoneSvg(z, i, geom, black));
  });
  svgParts.push('</g>');

  svgParts.push('<g id="text">');
  spec.zony.forEach((z) => {
    if (z.typ === 'text' && z.text) svgParts.push(textZoneSvg(z, black, dielikUnits));
  });
  svgParts.push('</g>');

  svgParts.push('<g id="spadavka">');
  svgParts.push(spadavkaSvg(geom));
  svgParts.push('</g>');

  svgParts.push('</svg>');
  svgParts.push('');

  return {
    svg: svgParts.join('\n'),
    sirkaPx: platno.sirkaPx,
    vyskaPx: platno.vyskaPx,
    dielik: dielikUnits,
    tvary: placed.map((p) => ({
      typ: p.typ,
      params: { ...p.params },
      rotate: p.rotate,
      mirror: p.mirror,
      x: p.rect.x,
      y: p.rect.y,
      bbox: { x: p.rect.x, y: p.rect.y, w: p.bw, h: p.bh },
    })),
    varovania,
  };
}
