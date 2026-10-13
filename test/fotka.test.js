// Photo zone: rounded corners (zaoblenie) and an inner border, the photo's
// own size and offset (mierka, posun) — validation in the core and the stub,
// the upgrade of older zones, the clip rect, the photo rect and the outline
// in SVG.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizujSpec, komponuj } from '../core/kompozicia/index.js';
import { normalizujSpec as normalizujSpecStub } from '../ui/stub.js';
import { ValidationError } from '../core/errors.js';

const FOTKA = 'data:image/png;base64,iVBORw0KGgo=';

const specSFotkou = (zona, ine = {}) => ({
  grid: { stlpce: 12, okraj: 0 },
  zony: [{ typ: 'fotka', x: 2, y: 2, w: 6, h: 4, zdroj: FOTKA, ...zona }],
  ...ine,
});

// attributes of the first element `tag` in `svg` carrying `kde` among its attributes
function atributy(svg, tag, kde = '') {
  const m = [...svg.matchAll(new RegExp(`<${tag} ([^>]*)/?>`, 'g'))].find((x) => x[1].includes(kde));
  if (!m) return null;
  return Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
}

test('zaoblenie a border fotozóny: chýbajúce pole je 0', () => {
  for (const normalizuj of [normalizujSpec, normalizujSpecStub]) {
    const z = normalizuj(specSFotkou({})).zony[0];
    assert.equal(z.zaoblenie, 0);
    assert.equal(z.border, 0);
  }
  const z = normalizujSpec(specSFotkou({ zaoblenie: 100, border: 100 })).zony[0];
  assert.equal(z.zaoblenie, 100);
  assert.equal(z.border, 100);
});

test('zaoblenie a border: záporné, nad 100 a desatinné sa odmietne (jadro aj stub)', () => {
  for (const pole of ['zaoblenie', 'border']) {
    for (const zla of [-1, 101, 12.5, '10']) {
      for (const normalizuj of [normalizujSpec, normalizujSpecStub]) {
        assert.throws(() => normalizuj(specSFotkou({ [pole]: zla })), (e) => {
          assert.ok(e instanceof ValidationError, `${pole}=${zla}`);
          assert.match(e.message, new RegExp(pole));
          return true;
        }, `${pole}=${zla}`);
      }
    }
  }
});

test('bez zaoblenia a borderu ostane rámik ako doteraz (bez rx, bez obrysu)', () => {
  const { svg } = komponuj(specSFotkou({}));
  const clip = atributy(svg, 'rect', 'x="2" y="2"');
  assert.equal(clip.rx, undefined);
  assert.ok(!svg.includes('fill="none" stroke='), 'žiadny border');
});

test('zaoblenie > 0: orezový rect má rx v % polovice kratšej strany', () => {
  // zone 6 × 4: half the shorter side is 2, 30 % of it is 0.6
  const { svg } = komponuj(specSFotkou({ zaoblenie: 30 }));
  const clip = /<clipPath id="(ramik-\d+)"><rect ([^>]*)\/><\/clipPath>/.exec(svg);
  assert.ok(clip, 'clipPath rámika');
  assert.match(clip[2], /rx="0\.6"/);
  assert.ok(svg.includes(`clip-path="url(#${clip[1]})"`), 'fotka je orezaná');
  // 100 % of a square is a circle
  const kruh = komponuj(specSFotkou({ w: 4, h: 4, zaoblenie: 100 })).svg;
  assert.match(kruh, /<clipPath id="ramik-\d+"><rect x="2" y="2" width="4" height="4" rx="2"\/>/);
});

