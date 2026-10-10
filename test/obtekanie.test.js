// Obtekanie textu po písmenách: pri textovej zóne s textom vzor obteká
// tesné obdĺžniky glyfov (vložené zmerajGlyfy), bez neho obdĺžniky riadkov
// (záloha CLI/testov). Okraj je vzdialenosť od písmen, nie od rámika;
// záporný okraj púšťa vzor do písmen. Zóna bez textu ostáva rámik.
// Pole obtekanie prepína medzi 'text' (predvolené) a 'ram' — rámik celej
// zóny, správanie ako pri zóne bez textu; okraj platí v oboch režimoch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { komponuj, normalizujSpec } from '../core/kompozicia/index.js';

const SVG_CFG = JSON.parse(readFileSync(new URL('../proporcie.json', import.meta.url), 'utf8'))
  .kompozicia.svg;

// rect helpers — zone rects, line boxes and placed bboxes share {x, y, w, h};
// touching edges are fine, 1e-9 absorbs floating-point noise
const E = 1e-9;
const prekryv = (a, b) => a.x < b.x + b.w - E && a.x + a.w > b.x + E && a.y < b.y + b.h - E && a.y + a.h > b.y + E;
const vzdialenost = (a, b) => Math.max(
  b.x - (a.x + a.w), a.x - (b.x + b.w),
  b.y - (a.y + a.h), a.y - (b.y + b.h),
);
const vnutri = (a, b) => a.x >= b.x - E && a.y >= b.y - E
  && a.x + a.w <= b.x + b.w + E && a.y + a.h <= b.y + b.h + E;

// deterministické meranie: každý znak (aj medzera) má šírku jednej veľkosti
// písma; písmeno zaberá prostredných 60 % svojho poľa, 70 % nad linkou a
// 20 % pod ňou (rovnako ako skutočné písmo približne)
const znak = (text, pismo, velkost) => text.length * velkost;
const glyfyZnaku = (text, pismo, velkost) => {
  const out = [];
  [...text].forEach((ch, i) => {
    if (ch !== ' ') {
      out.push({
        x: i * velkost + 0.2 * velkost,
        sirka: 0.6 * velkost,
        hore: 0.7 * velkost,
        dole: 0.2 * velkost,
      });
    }
  });
  return out;
};

// Zóna 16 × 12 na plátne 20 × 20, písmo 3 dieliky (riadok 3, 100 %),
// zarovnané vľavo: pero riadku na x = 1, prvá linka y = 1 + 3 · 0,8 = 3,4,
// písmeno „AB CD“ i „E“ zaberá [i + 0,6, i + 2,4] dielika svojho riadku.
const ZONA = { x: 1, y: 1, w: 16, h: 12 };
const GLYFY = [
  { x: 1.6, y: 1.3, w: 1.8, h: 2.7 }, // A (riadok 1)
  { x: 4.6, y: 1.3, w: 1.8, h: 2.7 }, // B
  { x: 10.6, y: 1.3, w: 1.8, h: 2.7 }, // C — medzi B a C je 4,2 dielika medzera
  { x: 13.6, y: 1.3, w: 1.8, h: 2.7 }, // D
  { x: 1.6, y: 4.3, w: 1.8, h: 2.7 }, // E (riadok 2, krátky)
];
// záloha bez zmerajGlyfy: obdĺžniky celých riadkov z konštánt proporcie.json
const RIADKY = [
  { x: 1, y: 3.4 - 3 * SVG_CFG.riadokHore, w: 15, h: 3 * (SVG_CFG.riadokHore + SVG_CFG.riadokDole) },
  { x: 1, y: 6.4 - 3 * SVG_CFG.riadokHore, w: 3, h: 3 * (SVG_CFG.riadokHore + SVG_CFG.riadokDole) },
];

function spec(zona, kompozicia) {
  return {
    format: { sirka: 100, vyska: 100 },
    grid: { stlpce: 20 },
    variant: 'obtekanie',
    ...(kompozicia ? { kompozicia } : {}),
    zony: [{
      typ: 'text', ...ZONA, pismo: 'Brnos Aires',
      riadok: 3, velkost: 100, zarovnanie: 'vlavo',
      text: 'AB CD\nE',
      ...zona,
    }],
  };
}

