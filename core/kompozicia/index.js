// Composition API (phase 2). `normalizujSpec` fills a partial spec with
// defaults from proporcie.json and validates everything with Slovak messages;
// `komponuj` places shapes around the zones and writes a standalone SVG.
//
//   import { komponuj } from './core/kompozicia/index.js';
//   const { svg, sirkaPx, vyskaPx, dielik, tvary, varovania } = komponuj(spec);
//
// Everything is deterministic: the `variant` string seeds the PRNG and the
// same spec always produces byte-identical SVG.

import { buildShape, computeAxes, defaultParams, loadProporcie, paramSpec, TYPES } from '../index.js';
import { ValidationError } from '../errors.js';
import { createRng } from './rng.js';
import { pasyZaoblenia, placeShapes } from './rozmiestnenie.js';
import { prekazkyTextu, renderSvg, translatePathD } from './svg.js';
import { FONTY, normalizujFeatures } from './features.js';
import { normalizujRezZony } from './pisma.js';
import { maxVelkost } from './velkost.js';
import { pritiahniFotku, zoStarehoZoomu } from './fotka.js';
import { hrubkaZnaciek, rozmerPlatna } from './znacky.js';

const KOMP = loadProporcie().kompozicia;

const JEDNOTKY = ['mm', 'px'];
const ZVYSOK = ['okraje', 'natiahnutie', 'orez'];
const ROZMIESTNENIE = ['volne', 'dlazdice'];
const TYPY_ZONY = ['text', 'fotka', 'prazdna'];
const PISMA = FONTY;
const ZOROVNANIE = ['vlavo', 'stred', 'vpravo'];
const OBTEKANIE = ['ram', 'text'];
const MIERKA_MAX = KOMP.mierkaFotky.max;

// --- validation helpers -----------------------------------------------------

