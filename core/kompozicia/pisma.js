// Font cuts (rezy) and weights of text zones. The model lives in
// proporcie.json (kompozicia.pisma) and is the single source of truth shared
// by the core (zone validation, SVG assembly), the measuring canvas, the text
// editor and every export — so a new Brnos Aires cut is added by dropping the
// file into fonts/ and appending one item to its `rezy` list, nothing else.
//
// A static font (Brnos Aires) lists its rezy: one file per cut, each with an
// optional family / weight / style for @font-face (cuts of one family must
// differ in at least one of them). A variable font (Nunito) has an axis
// instead: min–max in whole numbers with `predvolene` as the default weight.

import { loadProporcie } from '../axes.js';
import { ValidationError } from '../errors.js';
import { FONTY as FONTY_Z_FEATURES } from './features.js';

// Keys starting with _ (the block's comment in proporcie.json) are metadata,
// not fonts — they never reach the model.
const MODEL = Object.fromEntries(
  Object.entries(loadProporcie().kompozicia.pisma).filter(([k]) => !k.startsWith('_')),
);

// Features and rezy describe the same fonts from two sides; a list mismatch
// is a broken proporcie.json, not a user error — fail at load, with both
// lists in the message.
if (JSON.stringify(Object.keys(MODEL).sort()) !== JSON.stringify([...FONTY_Z_FEATURES].sort())) {
  throw new ValidationError(
    `Zoznamy písiem v kompozicia.pisma (${Object.keys(MODEL).join(', ')}) a kompozicia.pismaFeatures`
    + ` (${FONTY_Z_FEATURES.join(', ')}) musia sedieť.`);
}

for (const [pismo, m] of Object.entries(MODEL)) {
  if (Array.isArray(m.rezy)) {
    const ids = new Set();
    for (const rez of m.rezy) {
      if (!rez || typeof rez !== 'object' || !rez.id || !rez.nazov || !rez.subor || !rez.format) {
        throw new ValidationError(
          `Rez písma ${pismo} v kompozicia.pisma musí mať id, nazov, subor a format.`);
      }
      if (ids.has(rez.id)) {
        throw new ValidationError(`Duplicitný rez „${rez.id}“ písma ${pismo} v kompozicia.pisma.`);
      }
      ids.add(rez.id);
    }
    if (!m.rezy.length) {
      throw new ValidationError(`Písmo ${pismo} v kompozicia.pisma musí mať aspoň jeden rez.`);
    }
  } else if (typeof m.osa !== 'string' || !Number.isInteger(m.min)
    || !Number.isInteger(m.max) || !Number.isInteger(m.predvolene)
    || m.min > m.predvolene || m.predvolene > m.max || !m.subor || !m.format) {
    throw new ValidationError(
      `Variabilné písmo ${pismo} v kompozicia.pisma musí mať osa, min, max, predvolene, subor a format (celé čísla, min ≤ predvolené ≤ max).`);
  }
}

function modelPisma(pismo) {
  const model = MODEL[pismo];
  if (!model) {
    throw new ValidationError(`Neznáme písmo „${pismo}“. Platné písma: ${Object.keys(MODEL).join(', ')}.`);
  }
  return model;
}

// --- validation helpers (the same wording as kompozicia/index.js) ----------

