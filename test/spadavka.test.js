// Spadávka a okraj v exporte (issue #24): pri spadávke > 0 plátno narastie
// o pás pre orezové značky, 8 značiek leží mimo spadávky na čiarach orezu,
// po orezovej hrane ani po okraji sa nekreslí žiadna čiara. Pri spadávke 0
// (digitál) žiadne značky a rozmer ako doteraz. Jadro aj náhradný engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { komponuj } from '../core/kompozicia/index.js';
import { komponuj as komponujStub } from '../ui/stub.js';
import { orezoveZnacky, rozmerPlatna } from '../core/kompozicia/znacky.js';

const ZNACKY = JSON.parse(readFileSync(new URL('../proporcie.json', import.meta.url), 'utf8'))
  .kompozicia.svg.znacky;
const EPS = 1e-3;

// A1 at 29 columns: dielik 29 mm, 41 dieliky high
const A1 = { sirka: 841, vyska: 1189, jednotka: 'mm', dpi: 300, spadavka: 5 };
const STLPCE = 29;
const DIELIK = A1.sirka / STLPCE;
const plagat = { variant: 'a1', format: A1, grid: { stlpce: STLPCE, okraj: 2 }, zony: [] };

const atributy = (tag) => Object.fromEntries(
  [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
const ciary = (svg) => [...svg.matchAll(/<line [^>]*\/>/g)].map(([t]) => atributy(t));
const koren = (svg) => atributy(svg.match(/<svg [^>]*>/)[0]);

test('značky sú v proporcie.json: 5 mm, 0,25 pt, čierne na bielom páse', () => {
  assert.equal(ZNACKY.dlzka, 5);
  assert.equal(ZNACKY.hrubka, 0.25);
  assert.equal(ZNACKY.farba, '#000');
  assert.equal(ZNACKY.papier, '#fff');
});

for (const [nazov, kompon] of [['jadro', komponuj], ['náhradný engine', komponujStub]]) {
  test(`${nazov}: pri spadávke plátno zahŕňa pás pre značky`, () => {
    const { svg, sirkaPx, vyskaPx } = kompon(plagat);
    const r = koren(svg);
    // 841 + 2 × (5 + 5) mm
    assert.equal(r.width, '861mm');
    assert.equal(r.height, '1209mm');
    const [x, y, w, h] = r.viewBox.split(' ').map(Number);
    const o = (A1.spadavka + ZNACKY.dlzka) / DIELIK;
    assert.ok(Math.abs(x + o) < EPS && Math.abs(y + o) < EPS, r.viewBox);
    assert.ok(Math.abs(w - (STLPCE + 2 * o)) < EPS, r.viewBox);
    assert.ok(Math.abs(h - (A1.vyska / DIELIK + 2 * o)) < EPS, r.viewBox);
    // the raster covers the whole canvas at 300 dpi
    assert.equal(sirkaPx, Math.round(861 * 300 / 25.4));
    assert.equal(vyskaPx, Math.round(1209 * 300 / 25.4));
  });

  test(`${nazov}: 8 značiek na čiarach orezu, mimo spadávky`, () => {
    const { svg } = kompon(plagat);
    const l = ciary(svg);
    assert.equal(l.length, 8);
    const W = STLPCE;
    const H = A1.vyska / DIELIK;
    const a = A1.spadavka / DIELIK;
    const b = (A1.spadavka + ZNACKY.dlzka) / DIELIK;
    const ocakavane = [
      [-b, 0, -a, 0], [0, -b, 0, -a],
      [W + a, 0, W + b, 0], [W, -b, W, -a],
      [-b, H, -a, H], [0, H + a, 0, H + b],
      [W + a, H, W + b, H], [W, H + a, W, H + b],
    ];
    const hrubka = (0.25 * 25.4 / 72) / DIELIK;
    l.forEach((c, i) => {
      const [x1, y1, x2, y2] = ocakavane[i];
      for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) {
        assert.ok(Math.abs(Number(c[k]) - v) < EPS, `značka ${i}: ${k}=${c[k]}, má byť ${v}`);
      }
      assert.equal(c.stroke, '#000');
      assert.ok(Math.abs(Number(c['stroke-width']) - hrubka) < EPS, c['stroke-width']);
      // 5 mm long, starting spadavka away from the trim
      const dlzka = Math.hypot(Number(c.x2) - Number(c.x1), Number(c.y2) - Number(c.y1)) * DIELIK;
      assert.ok(Math.abs(dlzka - 5) < 0.05, `značka ${i}: dĺžka ${dlzka} mm`);
    });
  });

  test(`${nazov}: žiadna čiara po orezovej hrane ani po okraji`, () => {
    for (const inverzia of [false, true]) {
      const { svg } = kompon({ ...plagat, inverzia });
      assert.doesNotMatch(svg, /fill="none"/, 'obrys');
      assert.doesNotMatch(svg, /id="okraj"/);
      assert.doesNotMatch(svg, /stroke-dasharray/);
      const spadavka = svg.match(/<g id="spadavka">([\s\S]*?)<\/g>/)[1];
      assert.doesNotMatch(spadavka, /<rect/);
      // marks stay black on the white band, also on an inverted sheet
      for (const c of ciary(svg)) assert.equal(c.stroke, '#000');
      // the band is paper; the background covers trim + bleed only
      const r = [...svg.matchAll(/<rect [^>]*\/>/g)].map(([t]) => atributy(t));
      assert.equal(r[0].fill, '#fff');
      assert.equal(r[1].fill, inverzia ? '#000' : '#fff');
      const a = A1.spadavka / DIELIK;
      assert.ok(Math.abs(Number(r[1].x) + a) < EPS && Math.abs(Number(r[1].width) - (STLPCE + 2 * a)) < EPS);
    }
  });

  test(`${nazov}: pri spadávke 0 žiadne značky a rozmer ako doteraz`, () => {
    const web = { sirka: 1200, vyska: 630, jednotka: 'px', dpi: 72, spadavka: 0 };
    const { svg, sirkaPx, vyskaPx } = kompon({ variant: 'web', format: web, grid: { stlpce: 30 }, zony: [] });
    const r = koren(svg);
    // the stub writes px sizes without a unit, as it always did
    const px = nazov === 'jadro' ? 'px' : '';
    assert.equal(r.width, `1200${px}`);
    assert.equal(r.height, `630${px}`);
    assert.match(r.viewBox, /^0 0 30 15\.75$/);
    assert.equal(sirkaPx, 1200);
    assert.equal(vyskaPx, 630);
    assert.equal(ciary(svg).length, 0);
    assert.match(svg, /<g id="spadavka">\s*<\/g>/);
  });
}

test('rozmerPlatna: bez spadávky bez pásu, v px podľa dpi', () => {
  assert.deepEqual(rozmerPlatna({ sirka: 1080, vyska: 1350, jednotka: 'px', dpi: 72, spadavka: 0 }),
    { sirka: 1080, vyska: 1350, pas: 0, sirkaPx: 1080, vyskaPx: 1350 });
  // a px format with a bleed: the 5 mm band at its dpi
  const p = rozmerPlatna({ sirka: 1000, vyska: 500, jednotka: 'px', dpi: 254, spadavka: 10 });
  assert.equal(p.pas, 50);
  assert.equal(p.sirka, 1120);
});

test('orezoveZnacky: dve na roh, každá na čiare orezu', () => {
  const z = orezoveZnacky({ sirka: 100, vyska: 50, spadavka: 3, dlzka: 5 });
  assert.equal(z.length, 8);
  for (const [x1, y1, x2, y2] of z) {
    const vodorovna = y1 === y2;
    assert.ok(vodorovna || x1 === x2);
    // on a trim line, never inside the bleed
    if (vodorovna) {
      assert.ok(y1 === 0 || y1 === 50);
      assert.ok(Math.max(x1, x2) <= -3 || Math.min(x1, x2) >= 103);
    } else {
      assert.ok(x1 === 0 || x1 === 100);
      assert.ok(Math.max(y1, y2) <= -3 || Math.min(y1, y2) >= 53);
    }
  }
});
