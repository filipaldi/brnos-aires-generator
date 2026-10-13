// Šablóny: every template in presets/sablony/ is listed once in index.json,
// exists, carries no photo and its spec passes the core's validation and
// composes; a bad template (fixture in test/sablony/) is caught; the JSON
// template the Export panel copies drops photo sources and loads back as the
// same spec.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { komponuj, normalizujSpec } from '../core/kompozicia/index.js';
import {
  NAZOV_NOVEJ_SABLONY, bezFotiek, sablonaJson, suboryIndexu, citajSablonu, zhodujeSaSoSablonou,
} from '../ui/state/sablony.js';

const SABLONY = new URL('../presets/sablony/', import.meta.url);
const FIXTURY = new URL('./sablony/', import.meta.url);
const MEDIA = JSON.parse(readFileSync(new URL('../presets/media.json', import.meta.url), 'utf8'));

const FOTKA = 'data:image/png;base64,iVBORw0KGgo=';

// What is wrong with one template file (its text), as messages; [] when
// nothing is. The same check guards the repository's templates and is shown
// to catch a bad one below.
function chybySablony(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return [`nie je JSON: ${err.message}`];
  }
  const chyby = [];
  if (typeof data?.nazov !== 'string' || !data.nazov.trim()) chyby.push('chýba názov');
  if (data && typeof data === 'object' && 'popis' in data && typeof data.popis !== 'string') {
    chyby.push('popis nie je text');
  }
  if (data?.medium !== null) {
    const m = data?.medium;
    const skupina = MEDIA.skupiny.find((s) => s.nazov === m?.skupina);
    if (!skupina?.media.some((x) => x.nazov === m?.nazov)) chyby.push(`neznáme médium ${JSON.stringify(m)}`);
  }
  const zony = Array.isArray(data?.spec?.zony) ? data.spec.zony : [];
  zony.forEach((z, i) => {
    if (z && typeof z === 'object' && 'zdroj' in z) chyby.push(`zóna ${i + 1} nesie fotku (zdroj)`);
  });
  if (!citajSablonu(data)) {
    chyby.push('chýba spec');
    return chyby;
  }
  try {
    komponuj(normalizujSpec(structuredClone(data.spec)));
  } catch (err) {
    chyby.push(`spec neprešiel validáciou: ${err.message}`);
  }
  return chyby;
}

test('index.json je zoznam súborov šablón, každý raz', () => {
  const index = JSON.parse(readFileSync(new URL('index.json', SABLONY), 'utf8'));
  assert.ok(Array.isArray(index.sablony), 'index.json nemá pole sablony');
  assert.deepEqual(Object.keys(index), ['sablony']);
  for (const s of index.sablony) {
    assert.match(s, /^[a-z0-9-]+\.json$/, `zlý názov súboru ${JSON.stringify(s)}`);
  }
  assert.equal(new Set(index.sablony).size, index.sablony.length, 'súbor je v zozname dvakrát');
  assert.deepEqual(suboryIndexu(index), index.sablony);
});

test('každá šablóna v repozitári existuje, je bez fotky a jej spec prejde jadrom', () => {
  const { sablony } = JSON.parse(readFileSync(new URL('index.json', SABLONY), 'utf8'));
  for (const subor of sablony) {
    const url = new URL(subor, SABLONY);
    assert.ok(existsSync(url), `${subor} chýba v presets/sablony/`);
    assert.deepEqual(chybySablony(readFileSync(url, 'utf8')), [], subor);
  }
});

test('kontrola šablón zachytí zlú šablónu a pustí dobrú', () => {
  assert.deepEqual(chybySablony(readFileSync(new URL('dobra.json', FIXTURY), 'utf8')), []);
  const chyby = chybySablony(readFileSync(new URL('zla.json', FIXTURY), 'utf8'));
  assert.ok(chyby.some((c) => /zóna 2 nesie fotku/.test(c)), chyby.join('; '));
  assert.ok(chyby.some((c) => /spec neprešiel validáciou: .*okraja gridu/.test(c)), chyby.join('; '));
  assert.ok(chybySablony('{').length > 0);
  assert.deepEqual(chybySablony('{"nazov": "A", "medium": null}'), ['chýba spec']);
  assert.ok(chybySablony('{"nazov": "", "medium": null, "spec": {}}').includes('chýba názov'));
  assert.ok(chybySablony('{"nazov": "A", "medium": {"skupina": "Web", "nazov": "A0"}, "spec": {}}')
    .some((c) => /neznáme médium/.test(c)));
});

