// The photo of a photo zone as numbers: where it lies on the sheet relative
// to its frame (the zone rect) and how far it may move or shrink so it still
// covers the whole frame. Shared by the core's validation and SVG, the stub
// and the editor, so all of them see the same photo.
//
// A photo zone carries
//   mierka — whole %, 100 = the photo exactly covers the frame (cover fit),
//   posun  — [x, y] whole % of the frame's width and height, the offset of
//            the photo's centre from the frame's centre,
//   rozmer — [width, height] of the photo in pixels (optional; set by the
//            editor when it reads the photo). Without it the photo is taken
//            to have the frame's own proportions.

// Slack for floating-point noise when a limit lands exactly on a whole %.
const E = 1e-9;

// The photo's size at mierka 100: the smallest size of its proportions that
// covers the frame r.
export function pokrytieFotky(r, rozmer) {
  const pomer = rozmer ? rozmer[0] / rozmer[1] : r.w / r.h;
  return pomer >= r.w / r.h ? { w: r.h * pomer, h: r.h } : { w: r.w, h: r.w / pomer };
}

// The photo's rect on the sheet for the frame r.
export function obdlznikFotky(r, { mierka = 100, posun = [0, 0], rozmer = null } = {}) {
  const c = pokrytieFotky(r, rozmer);
  const w = (c.w * mierka) / 100;
  const h = (c.h * mierka) / 100;
  const cx = r.x + r.w / 2 + (posun[0] / 100) * r.w;
  const cy = r.y + r.h / 2 + (posun[1] / 100) * r.h;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// How far (whole % of the frame, each axis) the photo's centre may sit from
// the frame's centre while the photo still covers the frame: rounded down,
// so a clamped posun never opens a gap.
export function medzePosunu(r, { mierka = 100, rozmer = null } = {}) {
  const c = pokrytieFotky(r, rozmer);
  const vol = (dlzka, ram) => Math.max(0, Math.floor(((dlzka * mierka) / 100 - ram) / 2 / ram * 100 + E));
  return [vol(c.w, r.w), vol(c.h, r.h)];
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// mierka and posun pulled back into what keeps the frame covered: mierka a
// whole % from 100 to max, posun whole % within medzePosunu. Values already
// inside come back unchanged.
export function pritiahniFotku(r, { mierka = 100, posun = [0, 0], rozmer = null }, max) {
  const m = clamp(Math.round(mierka), 100, max);
  const [mx, my] = medzePosunu(r, { mierka: m, rozmer });
  return {
    mierka: m,
    posun: [clamp(Math.round(posun[0]), -mx, mx) + 0, clamp(Math.round(posun[1]), -my, my) + 0],
  };
}

// The mierka and posun that put the photo at the sheet rect `foto` (its
// proportions those of the photo) inside the frame r, rounded to whole %
// and clamped so the frame stays covered: a frame resized under a photo
// that stays put, or a photo dragged or scaled by the editor.
export function fotkaVRamiku(r, foto, rozmer, max) {
  const c = pokrytieFotky(r, rozmer);
  return pritiahniFotku(r, {
    mierka: (foto.w / c.w) * 100,
    posun: [
      ((foto.x + foto.w / 2 - (r.x + r.w / 2)) / r.w) * 100,
      ((foto.y + foto.h / 2 - (r.y + r.h / 2)) / r.h) * 100,
    ],
    rozmer,
  }, max);
}

// An older photo zone: `zoom` scaled the frame-sized photo from its top-left
// corner and `posun` moved it by a share of the frame (1 = one frame width).
// The same picture in the current fields: mierka = zoom in %, posun = the
// offset of the photo's centre in %. Rounded; the caller clamps.
export function zoStarehoZoomu(posun = [0, 0], zoom = 1) {
  return {
    mierka: Math.round(zoom * 100),
    posun: posun.map((p) => Math.round((p + (zoom - 1) / 2) * 100) + 0),
  };
}
