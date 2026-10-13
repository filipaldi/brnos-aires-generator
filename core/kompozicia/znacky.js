// Crop marks of a print sheet. A format with a bleed (spadavka > 0) is
// exported on a canvas that grows by a mark band on every side: trim + bleed
// + band. The eight standard marks (two per corner, each on the line of a
// trim edge) start at the bleed edge — spadavka away from the trim — and run
// outward across the band, so they never touch the printed area. A format
// without a bleed (digital, px) has no band and no marks.
//
// The mark length (mm) and hairline (pt) live in proporcie.json
// (kompozicia.svg.znacky); here they are converted to the format's units.

import { loadProporcie } from '../axes.js';

const ZNACKY = loadProporcie().kompozicia.svg.znacky;

const MM_NA_PALEC = 25.4;
const PT_NA_PALEC = 72;

// Format units (mm or px) per millimetre.
function jednotiekNaMm(format) {
  return format.jednotka === 'mm' ? 1 : format.dpi / MM_NA_PALEC;
}

// Width of the mark band in format units: the mark length, or 0 without a
// bleed (a digital format keeps its size).
export function pasZnaciek(format, cfg = ZNACKY) {
  return format.spadavka > 0 ? cfg.dlzka * jednotiekNaMm(format) : 0;
}

// Hairline of the marks in format units.
export function hrubkaZnaciek(format, cfg = ZNACKY) {
  return (cfg.hrubka * MM_NA_PALEC / PT_NA_PALEC) * jednotiekNaMm(format);
}

// The whole exported canvas: in format units (sirka, vyska, the band pas)
// and in raster pixels at the format's dpi.
export function rozmerPlatna(format, cfg = ZNACKY) {
  const pas = pasZnaciek(format, cfg);
  const sirka = format.sirka + 2 * (format.spadavka + pas);
  const vyska = format.vyska + 2 * (format.spadavka + pas);
  const naPx = format.jednotka === 'mm' ? MM_NA_PALEC / format.dpi : 1;
  return {
    sirka, vyska, pas,
    sirkaPx: Math.round(sirka / naPx),
    vyskaPx: Math.round(vyska / naPx),
  };
}

// The eight marks as [x1, y1, x2, y2], in the units of the arguments (the
// trim origin at 0,0): `sirka` × `vyska` the trimmed format, `spadavka` the
// gap from the trim edge, `dlzka` the mark length. Each runs from the bleed
// edge outward. Order: top-left, top-right, bottom-left, bottom-right; in
// each corner the horizontal mark first.
export function orezoveZnacky({ sirka, vyska, spadavka, dlzka }) {
  const a = spadavka;
  const b = spadavka + dlzka;
  return [
    [-b, 0, -a, 0], [0, -b, 0, -a],
    [sirka + a, 0, sirka + b, 0], [sirka, -b, sirka, -a],
    [-b, vyska, -a, vyska], [0, vyska + a, 0, vyska + b],
    [sirka + a, vyska, sirka + b, vyska], [sirka, vyska + a, sirka, vyska + b],
  ];
}
