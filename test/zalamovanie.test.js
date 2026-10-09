// Zalomenie textu v zóne: slová sa lámu na šírku zóny, explicitné \n ostáva,
// pridlhé slovo ostáva celé, medzery na konci riadku sa nemerajú, pretečenie
// výškou len varuje (text sa nikdy neskracuje). Meranie šírky je vložiteľné;
// bez neho jadro odhaduje podľa konštánt v proporcie.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { komponuj } from '../core/kompozicia/index.js';
import { zalamujText } from '../core/kompozicia/svg.js';

const PODIELY = JSON.parse(readFileSync(new URL('../proporcie.json', import.meta.url), 'utf8'))
  .kompozicia.svg.priemerneZnaky;

// deterministické meranie: každý znak (aj medzera) má šírku jednej veľkosti
const znak = (text, pismo, velkost) => text.length * velkost;

// rovnaký vzorec ako záložný odhad jadra — na porovnanie oboch ciest
const odhad = (text, pismo, velkost) => text.length * PODIELY[pismo] * velkost;

function specSZonou(zona) {
  return {
    format: { sirka: 100, vyska: 100 },
    grid: { stlpce: 20 },
    variant: '1',
    zony: [{
      typ: 'text', x: 0, y: 0, w: 11, h: 9,
      text: 'Brnos Aires Tango Marathon',
      pismo: 'Brnos Aires', velkost: 1, zarovnanie: 'vlavo', riadkovanie: 1.1,
      ...zona,
    }],
  };
}

// riadky textu z `<g id="text">` vykresleného SVG
function riadkyZoSvg(svg) {
  const skupina = svg.match(/<g id="text">([\s\S]*)<\/g>/)?.[1] ?? '';
  return [...skupina.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
}

test('zalamujText láme po slovách na šírku zóny', () => {
  const riadky = zalamujText('Brnos Aires Tango Marathon', 11,
    { pismo: 'Brnos Aires', velkost: 1, zmerajText: znak, cfg: {} });
  assert.deepEqual(riadky, ['Brnos Aires', 'Tango', 'Marathon']);
});

test('explicitné odriadkovanie zostáva, nezáleží na šírke', () => {
  const riadky = zalamujText('dlhé slovo\nkrátke\n\nďalšie', 100,
    { pismo: 'Brnos Aires', velkost: 1, zmerajText: znak, cfg: {} });
  assert.deepEqual(riadky, ['dlhé slovo', 'krátke', '', 'ďalšie']);
});

test('slovo dlhšie ako šírka ostáva celé na vlastnom riadku', () => {
  const riadky = zalamujText('ab extradlhéslovo cd', 5,
    { pismo: 'Brnos Aires', velkost: 1, zmerajText: znak, cfg: {} });
  assert.deepEqual(riadky, ['ab', 'extradlhéslovo', 'cd']);
});

test('medzery na konci riadku sa nemerajú, vnútri riadka ostanú', () => {
  assert.deepEqual(
    zalamujText('Brnos Aires   ', 11, { pismo: 'Brnos Aires', velkost: 1, zmerajText: znak, cfg: {} }),
    ['Brnos Aires']);
  assert.deepEqual(
    zalamujText('ab  cd', 10, { pismo: 'Brnos Aires', velkost: 1, zmerajText: znak, cfg: {} }),
    ['ab  cd']);
});

test('dlhý riadok v úzkej zóne sa zalomí do viacerých <text> prvkov', () => {
  const { svg, varovania } = komponuj(specSZonou({}), { zmerajText: znak });
  const riadky = riadkyZoSvg(svg);
  assert.deepEqual(riadky, ['Brnos Aires', 'Tango', 'Marathon']);
  for (const riadok of riadky) {
    assert.ok(znak(riadok, 'Brnos Aires', 1) <= 11, `riadok „${riadok}“ presahuje zónu`);
  }
  // výška stačí: 0,8 + 2 · 1,1 = 3 ≤ 9, žiadne varovanie
  assert.ok(!varovania.some((v) => v.includes('nezmestí')), JSON.stringify(varovania));
});

test('text nezmestí sa na výšku → varovanie, riadky ostanú celé', () => {
  const { svg, varovania } = komponuj(specSZonou({ h: 2 }), { zmerajText: znak });
  assert.ok(varovania.includes('Text v zóne 1 sa nezmestí, zmenši veľkosť.'), JSON.stringify(varovania));
  assert.equal(riadkyZoSvg(svg).length, 3, 'text nesmie byť orezaný');
});

test('varovanie čísluje zóny podľa poradia v celom specu', () => {
  const spec = specSZonou({ y: 3, h: 2 });
  spec.zony.unshift({ typ: 'fotka', x: 0, y: 0, w: 2, h: 2, zdroj: null });
  const { varovania } = komponuj(spec, { zmerajText: znak });
  assert.ok(varovania.includes('Text v zóne 2 sa nezmestí, zmenši veľkosť.'), JSON.stringify(varovania));
});

test('záložný odhad bez zmerajText zalomí rovnako ako vložený rovnaký vzorec', () => {
  const bez = riadkyZoSvg(komponuj(specSZonou({ w: 5 })).svg);
  const sVlozenym = riadkyZoSvg(komponuj(JSON.parse(JSON.stringify(specSZonou({ w: 5 }))), { zmerajText: odhad }).svg);
  assert.deepEqual(bez, sVlozenym);
  assert.ok(bez.length > 1, 'dlhý text sa nezalomil');
});

test('záložný odhad pozná obe písma', () => {
  const text = 'sobota 25. októbra 2026, 20:00 v Brne';
  for (const pismo of ['Brnos Aires', 'Nunito']) {
    const riadky = zalamujText(text, 10, { pismo, velkost: 1, cfg: {} });
    assert.ok(riadky.length > 1, `${pismo}: dlhý text sa nezalomil`);
    for (const riadok of riadky) {
      assert.ok(odhad(riadok, pismo, 1) <= 10, `${pismo}: riadok „${riadok}“ presahuje zónu`);
    }
  }
});

test('rovnaký zmerajText dvakrát dáva bajtovo rovnaké SVG', () => {
  const spec = specSZonou({});
  assert.equal(komponuj(spec, { zmerajText: znak }).svg,
    komponuj(JSON.parse(JSON.stringify(spec)), { zmerajText: znak }).svg);
});

test('zmerajText musí byť funkcia', () => {
  assert.throws(() => komponuj(specSZonou({}), { zmerajText: 'široké' }), /zmerajText/);
});