function cislo(value, name, { min, max, cele = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} musí byť číslo (dostal som „${value}“).`);
  }
  if (cele && !Number.isInteger(value)) {
    throw new ValidationError(`${name} musí byť celé číslo (dostal som ${value}).`);
  }
  if (value < min || value > max) {
    throw new ValidationError(`${name} musí byť v rozsahu ${min}–${max} (dostal som ${value}).`);
  }
  return value;
}

function moznosti(value, name, values) {
  if (!values.includes(value)) {
    throw new ValidationError(`${name} prijíma iba ${values.join(' | ')} (dostal som „${value}“).`);
  }
  return value;
}

// --- the model, read --------------------------------------------------------

export function jeVariabilne(pismo) {
  return !Array.isArray(modelPisma(pismo).rezy);
}

export function rezyPisma(pismo) {
  return modelPisma(pismo).rezy ?? [];
}

export function osaPisma(pismo) {
  const m = modelPisma(pismo);
  return { osa: m.osa, min: m.min, max: m.max, predvolene: m.predvolene };
}

// Defaults of a font's rez field: the first rez of a static font, the axis
// default of a variable one. Used for fresh zones and after a font switch.
export function predvolenePisma(pismo) {
  const m = modelPisma(pismo);
  return Array.isArray(m.rezy) ? { rez: m.rezy[0].id } : { hrubka: m.predvolene };
}

// The zone's rez/hrubka field: a static font carries the rez id (a missing
// field means the font's default), a variable font the weight on its axis as
// a whole number. The field of the other kind of font is a clear error — a
// spec that switched fonts must switch the field with it.
export function normalizujRezZony(raw, pismo, name) {
  const m = modelPisma(pismo);
  if (Array.isArray(m.rezy)) {
    if (raw && 'hrubka' in raw) {
      throw new ValidationError(
        `${name}.hrubka: písmo ${pismo} nie je variabilné, použi pole rez.`);
    }
    const ids = m.rezy.map((r) => r.id);
    const rez = raw && raw.rez !== undefined
      ? moznosti(raw.rez, `${name}.rez`, ids)
      : ids[0];
    return { rez };
  }
  if (raw && 'rez' in raw) {
    throw new ValidationError(`${name}.rez: písmo ${pismo} je variabilné, použi pole hrubka.`);
  }
  const hrubka = raw && raw.hrubka !== undefined
    ? cislo(raw.hrubka, `${name}.hrubka`, { min: m.min, max: m.max, cele: true })
    : m.predvolene;
  return { hrubka };
}

// How a zone's text is set: the family and weight the SVG, the canvas measure
// and the editor all resolve from the zone's rez (static) or hrubka
// (variable). A zone that has not been normalised yet falls back to the
// font's defaults, so direct zalamujText calls keep working.
export function faceZony(z) {
  const m = modelPisma(z.pismo);
  if (Array.isArray(m.rezy)) {
    const rez = m.rezy.find((r) => r.id === z.rez) ?? m.rezy[0];
    return {
      family: rez.family ?? z.pismo,
      weight: rez.weight ?? 400,
      style: rez.style ?? 'normal',
    };
  }
  return {
    family: z.pismo,
    weight: Number.isInteger(z.hrubka) ? z.hrubka : m.predvolene,
    style: 'normal',
  };
}

// --- @font-face ---------------------------------------------------------

// The faces a set of font URLs declares. `fontUrls` maps a font name to one
// URL (variable font — the file covers the whole axis) or to { rezId: url }
// (static font — one file per rez); every face the model knows and the caller
// delivered becomes one entry, so the SVG and the raster exports carry all
// files the text needs.
export function facesFontov(fontUrls) {
  const out = [];
  for (const [pismo, urls] of Object.entries(fontUrls || {})) {
    const m = MODEL[pismo];
    if (!m) continue;
    if (Array.isArray(m.rezy)) {
      if (!urls || typeof urls !== 'object') continue;
      for (const rez of m.rezy) {
        if (urls[rez.id] === undefined) continue;
        out.push({
          family: rez.family ?? pismo,
          url: urls[rez.id],
          weight: String(rez.weight ?? 400),
          style: rez.style ?? 'normal',
          format: rez.format,
        });
      }
    } else if (typeof urls === 'string') {
      out.push({
        family: pismo,
        url: urls,
        weight: `${m.min} ${m.max}`,
        style: 'normal',
        format: m.format,
      });
    }
  }
  return out;
}

// One @font-face rule. The weight is always written — the whole axis of a
// variable font, the exact weight of a rez — so two rezy of one family can
// differ; `swap` (the live document, never the exports) avoids invisible
// text while a webfont loads.
export function fontFaceCss(face, { swap = false } = {}) {
  const style = face.style && face.style !== 'normal' ? ` font-style: ${face.style};` : '';
  return `@font-face { font-family: '${face.family}'; src: url('${face.url}') format('${face.format}');`
    + ` font-weight: ${face.weight};${style}${swap ? ' font-display: swap;' : ''} }`;
}

// --- files ----------------------------------------------------------------

// Every font file the model needs on disk: one per variable font, one per
// rez of a static font. `subor` is relative to the repository root; the UI
// and the CLI resolve it against their own location.
export function suboryFontov() {
  const out = [];
  for (const [pismo, m] of Object.entries(MODEL)) {
    if (Array.isArray(m.rezy)) {
      for (const rez of m.rezy) {
        out.push({ pismo, rezId: rez.id, subor: rez.subor, format: rez.format });
      }
    } else {
      out.push({ pismo, rezId: null, subor: m.subor, format: m.format });
    }
  }
  return out;
}

// MIME type of a font format, for data URLs in the CLI's PNG export.
const MIME = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  truetype: 'font/ttf',
  opentype: 'font/otf',
};

export function mimeFormatu(format) {
  return MIME[format] ?? 'application/octet-stream';
}