test('border > 0: obrys v % dielika, farbou vzoru, len dovnútra zóny', () => {
  // 20 % of a dielik: a stroke of 0.4 centred on the edge, clipped by the
  // zone shape, leaves 0.2 inside the zone and nothing outside
  for (const [inverzia, farba] of [[false, '#000'], [true, '#fff']]) {
    const { svg } = komponuj(specSFotkou({ zaoblenie: 30, border: 20 }, { inverzia }));
    const obrys = atributy(svg, 'rect', 'stroke=');
    assert.ok(obrys, 'obrys borderu');
    assert.equal(obrys.fill, 'none');
    assert.equal(obrys.stroke, farba, `farba vzoru pri inverzii ${inverzia}`);
    assert.equal(obrys['stroke-width'], '0.4');
    assert.equal(obrys.rx, '0.6', 'border kopíruje zaoblenie');
    assert.deepEqual([obrys.x, obrys.y, obrys.width, obrys.height], ['2', '2', '6', '4']);
    const clip = /<clipPath id="(ramik-\d+)"><rect x="2" y="2" width="6" height="4" rx="0\.6"\/>/.exec(svg);
    assert.ok(clip, 'orezanie tvarom zóny');
    assert.equal(obrys['clip-path'], `url(#${clip[1]})`);
    // the border lies over the photo
    assert.ok(svg.indexOf('<image') < svg.indexOf('stroke-width="0.4"'));
  }
});