test('so zmerajGlyfy žiadny tvar nezasiahne do písmen (okraj 0)', () => {
  const { tvary } = komponuj(spec({}), { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
  assert.ok(tvary.length > 0, 'žiadny tvar nebol umiestnený');
  for (const t of tvary) {
    for (const g of GLYFY) {
      assert.ok(!prekryv(t.bbox, g), `tvar ${t.typ} ${JSON.stringify(t.bbox)} prekrýva písmeno ${JSON.stringify(g)}`);
    }
  }
});

test('okraj je vzdialenosť od písmen, nie od rámika zóny', () => {
  const { tvary } = komponuj(spec({ okraj: 2 }), { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
  for (const t of tvary) {
    for (const g of GLYFY) {
      assert.ok(vzdialenost(t.bbox, g) >= 2 - 1e-6,
        `tvar ${t.typ} je bližšie ako 2 dieliky k písmenu ${JSON.stringify(g)}`);
    }
  }
  // …a do rámika zóny vzor vchádza: vzdialenosť od rámika môže byť nulová
  assert.ok(tvary.some((t) => vnutri(t.bbox, ZONA) || prekryv(t.bbox, ZONA)),
    'žiadny tvar nie je vnútri rámika zóny');
});

test('vzor vchádza medzi slová aj pod krátky riadok vnútri rámika', () => {
  const { tvary } = komponuj(spec({}), { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
  const medziSlovami = tvary.filter((t) => t.bbox.x >= 6.4 - E && t.bbox.x + t.bbox.w <= 10.6 + E);
  assert.ok(medziSlovami.length > 0, 'žiadny tvar nie je medzi slovami (medzera 6,4–10,6)');
  // pod krátkym riadkom „E“: vnútri zóny a pod spodným okrajom písmen (y > 7)
  const podRiadkom = tvary.filter((t) => vnutri(t.bbox, ZONA) && t.bbox.y >= 7 - E);
  assert.ok(podRiadkom.length > 0, 'žiadny tvar nie je pod krátkym riadkom');
});

test('záporný okraj púšťa vzor do písmen, ale nie hlbšie ako |okraj|', () => {
  // písmo 4 dieliky na celom plátne: písmeno 2,4 dielika široké, po zmenšení
  // o 1 z každej strany ostáva jadro 0,4 × 1,6
  const cele = { ...spec({ x: 0, y: 0, w: 20, h: 20, riadok: 4, text: 'AB CD' }) };
  const { tvary } = komponuj(cele, { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
  const pismena = [
    { x: 0.8, y: 0.4, w: 2.4, h: 3.6 }, { x: 4.8, y: 0.4, w: 2.4, h: 3.6 },
    { x: 8.8, y: 0.4, w: 2.4, h: 3.6 }, { x: 12.8, y: 0.4, w: 2.4, h: 3.6 },
  ];
  const jadra = pismena.map((p) => ({ x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 2 }));
  assert.ok(tvary.some((t) => pismena.some((p) => prekryv(t.bbox, p))),
    'žiadny tvar nezasahuje do písmen ani o dielik');
  for (const t of tvary) {
    for (const j of jadra) {
      assert.ok(!prekryv(t.bbox, j), `tvar ${t.typ} ${JSON.stringify(t.bbox)} zasahuje hlbšie ako 1 dielik`);
    }
  }
});

test('bez zmerajGlyfy vzor obteká obdĺžniky riadkov (záložná cesta)', () => {
  const { tvary } = komponuj(spec({}), { zmerajText: znak });
  assert.ok(tvary.length > 0);
  for (const t of tvary) {
    for (const r of RIADKY) {
      assert.ok(!prekryv(t.bbox, r), `tvar ${t.typ} ${JSON.stringify(t.bbox)} prekrýva riadok ${JSON.stringify(r)}`);
    }
  }
  // medzi slovami (6,4–10,6) riadok 1 celý blokuje, ale pod krátkym riadkom
  // „E“ vzor do rámika vchádza
  const podRiadkom = tvary.filter((t) => vnutri(t.bbox, ZONA) && t.bbox.y >= 7 - E);
  assert.ok(podRiadkom.length > 0, 'žiadny tvar nie je pod krátkym riadkom vnútri zóny');
});

test('textová zóna bez textu ostáva rámik', () => {
  for (const text of ['', '   ']) {
    const { tvary } = komponuj(spec({ text }), { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
    assert.ok(tvary.length > 0);
    for (const t of tvary) {
      assert.ok(!prekryv(t.bbox, ZONA), `text „${text}“: tvar ${t.typ} prekrýva rámik zóny`);
    }
  }
});

test('obtekanie „ram“: žiadny tvar vnútri rámika, ani pri krátkom texte', () => {
  const { tvary } = komponuj(spec({ obtekanie: 'ram' }), { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
  assert.ok(tvary.length > 0, 'žiadny tvar nebol umiestnený');
  for (const t of tvary) {
    assert.ok(!prekryv(t.bbox, ZONA), `tvar ${t.typ} ${JSON.stringify(t.bbox)} vchádza do rámika zóny`);
  }
});

test('obtekanie „ram“: okraj platí od rámika zóny', () => {
  const { tvary } = komponuj(spec({ obtekanie: 'ram', okraj: 2 }), { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
  for (const t of tvary) {
    assert.ok(vzdialenost(t.bbox, ZONA) >= 2 - 1e-6,
      `tvar ${t.typ} je bližšie ako 2 dieliky k rámiku zóny`);
  }
});

test('obtekanie „text“: vzor vchádza do rámika pod krátkym riadkom', () => {
  const { tvary } = komponuj(spec({ obtekanie: 'text' }), { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
  const podRiadkom = tvary.filter((t) => vnutri(t.bbox, ZONA) && t.bbox.y >= 7 - E);
  assert.ok(podRiadkom.length > 0, 'žiadny tvar nie je pod krátkym riadkom vnútri zóny');
});

test('chýbajúce obtekanie (starý spec) znamená „text“', () => {
  assert.equal(normalizujSpec(spec({})).zony[0].obtekanie, 'text');
  assert.equal(normalizujSpec(spec({ obtekanie: 'ram' })).zony[0].obtekanie, 'ram');
  // aj správanie: bez poľa vzor vchádza do rámika medzi písmená
  const { tvary } = komponuj(spec({}), { zmerajText: znak, zmerajGlyfy: glyfyZnaku });
  assert.ok(tvary.some((t) => vnutri(t.bbox, ZONA) || prekryv(t.bbox, ZONA)),
    'žiadny tvar nie je vnútri rámika zóny');
});

test('neznáma hodnota obtekania je chyba', () => {
  assert.throws(() => komponuj(spec({ obtekanie: 'kruh' })), /obtekanie/);
});

test('zmerajGlyfy dostane features a velkost písma zóny', () => {
  const videne = [];
  const zmeraj = (text, pismo, velkost, features) => {
    videne.push({ text, velkost, features });
    return glyfyZnaku(text, pismo, velkost, features);
  };
  komponuj(spec({ features: { liga: false, dlig: true } }), { zmerajText: znak, zmerajGlyfy: zmeraj });
  assert.ok(videne.length > 0, 'meranie glyfov sa nezavolalo');
  assert.deepEqual(videne.map((v) => v.text), ['AB CD', 'E']);
  for (const v of videne) {
    assert.equal(v.velkost, 3, 'veľkosť písma má byť 3 dieliky');
    assert.deepEqual(v.features, { liga: false, dlig: true, ss01: false, ss03: false, case: false });
  }
});

test('rovnaké zmerajGlyfy dvakrát dáva bajtovo rovnaké SVG', () => {
  const s = spec({});
  assert.equal(
    komponuj(s, { zmerajText: znak, zmerajGlyfy: glyfyZnaku }).svg,
    komponuj(JSON.parse(JSON.stringify(s)), { zmerajText: znak, zmerajGlyfy: glyfyZnaku }).svg);
});

test('zmerajGlyfy musí byť funkcia', () => {
  assert.throws(() => komponuj(spec({}), { zmerajGlyfy: 'široké' }), /zmerajGlyfy/);
});
