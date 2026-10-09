// OpenType features of a text zone: which tags each sheet font supports and
// how the { tag: true/false } field of a zone is normalised. The tag lists
// live in proporcie.json (kompozicia.pismaFeatures), the author tunes them
// there. Shared by the core (zone validation, SVG assembly), the measuring
// canvas and the UI (zone bar popover, editor), so the sheet, the editor and
// the wrap always set the same features.

import { loadProporcie } from '../axes.js';
import { ValidationError } from '../errors.js';

const FEATUREY = loadProporcie().kompozicia.pismaFeatures;

// The fonts a zone may set text in — derived from the feature list, so a new
// font is added once, in proporcie.json.
export const FONTY = Object.keys(FEATUREY.pisma);

export function tagyPisma(pismo) {
  const tagy = FEATUREY.pisma[pismo];
  if (!tagy) {
    throw new ValidationError(`Neznáme písmo „${pismo}“. Platné písma: ${FONTY.join(', ')}.`);
  }
  return tagy;
}

// Defaults for a font: every supported tag, only the ones in `zapnute` (and
// supported by the font) on — ss01 is never on by default.
export function predvoleneFeatures(pismo) {
  return Object.fromEntries(tagyPisma(pismo).map((tag) => [tag, FEATUREY.zapnute.includes(tag)]));
}

// A zone's features field: a plain { tag: true/false } object with only tags
// the font supports. A missing field (or a missing tag in a partial object)
// falls back to the defaults; an unknown tag or a non-boolean value is a
// clear Slovak error. The result always carries every supported tag, in the
// order of proporcie.json, so the SVG stays byte-deterministic.
export function normalizujFeatures(features, pismo, name) {
  const podporovane = tagyPisma(pismo);
  const out = predvoleneFeatures(pismo);
  if (features === undefined) return out;
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    throw new ValidationError(
      `${name}.features musí byť objekt { tag: true/false }, napr. { "liga": true, "dlig": true }.`);
  }
  for (const [tag, zap] of Object.entries(features)) {
    if (!podporovane.includes(tag)) {
      throw new ValidationError(
        `Neznámy tag „${tag}“ v ${name}.features. Písmo ${pismo} podporuje: ${podporovane.join(', ')}.`);
    }
    if (typeof zap !== 'boolean') {
      throw new ValidationError(`${name}.features.${tag} musí byť true/false (dostal som „${zap}“).`);
    }
    out[tag] = zap;
  }
  return out;
}

// Features after switching a zone's font: tags both fonts share keep their
// on/off state, the rest get the new font's defaults.
export function featuresPoZmenePisma(stare, novePismo) {
  const nove = predvoleneFeatures(novePismo);
  for (const [tag, zap] of Object.entries(stare || {})) {
    if (tag in nove) nove[tag] = zap;
  }
  return nove;
}

// CSS value for font-feature-settings with every tag explicit, on as 1 and
// off as 0 — a disabled liga must read 'liga' 0, never fall back to default.
export function fontFeatureSettings(features) {
  const casti = Object.entries(features || {}).map(([tag, zap]) => `'${tag}' ${zap ? 1 : 0}`);
  return casti.length ? casti.join(', ') : 'normal';
}