test('prázdna fotozóna v rámiku má zaoblenie aj border už pred nahraním fotky', () => {
  const { svg } = komponuj(specSFotkou({ zdroj: null, zaoblenie: 50, border: 10 }));
  const plocha = atributy(svg, 'rect', 'fill="#e3e3e3"');
  assert.equal(plocha.rx, '1');
  const obrys = atributy(svg, 'rect', 'stroke=');
  assert.equal(obrys['stroke-width'], '0.2');
  assert.equal(obrys.rx, '1');
  assert.match(obrys['clip-path'], /^url\(#ramik-\d+\)$/);
});

test('stará maska a prekrytie sa vykreslia ako rámik so zaoblením a borderom', () => {
  const ramik = komponuj(specSFotkou({ zaoblenie: 50, border: 50 })).svg;
  for (const rezim of ['maska', 'prekrytie', 'ramik']) {
    for (const normalizuj of [normalizujSpec, normalizujSpecStub]) {
      const z = normalizuj(specSFotkou({ rezim, zaoblenie: 50, border: 50 })).zony[0];
      assert.equal('rezim' in z, false, rezim);
    }
    const { svg } = komponuj(specSFotkou({ rezim, zaoblenie: 50, border: 50 }));
    assert.equal(svg, ramik, rezim);
    assert.match(svg, /<clipPath id="ramik-\d+"><rect x="2" y="2" width="6" height="4" rx="1"\/>/, rezim);
    assert.match(atributy(svg, 'image')['clip-path'], /^url\(#ramik-\d+\)$/, rezim);
  }
});

test('JSON template prenesie zaoblenie aj border fotozóny', async () => {
  const { bezFotiek } = await import('../ui/state/sablony.js');
  const z = bezFotiek(specSFotkou({ zaoblenie: 40, border: 15 })).zony[0];
  assert.equal(z.zdroj, undefined);
  assert.equal(z.zaoblenie, 40);
  assert.equal(z.border, 15);
});

// --- the pattern around a rounded zone --------------------------------------

const E = 1e-9;
const prekryv = (a, b) => a.x < b.x + b.w - E && b.x < a.x + a.w - E && a.y < b.y + b.h - E && b.y < a.y + a.h - E;
const vnutri = (a, b) => a.x >= b.x - E && a.y >= b.y - E && a.x + a.w <= b.x + b.w + E && a.y + a.h <= b.y + b.h + E;
// distance from the point (cx, cy) to the nearest point of the box
const kBodu = (b, cx, cy) => Math.hypot(
  Math.max(b.x - cx, 0, cx - b.x - b.w),
  Math.max(b.y - cy, 0, cy - b.y - b.h),
);

const KRUH = { x: 2, y: 2, w: 8, h: 8 }; // zaoblenie 100 → a circle of radius 4 around (6, 6)
const specKruhu = (variant, zona = {}) => ({
  variant,
  grid: { stlpce: 12, okraj: 0 },
  zony: [{ typ: 'fotka', ...KRUH, zdroj: FOTKA, zaoblenie: 100, ...zona }],
});

test('zaoblená fotozóna: vzor vojde do rohov, ale nie do zaobleného tvaru', () => {
  for (const zdroj of [FOTKA, null]) {
    let vRohu = 0;
    for (let v = 1; v <= 8; v++) {
      for (const t of komponuj(specKruhu(v, { zdroj })).tvary) {
        assert.ok(kBodu(t.bbox, 6, 6) >= 4 - 1e-6,
          `variant ${v}: tvar ${t.typ} ${JSON.stringify(t.bbox)} zasahuje do kruhu`);
        if (vnutri(t.bbox, KRUH)) vRohu++;
      }
    }
    assert.ok(vRohu > 0, `aspoň jeden tvar celý v rohu rámika (zdroj ${zdroj ? 'fotka' : 'prázdny'})`);
  }
});

test('zaoblená fotozóna drží okraj od zaobleného tvaru', () => {
  for (let v = 1; v <= 3; v++) {
    for (const t of komponuj(specKruhu(v, { okraj: 1 })).tvary) {
      // the strips cover the shape, okraj 1 holds every shape 1 dielik (on
      // each axis) from them, so at least 1 from the circle
      assert.ok(kBodu(t.bbox, 6, 6) >= 5 - 1e-6, `variant ${v}: ${JSON.stringify(t.bbox)}`);
    }
  }
});

test('zaoblenie 0: prekážkou je celý rect zóny ako doteraz', () => {
  for (let v = 1; v <= 3; v++) {
    const s0 = komponuj(specKruhu(v, { zaoblenie: 0 }));
    const bez = specKruhu(v);
    delete bez.zony[0].zaoblenie;
    assert.equal(s0.svg, komponuj(bez).svg, 'zaoblenie 0 je to isté ako bez poľa');
    for (const t of s0.tvary) assert.ok(!prekryv(t.bbox, KRUH), `variant ${v}: ${JSON.stringify(t.bbox)}`);
  }
});

test('stub: zaoblená fotozóna pustí vzor do rohov, nie do kruhu', async () => {
  const { komponuj: komponujStub } = await import('../ui/stub.js');
  let vRohu = 0;
  for (let v = 1; v <= 12; v++) {
    for (const t of komponujStub(specKruhu(v)).tvary) {
      assert.ok(kBodu(t.bbox, 6, 6) >= 4 - 1e-6, `variant ${v}: ${JSON.stringify(t.bbox)}`);
      if (prekryv(t.bbox, KRUH)) vRohu++;
    }
  }
  assert.ok(vRohu > 0, 'aspoň jeden tvar v rohu rámika');
});

// --- the photo's own size and offset (mierka, posun) ------------------------

const MAX = 1000; // kompozicia.mierkaFotky.max in proporcie.json

// does the photo rect cover the frame rect whole?
const pokryva = (foto, r) => foto.x <= r.x + E && foto.y <= r.y + E
  && foto.x + foto.w >= r.x + r.w - E && foto.y + foto.h >= r.y + r.h - E;

test('mierka a posun: chýbajúce pole je 100 a [0, 0], celé čísla prejdú', () => {
  for (const normalizuj of [normalizujSpec, normalizujSpecStub]) {
    const z = normalizuj(specSFotkou({})).zony[0];
    assert.equal(z.mierka, 100);
    assert.deepEqual(z.posun, [0, 0]);
    assert.equal('zoom' in z, false);
    const z2 = normalizuj(specSFotkou({ mierka: 140, posun: [-20, 10] })).zony[0];
    assert.equal(z2.mierka, 140);
    assert.deepEqual(z2.posun, [-20, 10]);
  }
});

test('mierka a posun: desatinné, mimo rozsahu a nečíselné sa odmietne (jadro aj stub)', () => {
  const zle = [
    [{ mierka: 120.5 }, /mierka/],
    [{ mierka: 99 }, /mierka/],
    [{ mierka: MAX + 1 }, /mierka/],
    [{ mierka: '120' }, /mierka/],
    [{ mierka: 120, posun: [1.5, 0] }, /posun/],
    [{ mierka: 120, posun: [0, '3'] }, /posun/],
    [{ mierka: 120, posun: [0] }, /posun/],
    [{ rozmer: [640.5, 480] }, /rozmer/],
    [{ rozmer: [0, 480] }, /rozmer/],
  ];
  for (const [zona, rx] of zle) {
    for (const normalizuj of [normalizujSpec, normalizujSpecStub]) {
      assert.throws(() => normalizuj(specSFotkou(zona)), (e) => {
        assert.ok(e instanceof ValidationError, JSON.stringify(zona));
        assert.match(e.message, rx);
        return true;
      }, JSON.stringify(zona));
    }
  }
});

test('posun sa pritiahne tak, aby fotka vždy pokryla rámik', async () => {
  const { obdlznikFotky, medzePosunu } = await import('../core/kompozicia/fotka.js');
  const r = { x: 2, y: 2, w: 6, h: 4 };
  for (const rozmer of [undefined, [1600, 900], [600, 1200], [300, 200]]) {
    for (const mierka of [100, 101, 137, 250]) {
      for (const posun of [[0, 0], [500, -500], [-37, 12], [99, 99]]) {
        for (const normalizuj of [normalizujSpec, normalizujSpecStub]) {
          const z = normalizuj(specSFotkou({ mierka, posun, ...(rozmer ? { rozmer } : {}) })).zony[0];
          assert.ok(z.posun.every(Number.isInteger), JSON.stringify(z.posun));
          assert.ok(Number.isInteger(z.mierka));
          const foto = obdlznikFotky(r, z);
          assert.ok(pokryva(foto, r), `${rozmer} ${mierka} ${posun} → ${JSON.stringify(foto)}`);
          // the core's SVG draws exactly that rect (composing is slow, so
          // only for the photo pushed furthest out)
          if (normalizuj === normalizujSpec && mierka === 137 && posun[0] === 500) {
            const img = atributy(komponuj(specSFotkou({ mierka, posun, ...(rozmer ? { rozmer } : {}) })).svg, 'image');
            assert.ok(pokryva({ x: +img.x, y: +img.y, w: +img.width, h: +img.height }, r));
          }
        }
      }
    }
    // a posun within the limits stays as it is
    const [mx, my] = medzePosunu(r, { mierka: 150, rozmer });
    const z = normalizujSpec(specSFotkou({ mierka: 150, posun: [mx, -my], ...(rozmer ? { rozmer } : {}) })).zony[0];
    assert.deepEqual(z.posun, [mx, -my]);
  }
  // at mierka 100 a photo of the frame's proportions cannot move at all, a
  // wider one only sideways
  assert.deepEqual(normalizujSpec(specSFotkou({ posun: [10, 10], mierka: 100 })).zony[0].posun, [0, 0]);
  const siroka = normalizujSpec(specSFotkou({ posun: [10, 10], mierka: 100, rozmer: [1200, 400] })).zony[0];
  assert.deepEqual(siroka.posun, [10, 0]);
});

test('fotkaVRamiku: fotka nemenšia ako rámik, výsledok v celých %', async () => {
  const { fotkaVRamiku, obdlznikFotky } = await import('../core/kompozicia/fotka.js');
  const r = { x: 0, y: 0, w: 4, h: 4 };
  // a photo dragged far out of the frame and scaled below the cover size
  const { mierka, posun } = fotkaVRamiku(r, { x: 3, y: -7, w: 2, h: 1 }, [200, 100], MAX);
  assert.equal(mierka, 100);
  assert.ok(posun.every(Number.isInteger));
  assert.ok(pokryva(obdlznikFotky(r, { mierka, posun, rozmer: [200, 100] }), r));
});

test('stará spec s maskou, prekrytím a desatinným zoomom sa vykreslí ako rámik', () => {
  for (const rezim of ['maska', 'prekrytie']) {
    // old shape: the photo frame-sized and zoomed 1.5× from its top-left
    // corner, moved a tenth of the frame right
    const stara = specSFotkou({ rezim, posun: [0.1, 0], zoom: 1.5 });
    for (const normalizuj of [normalizujSpec, normalizujSpecStub]) {
      const z = normalizuj(structuredClone(stara)).zony[0];
      assert.equal('rezim' in z, false);
      assert.equal('zoom' in z, false);
      // centre offset (0.1 + 0.25) of the frame = 35 %, clamped to the 25 %
      // a 150 % photo of the frame's proportions has to each side; the
      // top-left zoom alone shifted the centre 25 % down
      assert.equal(z.mierka, 150);
      assert.deepEqual(z.posun, [25, 25]);
    }
    const { svg } = komponuj(stara);
    const img = atributy(svg, 'image');
    assert.deepEqual([img.x, img.y, img.width, img.height], ['2', '2', '9', '6']);
    assert.match(img['clip-path'], /^url\(#ramik-\d+\)$/);
    assert.equal(svg, komponuj(specSFotkou({ mierka: 150, posun: [25, 25] })).svg);
  }
  // an old zoom below 1 becomes the smallest photo that covers the frame,
  // the decimals are rounded
  const z = normalizujSpec(specSFotkou({ rezim: 'maska', posun: [0.123, -0.004], zoom: 0.8 })).zony[0];
  assert.equal(z.mierka, 100);
  assert.deepEqual(z.posun, [0, 0]);
  const z2 = normalizujSpec(specSFotkou({ posun: [0.023, -0.051], zoom: 1.333 })).zony[0];
  assert.equal(z2.mierka, 133);
  assert.deepEqual(z2.posun, [16, 12]);
});

test('SVG: rámik zmenený nezávisle od fotky, orez sleduje zaoblenie', async () => {
  const { fotkaVRamiku, obdlznikFotky } = await import('../core/kompozicia/fotka.js');
  const rozmer = [1600, 900];
  const ram = { x: 2, y: 2, w: 6, h: 4 };
  const pred = normalizujSpec(specSFotkou({ rozmer, mierka: 130, posun: [5, -4], zaoblenie: 40 })).zony[0];
  const foto = obdlznikFotky(ram, pred);
  // the frame shrinks from the left and the top (in mode Fotka), the photo
  // stays where it was
  const novy = { x: 3, y: 3, w: 5, h: 3 };
  const { mierka, posun } = fotkaVRamiku(novy, foto, rozmer, MAX);
  const { svg } = komponuj(specSFotkou({ ...novy, rozmer, mierka, posun, zaoblenie: 40 }));
  const clip = /<clipPath id="(ramik-\d+)"><rect ([^>]*)\/><\/clipPath>/.exec(svg);
  // the clip is the new frame, rounded: 40 % of half the shorter side (1.5) = 0.6
  assert.match(clip[2], /^x="3" y="3" width="5" height="3" rx="0\.6"$/);
  const img = atributy(svg, 'image');
  assert.equal(img['clip-path'], `url(#${clip[1]})`);
  const x = +img.x, y = +img.y, w = +img.width, h = +img.height;
  // the photo has its own coordinates: not the frame's ...
  assert.notDeepEqual([x, y, w, h], [3, 3, 5, 3]);
  // ... but where it was before the frame changed (to the whole-% rounding)
  const tol = 0.1;
  assert.ok(Math.abs(x - foto.x) < tol && Math.abs(y - foto.y) < tol, `${x} ${y} vs ${foto.x} ${foto.y}`);
  assert.ok(Math.abs(w - foto.w) < tol && Math.abs(h - foto.h) < tol, `${w} ${h} vs ${foto.w} ${foto.h}`);
  // its proportions are the photo's own and it still covers the frame
  assert.ok(Math.abs(w / h - 16 / 9) < 1e-3);
  assert.ok(pokryva({ x, y, w, h }, novy));
  // the clip follows zaoblenie
  const ostry = /<clipPath id="ramik-\d+"><rect ([^>]*)\/>/.exec(
    komponuj(specSFotkou({ ...novy, rozmer, mierka, posun, zaoblenie: 0 })).svg);
  assert.equal(ostry[1], 'x="3" y="3" width="5" height="3"');
  const kruh = /<clipPath id="ramik-\d+"><rect ([^>]*)\/>/.exec(
    komponuj(specSFotkou({ ...novy, rozmer, mierka, posun, zaoblenie: 100 })).svg);
  assert.match(kruh[1], /rx="1\.5"$/);
});

test('JSON template nesie mierku a posun, nie fotku ani jej rozmer', async () => {
  const { bezFotiek } = await import('../ui/state/sablony.js');
  const spec = normalizujSpec(specSFotkou({ rozmer: [800, 600], mierka: 120, posun: [3, -2] }));
  const z = bezFotiek(spec).zony[0];
  assert.equal(z.zdroj, undefined);
  assert.equal(z.rozmer, undefined);
  assert.equal(z.mierka, 120);
  assert.deepEqual(z.posun, [3, -2]);
  assert.deepEqual(normalizujSpec(bezFotiek(spec)).zony[0].posun, [3, -2]);
});
