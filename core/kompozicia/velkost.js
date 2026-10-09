// Shape sizes: a size s in dieliks is drawn from the type's `velkosti` range,
// then mapped to the type's length parameters.
// Shapes are never scaled afterwards — stroke thickness always comes from the
// axes, so only parameter values change with s.

import { rngInt } from './rng.js';

// Snap to half a dielik — the placement grid works in the same steps.
export function snapHalf(v) {
  return Math.round(v * 2) / 2;
}

// One draw from the type's size range: an integer spread evenly over
// [min, max], both ends equally likely.
export function drawSize(rng, { velkost }) {
  const [min, max] = velkost;
  return min + rngInt(rng, max - min + 1);
}

// Size s → parameters for one type. Ratios live in proporcie.json
// (kompozicia.velkostTvaru); this function only reads them, with the per-type
// mapping documented here:
//   noha                   one length parameter equals s
//   stvrtoblouk            polomer = s · polomerPomer (foot stays heavy)
//   polkruh, stvrtkruh     polomer = s · polomerPomer
//   kruh                   priemer = s · priemerPomer
//   kvapka                 width = s (the neck blend krk is solved for it, see rozmiestnenie.js)
export function paramsFor(type, s, defaults, cfg) {
  const p = { ...defaults };
  const c = cfg[type] || {};
  for (const key of c.zVelkosti || []) p[key] = s;
  // arcs and pätky: the radius grows with s (a pätka's foot stays heavy)
  if (c.polomerPomer) p.polomer = snapHalf(s * c.polomerPomer);
  if (c.priemerPomer) p.priemer = s * c.priemerPomer;
  // fixed accents and fixed values — numbers other than the
  // named ratios are plain parameter values
  for (const [key, value] of Object.entries(c)) {
    if (['zVelkosti', 'sirkaPomer', 'polomerPomer', 'priemerPomer'].includes(key)) continue;
    if (key in p || value === null) p[key] = value;
  }
  return p;
}

// Largest size s (whole dieliky, at most `strop`) whose parameters stay
// within the type's parameter limits: a kruh's priemer is s · priemerPomer
// and may not exceed the priemer maximum, so its size range ends earlier.
export function maxVelkost(type, spec, cfg, strop = 40) {
  const c = cfg[type] || {};
  let max = strop;
  const lim = (key, pomer) => {
    if (spec[key] && Number.isFinite(spec[key].max)) max = Math.min(max, Math.floor(spec[key].max / pomer + 1e-9));
  };
  for (const key of c.zVelkosti || []) lim(key, 1);
  if (c.polomerPomer) lim('polomer', c.polomerPomer);
  if (c.priemerPomer) lim('priemer', c.priemerPomer);
  return Math.max(1, max);
}
