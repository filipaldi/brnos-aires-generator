// Photo zone in rámik: rounded corners (zaoblenie) and an inner border —
// validation in the core and the stub, the clip rect and the outline in SVG.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizujSpec, komponuj } from '../core/kompozicia/index.js';
import { normalizujSpec as normalizujSpecStub } from '../ui/stub.js';
import { ValidationError } from '../core/errors.js';

const FOTKA = 'data:image/png;base64,iVBORw0KGgo=';

const specSFotkou = (zona, ine = {}) => ({
  grid: { stlpce: 12, okraj: 0 },
  zony: [{ typ: 'fotka', x: 2, y: 2, w: 6, h: 4, rezim: 'ramik', zdroj: FOTKA, ...zona }],
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

test('maska a prekrytie zaoblenie ani border nekreslia', () => {
  for (const rezim of ['maska', 'prekrytie']) {
    const { svg } = komponuj(specSFotkou({ rezim, zaoblenie: 50, border: 50 }));
    assert.ok(!/<g id="fotky">[^\n]*stroke=/.test(svg), rezim);
    assert.ok(!/<g id="fotky">[^\n]*rx=/.test(svg), rezim);
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
  zony: [{ typ: 'fotka', ...KRUH, rezim: 'ramik', zdroj: FOTKA, zaoblenie: 100, ...zona }],
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