test('JSON template zahodí zdroj fotky a načíta sa späť ako ten istý spec', () => {
  const dobra = JSON.parse(readFileSync(new URL('dobra.json', FIXTURY), 'utf8'));
  const spec = normalizujSpec(structuredClone(dobra.spec));
  spec.zony[1].zdroj = FOTKA;
  spec.zony[1].rozmer = [800, 600];

  const text = sablonaJson(spec, dobra.medium);
  assert.equal(text.includes(FOTKA), false);
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`, 'odsadené dvoma medzerami');
  assert.deepEqual(chybySablony(text), []);
  // the current spec keeps its photo
  assert.equal(spec.zony[1].zdroj, FOTKA);

  const data = JSON.parse(text);
  assert.deepEqual(Object.keys(data), ['nazov', 'popis', 'medium', 'spec']);
  assert.equal(data.nazov, NAZOV_NOVEJ_SABLONY);
  assert.equal(data.popis, '');
  assert.deepEqual(data.medium, dobra.medium);
  assert.equal('zdroj' in data.spec.zony[1], false);
  // mierka, posun and the place of the photo zone stay, the photo's pixel
  // size goes with the photo
  assert.equal('rozmer' in data.spec.zony[1], false);
  const { zdroj, rozmer, ...bezZdroja } = spec.zony[1];
  assert.deepEqual(data.spec.zony[1], bezZdroja);
  assert.equal(data.spec.zony[1].mierka, 150);
  assert.deepEqual(data.spec.zony[1].posun, [25, -25]);

  // loaded through the same validation path the page uses: same spec, no photo
  const nacitany = normalizujSpec(structuredClone(citajSablonu(data).spec));
  assert.equal(nacitany.zony[1].zdroj ?? null, null);
  assert.deepEqual(bezFotiek(nacitany), bezFotiek(spec));
  // the dobra fixture is itself such a file: renamed, it round-trips exactly
  assert.equal(sablonaJson(normalizujSpec(structuredClone(dobra.spec)), dobra.medium),
    readFileSync(new URL('dobra.json', FIXTURY), 'utf8').replace('"Milonga IG"', `"${NAZOV_NOVEJ_SABLONY}"`));
});

test('JSON template bez média nesie medium null', () => {
  assert.equal(JSON.parse(sablonaJson({ zony: [] }, null)).medium, null);
  assert.equal(JSON.parse(sablonaJson({ zony: [] }, { skupina: 'Web' })).medium, null);
});

test('popis šablóny je text alebo chýba', () => {
  const dobra = JSON.parse(readFileSync(new URL('dobra.json', FIXTURY), 'utf8'));
  const { popis, ...bezPopisu } = dobra;
  assert.deepEqual(chybySablony(JSON.stringify(bezPopisu)), []);
  assert.deepEqual(chybySablony(JSON.stringify({ ...dobra, popis: 'Plagát na milongu.' })), []);
  for (const zly of [null, 7, true, ['a'], { text: 'a' }]) {
    assert.ok(chybySablony(JSON.stringify({ ...dobra, popis: zly })).includes('popis nie je text'),
      JSON.stringify(zly));
  }
  // citajSablonu keeps a string popis (trimmed) and leaves anything else out
  assert.equal(citajSablonu({ ...dobra, popis: ' Plagát. ' }).popis, 'Plagát.');
  assert.equal(citajSablonu({ ...dobra, popis: '' }).popis, '');
  assert.equal('popis' in citajSablonu(bezPopisu), false);
  assert.equal('popis' in citajSablonu({ ...dobra, popis: 7 }), false);
});

test('index a súbor šablóny: nečitateľné položky sa vynechajú', () => {
  assert.deepEqual(suboryIndexu(null), []);
  assert.deepEqual(suboryIndexu({ sablony: 'a.json' }), []);
  assert.deepEqual(suboryIndexu({ sablony: ['a.json', 'a.json', 7, '../b.json', 'c.txt', 'index.json', 'd.json'] }),
    ['a.json', 'd.json']);
  for (const zle of [null, 42, [], {}, { nazov: 'A' }, { nazov: '  ', spec: {} }, { nazov: 'A', spec: [1] }]) {
    assert.equal(citajSablonu(zle), null, JSON.stringify(zle));
  }
  const s = citajSablonu({ nazov: ' A ', medium: { skupina: 'Web', nazov: 7 }, spec: { zony: [{ typ: 'fotka', zdroj: FOTKA }] } });
  assert.equal(s.nazov, 'A');
  assert.equal(s.medium, null);
  assert.equal('zdroj' in s.spec.zony[0], false);
});

test('zhoda so šablónou nevníma zdroj fotky ani poradie polí', () => {
  const dobra = JSON.parse(readFileSync(new URL('dobra.json', FIXTURY), 'utf8'));
  const spec = normalizujSpec(structuredClone(dobra.spec));
  const sablona = structuredClone(spec);
  spec.zony[1].zdroj = FOTKA;
  assert.equal(zhodujeSaSoSablonou(spec, sablona), true);
  const preusporiadany = Object.fromEntries(Object.entries(spec).reverse());
  assert.equal(zhodujeSaSoSablonou(preusporiadany, sablona), true);
  spec.grid.okraj = 2;
  assert.equal(zhodujeSaSoSablonou(spec, sablona), false);
});
