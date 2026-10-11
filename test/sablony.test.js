// Šablóny: uloženie zahodí zdroj fotiek a nechá všetko ostatné, cesta
// uloženie → text → načítanie vráti ten istý spec bez zdroja a poškodené
// uložené dáta sa ticho ignorujú.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizujSpec } from '../core/kompozicia/index.js';
import {
  bezFotiek, vytvorSablonu, serializujSablony, parsujSablony, pridajSablonu,
  premenujSablonu, zmazSablonu, najdiSablonu, zhodujeSaSoSablonou,
} from '../ui/state/sablony.js';

const FOTKA = 'data:image/png;base64,iVBORw0KGgo=';

function plagat() {
  return normalizujSpec({
    format: { sirka: 210, vyska: 297, jednotka: 'mm', dpi: 300, spadavka: 3 },
    grid: { stlpce: 20, okraj: 1 },
    variant: '7',
    inverzia: true,
    zony: [
      { typ: 'text', x: 2, y: 2, w: 10, h: 4, text: 'MILONGA', pismo: 'Nunito', riadok: 3, velkost: 90 },
      { typ: 'fotka', x: 2, y: 8, w: 8, h: 6, okraj: 2, zdroj: FOTKA, rezim: 'maska', posun: [0.25, -0.5], zoom: 1.5 },
    ],
  });
}

const MEDIUM = { skupina: 'Tlač A', nazov: 'A4' };

test('uloženie zahodí zdroj fotky a nechá režim, posun, zoom a polohu', () => {
  const spec = plagat();
  const s = vytvorSablonu('  Plagát   test ', spec, MEDIUM);
  assert.equal(s.nazov, 'Plagát test');
  assert.deepEqual(s.medium, MEDIUM);
  const f = s.spec.zony[1];
  assert.equal('zdroj' in f, false);
  const { zdroj, ...bezZdroja } = spec.zony[1];
  assert.equal(zdroj, FOTKA);
  assert.deepEqual(f, bezZdroja);
  // everything else is untouched, and the current spec keeps its photo
  assert.deepEqual(s.spec.zony[0], spec.zony[0]);
  for (const k of ['format', 'grid', 'kresba', 'kompozicia', 'variant', 'inverzia']) {
    assert.deepEqual(s.spec[k], spec[k], k);
  }
  assert.equal(spec.zony[1].zdroj, FOTKA);
});

test('uloženie → text → načítanie vráti ten istý spec bez zdroja', () => {
  const spec = plagat();
  const text = serializujSablony([vytvorSablonu('Plagát test', spec, MEDIUM)]);
  assert.equal(text.includes(FOTKA), false);
  const [nacitana] = parsujSablony(text);
  assert.equal(nacitana.nazov, 'Plagát test');
  assert.deepEqual(nacitana.medium, MEDIUM);
  // loaded through the same validation path as a saved spec
  const nacitany = normalizujSpec(structuredClone(nacitana.spec));
  // the core fills an absent source with its default (null): no photo
  assert.equal(nacitany.zony[1].typ, 'fotka');
  assert.equal(nacitany.zony[1].zdroj ?? null, null);
  assert.deepEqual(bezFotiek(nacitany), bezFotiek(spec));
});

test('zhoda so šablónou nevníma zdroj fotky ani poradie polí', () => {
  const spec = plagat();
  const s = vytvorSablonu('A', spec, null);
  assert.equal(zhodujeSaSoSablonou(spec, s.spec), true);
  const preusporiadany = Object.fromEntries(Object.entries(spec).reverse());
  assert.equal(zhodujeSaSoSablonou(preusporiadany, s.spec), true);
  spec.grid.okraj = 2;
  assert.equal(zhodujeSaSoSablonou(spec, s.spec), false);
});

test('poškodené uložené dáta sa ignorujú bez výnimky', () => {
  for (const zle of [null, undefined, '', '{', 'null', '42', '"text"', '{"nazov":"A"}', '[1, "a", null]']) {
    assert.deepEqual(parsujSablony(zle), [], String(zle));
  }
  const spec = { format: {}, zony: [{ typ: 'fotka', zdroj: FOTKA }] };
  const zmes = JSON.stringify([
    { nazov: 'Dobrá', spec, medium: { skupina: 'Web', nazov: 7 } },
    { nazov: '', spec },
    { nazov: '   ', spec },
    { nazov: 'Bez specu' },
    { nazov: 'Zlý spec', spec: [1, 2] },
    { nazov: 'Dobrá', spec: { inverzia: true } },
    { spec },
  ]);
  const vysledok = parsujSablony(zmes);
  assert.equal(vysledok.length, 1);
  assert.equal(vysledok[0].nazov, 'Dobrá');
  assert.equal(vysledok[0].medium, null);
  assert.equal('zdroj' in vysledok[0].spec.zony[0], false);
});

test('pridanie, prepísanie, premenovanie a zmazanie', () => {
  const a = vytvorSablonu('A', { variant: '1' }, null);
  const b = vytvorSablonu('B', { variant: '2' }, null);
  let zoznam = pridajSablonu(pridajSablonu([], a), b);
  assert.deepEqual(zoznam.map((s) => s.nazov), ['A', 'B']);
  zoznam = pridajSablonu(zoznam, vytvorSablonu('A', { variant: '3' }, null));
  assert.deepEqual(zoznam.map((s) => s.spec.variant), ['3', '2']);
  // a taken or empty name leaves the list as it was
  assert.equal(premenujSablonu(zoznam, 'A', 'B'), zoznam);
  assert.equal(premenujSablonu(zoznam, 'A', '  '), zoznam);
  zoznam = premenujSablonu(zoznam, 'A', ' C ');
  assert.deepEqual(zoznam.map((s) => s.nazov), ['C', 'B']);
  assert.equal(najdiSablonu(zoznam, 'C').spec.variant, '3');
  zoznam = zmazSablonu(zoznam, 'C');
  assert.deepEqual(zoznam.map((s) => s.nazov), ['B']);
});