function cislo(value, name, { min = -Infinity, max = Infinity, cele = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} musí byť číslo (dostal som „${value}“).`);
  }
  if (cele && !Number.isInteger(value)) {
    throw new ValidationError(`${name} musí byť celé číslo (dostal som ${value}).`);
  }
  if (value < min || value > max) {
    const rozsah = max === Infinity ? `aspoň ${min}` : `v rozsahu ${min}–${max}`;
    throw new ValidationError(`${name} musí byť ${rozsah} (dostal som ${value}).`);
  }
  return value;
}

function moznosti(value, name, values) {
  if (!values.includes(value)) {
    throw new ValidationError(`${name} prijíma iba ${values.join(' | ')} (dostal som „${value}“).`);
  }
  return value;
}

function polia(obj, allowed, name) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(`Neznáme pole „${key}“ v ${name}. Platné polia: ${allowed.join(', ')}.`);
    }
  }
}

// Height of the format in dieliks — needed for zone bounds in normalizujSpec.
function vyskaVDielikoch(format, grid) {
  return (format.vyska * grid.stlpce) / format.sirka;
}

// Whole rows of the grid: the last grid line a zone edge may sit on.
function celeRiadky(format, grid) {
  return Math.floor(vyskaVDielikoch(format, grid) + 1e-6);
}

function normalizujFormat(raw) {
  const d = KOMP.predvolene.format;
  const format = { ...d, ...raw };
  if (raw) polia(raw, Object.keys(d), 'format');
  cislo(format.sirka, 'format.sirka', { min: 1, max: 100000 });
  cislo(format.vyska, 'format.vyska', { min: 1, max: 100000 });
  moznosti(format.jednotka, 'format.jednotka', JEDNOTKY);
  cislo(format.dpi, 'format.dpi', { min: 18, max: 2400 });
  cislo(format.spadavka, 'format.spadavka', { min: 0, max: 100 });
  return format;
}

function normalizujGrid(raw, format) {
  const d = KOMP.predvolene.grid;
  const grid = { ...d, ...raw };
  if (raw) polia(raw, Object.keys(d), 'grid');
  cislo(grid.stlpce, 'grid.stlpce', { min: 1, max: 100, cele: true });
  moznosti(grid.zvysok, 'grid.zvysok', ZVYSOK);
  // the margin (okraj) is part of the grid: whole dieliky inset from the
  // trimmed format, leaving at least one column and one whole row inside;
  // older specs carry no field → 0
  cislo(grid.okraj, 'grid.okraj', { min: 0, cele: true });
  if (2 * grid.okraj >= grid.stlpce) {
    throw new ValidationError(
      `grid.okraj musí byť menší ako polovica stĺpcov gridu (${grid.stlpce}, dostal som ${grid.okraj}).`);
  }
  const riadky = celeRiadky(format, grid);
  if (2 * grid.okraj >= riadky) {
    throw new ValidationError(
      `grid.okraj musí byť menší ako polovica celých riadkov gridu (${riadky}, dostal som ${grid.okraj}).`);
  }
  return grid;
}

function normalizujKresba(raw) {
  const d = KOMP.predvolene.kresba;
  const kresba = { ...d, ...raw };
  if (raw) polia(raw, Object.keys(d), 'kresba');
  cislo(kresba.weight, 'kresba.weight', { min: 0, max: 100 });
  cislo(kresba.contrast, 'kresba.contrast', { min: 0, max: 100 });
  cislo(kresba.zaoblenie, 'kresba.zaoblenie', { min: 0, max: 100 });
  return kresba;
}

function normalizujKompozicia(raw) {
  const d = KOMP.predvolene.kompozicia;
  // older specs list the types in `typy`: each listed type gets its default
  // weight, the others 0
  if (raw && Array.isArray(raw.typy) && !raw.pomery) {
    const { typy, ...zvysok } = raw;
    raw = {
      ...zvysok,
      pomery: Object.fromEntries(Object.entries(d.pomery).map(([t, v]) => [t, typy.includes(t) ? v : 0])),
    };
  }
  // older specs give one size range for all types
  if (raw && Array.isArray(raw.velkost) && !raw.velkosti) {
    const { velkost, ...zvysok } = raw;
    raw = { ...zvysok, velkosti: Object.fromEntries(Object.keys(d.velkosti).map((t) => [t, velkost.slice()])) };
  }
  // `typy` is derived from pomery; a spec that went through normalisation
  // once carries it and must pass again
  if (raw && raw.pomery && 'typy' in raw) {
    const { typy, ...zvysok } = raw;
    raw = zvysok;
  }
  // dropped: accents are now part of each chain's quota
  if (raw && 'akcentyNaRetaz' in raw) {
    const { akcentyNaRetaz, ...zvysok } = raw;
    raw = zvysok;
  }
  if (raw && 'rozlozenie' in raw) {
    // dropped setting: sizes are spread evenly over the range
    const { rozlozenie, ...zvysok } = raw;
    raw = zvysok;
  }
  if (raw && 'variacia' in raw) {
    // dropped setting: every type has its own size range now
    const { variacia, ...zvysok } = raw;
    raw = zvysok;
  }
  const komp = { ...d, ...raw };
  if (raw) polia(raw, Object.keys(d), 'kompozicia');
  if (!Array.isArray(komp.retazenieDlzka) || komp.retazenieDlzka.length !== 2) {
    throw new ValidationError('kompozicia.retazenieDlzka musí byť pole [min, max] tvarov v reťazi, napr. [5, 20].');
  }
  cislo(komp.retazenieDlzka[0], 'kompozicia.retazenieDlzka[0]', { min: 1, max: 50, cele: true });
  cislo(komp.retazenieDlzka[1], 'kompozicia.retazenieDlzka[1]', { min: 1, max: 50, cele: true });
  if (komp.retazenieDlzka[0] > komp.retazenieDlzka[1]) {
    throw new ValidationError('kompozicia.retazenieDlzka[0] musí byť menšia alebo rovná retazenieDlzka[1].');
  }
  // pomery: each type's percentage of one chain (0 leaves the type out).
  // Values are read as shares of their sum, so they need not add up to 100.
  const vsetky = TYPES.map((t) => t.id);
  // connectors (spojky) are switched on by contrast, never weighted by hand;
  // older specs that still weight them lose those keys
  const spojky = KOMP.rozmiestnenie.retazenie.spojky;
  const zname = vsetky.filter((t) => !spojky.includes(t));
  if (komp.pomery && typeof komp.pomery === 'object') {
    komp.pomery = Object.fromEntries(Object.entries(komp.pomery).filter(([t]) => !spojky.includes(t)));
  }
  if (!komp.pomery || typeof komp.pomery !== 'object' || Array.isArray(komp.pomery)) {
    throw new ValidationError('kompozicia.pomery musí byť objekt { typ: 0–100 }, napr. { "noha": 50, "polkruh": 50 }.');
  }
  for (const [typ, v] of Object.entries(komp.pomery)) {
    if (!zname.includes(typ)) {
      throw new ValidationError(`Neznámy typ tvaru „${typ}“ v kompozicia.pomery. Platné typy: ${zname.join(', ')}.`);
    }
    cislo(v, `kompozicia.pomery.${typ}`, { min: 0, max: 100, cele: true });
  }
  komp.pomery = Object.fromEntries(zname.map((t) => [t, komp.pomery[t] ?? 0]));
  komp.typy = zname.filter((t) => komp.pomery[t] > 0);
  if (!komp.typy.length) {
    throw new ValidationError('kompozicia.pomery: aspoň jeden typ musí mať pomer väčší ako 0.');
  }
  // velkosti: one size range [min, max] in dieliky per type
  if (!komp.velkosti || typeof komp.velkosti !== 'object' || Array.isArray(komp.velkosti)) {
    throw new ValidationError('kompozicia.velkosti musí byť objekt { typ: [min, max] }, napr. { "noha": [1, 6] }.');
  }
  // unknown ids are dropped, not rejected: saved state from older versions may still carry removed types
  komp.velkosti = Object.fromEntries(Object.entries(komp.velkosti).filter(([typ]) => vsetky.includes(typ)));
  for (const [typ, v] of Object.entries(komp.velkosti)) {
    const kde = `kompozicia.velkosti.${typ}`;
    if (!Array.isArray(v) || v.length !== 2) {
      throw new ValidationError(`${kde} musí byť pole [min, max] v dielikoch, napr. [1, 6].`);
    }
    const max = maxVelkost(typ, paramSpec(typ), KOMP.velkostTvaru);
    cislo(v[0], `${kde}[0]`, { min: 1, max, cele: true });
    cislo(v[1], `${kde}[1]`, { min: 1, max, cele: true });
    if (v[0] > v[1]) throw new ValidationError(`${kde}[0] musí byť menšia alebo rovná ${kde}[1].`);
  }
  komp.velkosti = Object.fromEntries(vsetky.map((t) => [t, komp.velkosti[t] ?? d.velkosti[t] ?? [1, 6]]));
  moznosti(komp.rozmiestnenie, 'kompozicia.rozmiestnenie', ROZMIESTNENIE);
  return komp;
}

// Legacy `spravanie` → numeric `okraj`: prazdna = 0, okraj = svg.okraj from
// proporcie.json (the constant's only remaining role), presah = −1.
function okrajZoSpravania(spravanie, name) {
  if (spravanie === 'prazdna') return 0;
  if (spravanie === 'okraj') return KOMP.svg.okraj;
  if (spravanie === 'presah') return -1;
  throw new ValidationError(`${name}.spravanie prijíma iba prazdna | okraj | presah (dostal som „${spravanie}“).`);
}

function normalizujZonu(raw, index, stlpce, vyskaD) {
  const name = `zóna ${index + 1}`;
  const typ = moznosti(raw.typ ?? 'text', `${name}.typ`, TYPY_ZONY);
  // dropped setting: the zone `spravanie` became the numeric `okraj`; when a
  // spec carries both, its `okraj` wins
  if (raw && 'spravanie' in raw) {
    const { spravanie, ...zvysok } = raw;
    if (!('okraj' in zvysok)) zvysok.okraj = okrajZoSpravania(spravanie, name);
    raw = zvysok;
  }
  // dropped setting: text line spacing `riadkovanie` (a multiple of the font
  // size) became the dielik grid — `riadok` is the row height in whole
  // dieliks, `velkost` the font size as its whole percentage. A size without
  // `riadok` is read in the old units and converted (the defaults are the
  // ones proporcie.json had before); when a spec carries both models, its
  // `riadok` wins.
  if (typ === 'text') {
    const { riadkovanie, ...zvysok } = raw;
    if (!('riadok' in raw) && (riadkovanie !== undefined || 'velkost' in raw)) {
      const staraVelkost = raw.velkost ?? 1.2;
      const riadok = Math.max(1, Math.round(staraVelkost * (riadkovanie ?? 1.1)));
      raw = {
        ...zvysok,
        riadok,
        velkost: Math.min(200, Math.max(10, Math.round((staraVelkost / riadok) * 100))),
      };
    } else {
      raw = zvysok; // riadkovanie is gone either way
    }
  }
  // dropped settings of a photo zone: `rezim` (maska and prekrytie are gone,
  // every photo sits in its frame, so any value is ignored) and the decimal
  // `zoom`. A spec without `mierka` carries the old posun and zoom, which
  // are converted to whole % (zoStarehoZoomu) and pulled into range; when a
  // spec carries both models, its `mierka` wins.
  if (typ === 'fotka') {
    const { rezim, zoom, ...zvysok } = raw;
    if (!('mierka' in raw) && (zoom !== undefined || raw.posun !== undefined)) {
      if (zoom !== undefined) cislo(zoom, `${name}.zoom`, { min: 0.05, max: 10 });
      const posun = raw.posun ?? [0, 0];
      if (!Array.isArray(posun) || posun.length !== 2
        || posun.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new ValidationError(`${name}.posun musí byť pole [x, y] čísel.`);
      }
      const nove = zoStarehoZoomu(posun, zoom ?? 1);
      zvysok.mierka = Math.min(MIERKA_MAX, Math.max(100, nove.mierka));
      zvysok.posun = nove.posun;
    }
    raw = zvysok;
  }
  polia(raw, [
    'typ', 'x', 'y', 'w', 'h', 'okraj',
    'text', 'pismo', 'rez', 'hrubka', 'velkost', 'zarovnanie', 'riadok', 'features', 'obtekanie',
    'zdroj', 'rozmer', 'mierka', 'posun', 'zaoblenie', 'border',
  ], name);
  const d = KOMP.zona[typ] || {};
  const zona = { typ, okraj: 0, ...d, ...raw };
  // a zone may start anywhere on the format; 64 capped grids wider or
  // taller than 64 dielikov (grid goes up to 100 columns)
  cislo(zona.x, `${name}.x`, { min: 0, max: stlpce, cele: true });
  cislo(zona.y, `${name}.y`, { min: 0, max: Math.max(0, Math.floor(vyskaD + 1e-6)), cele: true });
  cislo(zona.w, `${name}.w`, { min: 0.5, max: 1000 });
  cislo(zona.h, `${name}.h`, { min: 0.5, max: 1000 });
  if (zona.x + zona.w > stlpce + 1e-6) {
    throw new ValidationError(`${name} presahuje šírku formátu (${zona.x} + ${zona.w} > ${stlpce} stĺpcov).`);
  }
  if (zona.y + zona.h > vyskaD + 1e-6) {
    throw new ValidationError(`${name} presahuje výšku formátu (${zona.y} + ${zona.h} > ${Math.round(vyskaD * 100) / 100} dielika).`);
  }
  cislo(zona.okraj, `${name}.okraj`, { min: -20, max: 20, cele: true });

  if (typ === 'text') {
    if (zona.text != null && typeof zona.text !== 'string') {
      throw new ValidationError(`${name}.text musí byť reťazec.`);
    }
    moznosti(zona.pismo, `${name}.pismo`, PISMA);
    // rez (a static font's cut) or hrubka (a variable font's axis weight):
    // a missing field means the font's default, the other font's field is an
    // error — a spec that switched fonts switches the field with it
    Object.assign(zona, normalizujRezZony(raw, zona.pismo, name));
    // no upper bound: a row taller than its zone only warns that the text does not fit
    cislo(zona.riadok, `${name}.riadok`, { min: 1, cele: true });
    cislo(zona.velkost, `${name}.velkost`, { min: 10, max: 200, cele: true });
    moznosti(zona.zarovnanie, `${name}.zarovnanie`, ZOROVNANIE);
    // what the pattern wraps: the zone's frame or the letters; a missing
    // field (old specs, new zones) defaults to the letters — 'text' comes
    // from KOMP.zona.text in proporcie.json. Foto and empty zones ignore it.
    moznosti(zona.obtekanie, `${name}.obtekanie`, OBTEKANIE);
    // OpenType features of the zone's font — a missing field means the
    // defaults (no ss01), an unknown tag for the font is rejected
    zona.features = normalizujFeatures(zona.features, zona.pismo, name);
  }
  if (typ === 'fotka') {
    if (zona.zdroj != null && typeof zona.zdroj !== 'string') {
      throw new ValidationError(`${name}.zdroj musí byť reťazec (cesta alebo data URL).`);
    }
    // the photo's own size in pixels, set by the editor when it reads the
    // photo; without it the photo has the frame's proportions
    if (zona.rozmer != null && (!Array.isArray(zona.rozmer) || zona.rozmer.length !== 2
      || zona.rozmer.some((v) => !Number.isInteger(v) || v < 1))) {
      throw new ValidationError(`${name}.rozmer musí byť pole [šírka, výška] celých kladných čísel.`);
    }
    // whole % of the size that covers the frame, and the photo's offset in
    // whole % of the frame; a posun past what keeps the frame covered is
    // pulled back (a frame resized to other proportions may leave it there)
    cislo(zona.mierka, `${name}.mierka`, { min: 100, max: MIERKA_MAX, cele: true });
    if (!Array.isArray(zona.posun) || zona.posun.length !== 2
      || zona.posun.some((v) => !Number.isInteger(v))) {
      throw new ValidationError(`${name}.posun musí byť pole [x, y] celých čísel (% rámika).`);
    }
    Object.assign(zona, pritiahniFotku(zona, zona, MIERKA_MAX));
    // rounded corners (whole % of half the zone's shorter side) and an inner
    // border (whole % of one dielik); a missing field (old specs, templates)
    // is 0 from KOMP.zona.fotka in proporcie.json
    cislo(zona.zaoblenie, `${name}.zaoblenie`, { min: 0, max: 100, cele: true });
    cislo(zona.border, `${name}.border`, { min: 0, max: 100, cele: true });
  }
  return zona;
}

// A zone stays inside the grid's margin like the pattern does: okraj whole
// dieliky in from the left, top and right edge and from the last whole row.
// A grid without a margin leaves the format's own bounds above.
function zonaVOkraji(zona, index, format, grid) {
  const ok = grid.okraj;
  if (ok <= 0) return;
  const name = `zóna ${index + 1}`;
  const x1 = grid.stlpce - ok;
  const y1 = celeRiadky(format, grid) - ok;
  if (zona.x < ok - 1e-6 || zona.y < ok - 1e-6 || zona.x + zona.w > x1 + 1e-6 || zona.y + zona.h > y1 + 1e-6) {
    throw new ValidationError(
      `${name} zasahuje do okraja gridu (${ok} dielikov): musí ležať v stĺpcoch ${ok}–${x1} a riadkoch ${ok}–${y1}.`);
  }
}

// --- public API -------------------------------------------------------------

export function normalizujSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Spec kompozície musí byť JSON objekt.');
  }
  polia(input, ['format', 'grid', 'kresba', 'kompozicia', 'variant', 'inverzia', 'zony'], 'spec');
  const spec = structuredClone(input);

  spec.format = normalizujFormat(spec.format);
  spec.grid = normalizujGrid(spec.grid, spec.format);
  spec.kresba = normalizujKresba(spec.kresba);
  spec.kompozicia = normalizujKompozicia(spec.kompozicia);
  if (spec.variant !== undefined && typeof spec.variant !== 'string' && typeof spec.variant !== 'number') {
    throw new ValidationError('variant musí byť text alebo číslo.');
  }
  if (spec.variant === undefined) spec.variant = KOMP.predvolene.variant;
  spec.variant = String(spec.variant);
  if (spec.inverzia === undefined) spec.inverzia = KOMP.predvolene.inverzia;
  if (typeof spec.inverzia !== 'boolean') {
    throw new ValidationError('inverzia musí byť true/false.');
  }

  const vyskaD = vyskaVDielikoch(spec.format, spec.grid);
  const zony = spec.zony ?? KOMP.predvolene.zony;
  if (!Array.isArray(zony)) {
    throw new ValidationError('zony musí byť pole zón.');
  }
  spec.zony = zony.map((z, i) => normalizujZonu(z ?? {}, i, spec.grid.stlpce, vyskaD));
  spec.zony.forEach((z, i) => zonaVOkraji(z, i, spec.format, spec.grid));
  return spec;
}

export function komponuj(input, { fontUrls, zmerajText, zmerajGlyfy } = {}) {
  if (zmerajText !== undefined && typeof zmerajText !== 'function') {
    throw new ValidationError(
      'zmerajText musí byť funkcia (text, pismo, velkost, features, face) → šírka v dielikoch.');
  }
  if (zmerajGlyfy !== undefined && typeof zmerajGlyfy !== 'function') {
    throw new ValidationError(
      'zmerajGlyfy musí byť funkcia (text, pismo, velkost, features, face) → pole { x, sirka, hore, dole } v dielikoch.');
  }
  const spec = normalizujSpec(input);
  const { format, grid, kresba, kompozicia: komp } = spec;

  const dielik = format.sirka / grid.stlpce;
  const vyskaD = format.vyska / dielik;
  const bleedD = format.spadavka / dielik;
  const riadkyD = celeRiadky(format, grid);

  // The usable band for shapes depends on how the leftover height is handled.
  // Zones always live in absolute dieliks from the top of the trimmed format.
  let bandY = 0;
  let bandH = vyskaD;
  if (grid.zvysok === 'okraje') {
    const rows = Math.floor(vyskaD + 1e-9);
    bandH = rows;
    bandY = (vyskaD - rows) / 2;
  } else if (grid.zvysok === 'orez') {
    bandH = Math.ceil(vyskaD - 1e-9); // the partial row is filled and cropped by the viewBox
  }
  // The margin (grid.okraj) keeps the pattern off the edges: shapes stay
  // inside its guide, okraj whole dieliky in from the trimmed format's left,
  // top and right edge and from the last whole row, whatever the leftover
  // height does. A grid without a margin keeps the band above.
  let bandX = 0;
  let bandW = grid.stlpce;
  if (grid.okraj > 0) {
    bandX = grid.okraj;
    bandW = grid.stlpce - 2 * grid.okraj;
    bandY = grid.okraj;
    bandH = riadkyD - 2 * grid.okraj;
  }

  const axes = computeAxes(kresba.weight, kresba.contrast, loadProporcie(), kresba.zaoblenie);
  const varovania = [];
  if (komp.rozmiestnenie === 'dlazdice') {
    varovania.push('Rozmiestnenie „dlazdice“ ešte nie je postavené, kreslím ako voľné.');
  }

  const rng = createRng(spec.variant);
  const zony = spec.zony.map((z) => ({
    ...z,
    rect: { x: z.x, y: z.y, w: z.w, h: z.h },
  }));
  // Zones as the pattern sees them. A text zone with text and
  // obtekanie 'text' is wrapped around, not cut out: its obstacles are the
  // tight boxes of the glyphs (measured, or one box per line without a
  // measure) and okraj is the pattern's distance from the letters; a
  // negative okraj shrinks every glyph box by |okraj| per side and a box
  // shrunk out of existence is ignored. A ramik photo zone with zaoblenie
  // blocks its rounded shape as strips (below). Every other zone — a text
  // zone set to obtekanie 'ram', a text zone whose text has no ink, foto and
  // empty zones — stays a frame: a negative okraj lets shapes into the zone by
  // |okraj| from each edge, so the zone shrinks accordingly; one shrunk out
  // of existence (w or h ≤ 0) is ignored entirely.
  const zonyVzor = zony.flatMap((z) => {
    const boxes = z.typ === 'text' && z.text && z.obtekanie === 'text'
      ? prekazkyTextu(z, { zmerajText, zmerajGlyfy, cfg: KOMP.svg })
      : [];
    if (boxes.length) {
      let prekazky = boxes;
      let okraj = z.okraj;
      if (z.okraj < 0) {
        const n = -z.okraj;
        prekazky = boxes
          .map((b) => ({ x: b.x + n, y: b.y + n, w: b.w - 2 * n, h: b.h - 2 * n }))
          .filter((b) => b.w > 0 && b.h > 0);
        okraj = 0;
      }
      if (!prekazky.length) return [];
      // rect is the union of the boxes: a shape far from it is far from every
      // glyph, so the placement tests it first and the boxes only after
      const x0 = Math.min(...prekazky.map((b) => b.x));
      const y0 = Math.min(...prekazky.map((b) => b.y));
      const x1 = Math.max(...prekazky.map((b) => b.x + b.w));
      const y1 = Math.max(...prekazky.map((b) => b.y + b.h));
      return [{
        rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
        okraj,
        glyfy: prekazky,
        plocha: prekazky.reduce((a, b) => a + b.w * b.h, 0),
      }];
    }
    if (z.typ === 'fotka' && z.zaoblenie > 0) {
      // A rounded photo zone blocks its rounded shape, not the frame,
      // so the pattern may fill the corners the rounding cuts off. The
      // radius is the drawn one (rectRamika in svg.js); a negative okraj
      // shrinks the shape by |okraj| per side, its radius with it.
      const n = Math.max(-z.okraj, 0);
      const r = { x: z.rect.x + n, y: z.rect.y + n, w: z.rect.w - 2 * n, h: z.rect.h - 2 * n };
      if (!(r.w > 0 && r.h > 0)) return [];
      const rx = (Math.min(z.rect.w, z.rect.h) / 2) * (z.zaoblenie / 100) - n;
      const pasy = pasyZaoblenia(r, rx);
      return [{
        rect: r,
        okraj: Math.max(z.okraj, 0),
        glyfy: pasy,
        plocha: pasy.reduce((a, b) => a + b.w * b.h, 0),
      }];
    }
    if (z.okraj >= 0) return [{ rect: z.rect, okraj: z.okraj }];
    const n = -z.okraj;
    const w = z.rect.w - 2 * n;
    const h = z.rect.h - 2 * n;
    return w > 0 && h > 0 ? [{ rect: { x: z.rect.x + n, y: z.rect.y + n, w, h }, okraj: 0 }] : [];
  });
  const { placed, varovania: varovaniaUmiestnenia } = placeShapes(rng, {
    build: buildShape,
    axes,
    defaultsOf: defaultParams,
    typy: komp.typy,
    pomery: komp.pomery,
    velkostTvaru: KOMP.velkostTvaru,
    vahyTvaru: KOMP.vahyTvaru,
    velkosti: komp.velkosti,
    stlpce: grid.stlpce,
    bandX,
    bandW,
    bandY,
    bandH,
    zony: zonyVzor,
    medzera: KOMP.rozmiestnenie.medzera,
    hustota: KOMP.rozmiestnenie.hustota,
    maxPokusov: KOMP.rozmiestnenie.maxPokusov,
    skok: KOMP.rozmiestnenie.skok,
    retazenieDlzka: komp.retazenieDlzka,
    retazeniePokusy: KOMP.rozmiestnenie.retazenie.pokusy,
    dotyk: KOMP.rozmiestnenie.retazenie.dotyk,
    neuspechov: KOMP.rozmiestnenie.retazenie.neuspechov,
    spojky: KOMP.rozmiestnenie.retazenie.spojky,
    spojkyMinKontrast: KOMP.rozmiestnenie.retazenie.spojkyMinKontrast,
    spojkaPomer: KOMP.rozmiestnenie.retazenie.spojkaPomer,
    zakazanePary: KOMP.rozmiestnenie.retazenie.zakazanePary,
    kvapka: KOMP.kvapka,
  });
  varovania.push(...varovaniaUmiestnenia);

  // Rebuild accepted shapes and bake the translation into their path data —
  // the pattern layer is one compound path without per-shape transforms.
  // `spoje` names the ends joined to a neighbour, rebuilt square.
  const tvary = placed.map((p) => {
    const shape = buildShape(p.typ, {
      ...p.params, rotate: p.rotate, mirror: p.mirror, spoje: p.spoje,
    }, axes);
    return {
      ...p,
      bbox: { x: p.x, y: p.y, w: p.bbox.w, h: p.bbox.h },
      d: shape.paths.map((path) => translatePathD(path, p.x, p.y)).join(' '),
    };
  });

  // the exported canvas: trim + bleed + the crop-mark band (znacky.js)
  const platno = rozmerPlatna(format);
  const { svg, varovania: varovaniaTextu } = renderSvg({
    stlpce: grid.stlpce,
    vyskaD,
    bleedD,
    pasD: platno.pas / dielik,
    hrubkaD: hrubkaZnaciek(format) / dielik,
    jednotka: format.jednotka,
    sirkaPlatna: platno.sirka,
    vyskaPlatna: platno.vyska,
    placed: tvary,
    zony,
    inverzia: spec.inverzia,
    fontUrls,
    zmerajText,
    cfg: KOMP.svg,
  });
  varovania.push(...varovaniaTextu);

  return {
    svg,
    // raster size of the whole canvas, so a PNG keeps the SVG's proportions
    sirkaPx: platno.sirkaPx,
    vyskaPx: platno.vyskaPx,
    dielik,
    tvary: tvary.map(({ d, ...t }) => t),
    varovania,
  };
}
