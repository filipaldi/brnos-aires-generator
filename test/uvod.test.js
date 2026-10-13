// Úvod: the start screen's tiles — the clean canvas first, Pokračovať only
// with saved work, then the templates in their order, each with its name,
// size and (only when it has one) popis.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizujSpec } from '../core/kompozicia/index.js';
import { citajSablonu, suboryIndexu } from '../ui/state/sablony.js';
import {
  dlazdiceUvodu, rozmerFormatu, NAZOV_CISTEHO, NAZOV_POKRACOVAT,
} from '../ui/state/uvod.js';

const SABLONY = new URL('../presets/sablony/', import.meta.url);

test('rozmer formátu: šírka × výška jednotka, inak prázdny', () => {
  assert.equal(rozmerFormatu({ sirka: 1080, vyska: 1080, jednotka: 'px' }), '1080 × 1080 px');
  assert.equal(rozmerFormatu({ sirka: 841, vyska: 1189, jednotka: 'mm', dpi: 300 }), '841 × 1189 mm');
  for (const zly of [null, {}, { sirka: 1, vyska: 2 }, { sirka: '1', vyska: 2, jednotka: 'px' }, [1, 2]]) {
    assert.equal(rozmerFormatu(zly), '', JSON.stringify(zly));
  }
});

test('bez uloženej práce: čistý canvas a šablóny v poradí indexu', () => {
  const cisty = normalizujSpec({});
  const index = JSON.parse(readFileSync(new URL('index.json', SABLONY), 'utf8'));
  const sablony = suboryIndexu(index).map((subor) => ({
    subor, ...citajSablonu(JSON.parse(readFileSync(new URL(subor, SABLONY), 'utf8'))),
  }));
  const dlazdice = dlazdiceUvodu({ cisty, ulozeny: null, sablony });
  assert.deepEqual(dlazdice.map((d) => d.druh), ['cisty', ...sablony.map(() => 'sablona')]);
  assert.equal(dlazdice[0].nazov, NAZOV_CISTEHO);
  assert.equal(dlazdice[0].rozmer, rozmerFormatu(cisty.format));
  assert.deepEqual(dlazdice.slice(1).map((d) => d.nazov), sablony.map((s) => s.nazov));
  assert.deepEqual(dlazdice.slice(1).map((d) => d.sablona), sablony);
  for (const d of dlazdice) assert.match(d.rozmer, /^\d+ × \d+ (px|mm)$/, d.nazov);
});

test('s uloženou prácou je Pokračovať druhá, s rozmerom uloženého specu', () => {
  const cisty = normalizujSpec({});
  const ulozeny = normalizujSpec({ format: { sirka: 210, vyska: 297, jednotka: 'mm', dpi: 300, spadavka: 3 } });
  const dlazdice = dlazdiceUvodu({ cisty, ulozeny, sablony: [{ nazov: 'A', spec: {} }] });
  assert.deepEqual(dlazdice.map((d) => d.druh), ['cisty', 'pokracovat', 'sablona']);
  assert.equal(dlazdice[1].nazov, NAZOV_POKRACOVAT);
  assert.equal(dlazdice[1].rozmer, '210 × 297 mm');
});

test('dlaždica šablóny: popis len keď ho má, rozmer doplnený z čistého specu', () => {
  const cisty = { format: { sirka: 1080, vyska: 1350, jednotka: 'px' } };
  const [, s1, s2, s3] = dlazdiceUvodu({
    cisty,
    sablony: [
      { nazov: 'Bez popisu', spec: { format: { sirka: 1080, vyska: 1080, jednotka: 'px' } } },
      { nazov: 'S popisom', popis: ' Na milongu. ', spec: { format: { vyska: 600 } } },
      { nazov: 'Prázdny popis', popis: '', spec: {} },
      null,
      { spec: {} },
    ],
  });
  assert.equal(s1.popis, '');
  assert.equal(s1.rozmer, '1080 × 1080 px');
  assert.equal(s2.popis, 'Na milongu.');
  assert.equal(s2.rozmer, '1080 × 600 px');
  assert.equal(s3.popis, '');
  assert.equal(s3.rozmer, '1080 × 1350 px');
  assert.equal(dlazdiceUvodu({ cisty, sablony: [null, { spec: {} }] }).length, 1);
});
