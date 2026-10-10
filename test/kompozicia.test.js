// Composition: determinism, zone edge (okraj), shapes inside the format,
// validation errors, no NaN in the SVG.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizujSpec, komponuj } from '../core/kompozicia/index.js';
import { featuresPoZmenePisma } from '../core/kompozicia/features.js';
import { predvolenePisma } from '../core/kompozicia/pisma.js';
import { normalizujSpec as normalizujSpecStub } from '../ui/stub.js';
import { ValidationError } from '../core/errors.js';

const plagat = JSON.parse(readFileSync(new URL('../priklady/plagat-a2.json', import.meta.url), 'utf8'));
const nahlad = JSON.parse(readFileSync(new URL('../priklady/nahlad-akcie.json', import.meta.url), 'utf8'));

// rect helpers — zone rects and placed bboxes share the {x, y, w, h} shape
// touching edges are fine; 1e-9 absorbs floating-point noise
const E = 1e-9;
const prekryv = (a, b) => a.x < b.x + b.w - E && a.x + a.w > b.x + E && a.y < b.y + b.h - E && a.y + a.h > b.y + E;
const vzdialenost = (a, b) => Math.max(
  b.x - (a.x + a.w), a.x - (b.x + b.w),
  b.y - (a.y + a.h), a.y - (b.y + b.h),
);

const EPS = 1e-6;

test('rovnaký spec dvakrát dáva bajtovo rovnaké SVG', () => {
  const a = komponuj(plagat);
  const b = komponuj(JSON.parse(JSON.stringify(plagat)));
  assert.equal(a.svg, b.svg);
  assert.deepEqual(a.tvary, b.tvary);
});

test('iný variant dáva iné SVG', () => {
  const a = komponuj(plagat);
  const b = komponuj({ ...plagat, variant: 'iný' });
  assert.notEqual(a.svg, b.svg);
});

test('nahlad v px bez zón beží a má vrstvy', () => {
  const { svg, sirkaPx, vyskaPx, tvary } = komponuj(nahlad);
  assert.ok(tvary.length > 0, 'žiadny tvar nebol umiestnený');
  assert.equal(sirkaPx, 1200);
  assert.equal(vyskaPx, 630);
  for (const id of ['fotky', 'pattern', 'text', 'spadavka']) {
    assert.ok(svg.includes(`id="${id}"`), `chýba vrstva ${id}`);
  }
});

test('žiadny tvar sa nedotýka zóny s okrajom 0', () => {
  const { tvary } = komponuj(plagat);
  const zony = plagat.zony.filter((z) => z.okraj === 0)
    .map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h }));
  assert.ok(zony.length > 0);
  for (const t of tvary) {
    for (const z of zony) {
      assert.ok(!prekryv(t.bbox, z), `tvar ${t.typ} ${JSON.stringify(t.bbox)} prekrýva zónu ${JSON.stringify(z)}`);
    }
  }
});

test('okraj drží svoj počet dielikov bieleho okolo zóny', () => {
  const { tvary } = komponuj(plagat);
  const zony = plagat.zony.filter((z) => z.okraj > 0)
    .map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h, okraj: z.okraj }));
  assert.ok(zony.length > 0);
  for (const t of tvary) {
    for (const z of zony) {
      assert.ok(!prekryv(t.bbox, z), `tvar ${t.typ} prekrýva zónu s okrajom`);
      assert.ok(vzdialenost(t.bbox, z) >= z.okraj - EPS,
        `tvar ${t.typ} je bližšie ako ${z.okraj} dielik: ${vzdialenost(t.bbox, z)}`);
    }
  }
});

test('záporný okraj: tvar smie zasahovať do zóny, ale nie hlbšie ako |okraj|', () => {
  const zona = plagat.zony[2]; // fotková zóna 12 × 12
  const spec = { ...plagat, zony: plagat.zony.map((z) => (z === zona ? { ...z, okraj: -3 } : z)) };
  const { tvary } = komponuj(spec);
  const n = 3;
  const zmensena = { x: zona.x + n, y: zona.y + n, w: zona.w - 2 * n, h: zona.h - 2 * n };
  assert.ok(tvary.some((t) => prekryv(t.bbox, zona)), 'žiadny tvar nezasahuje do zóny s negatívnym okrajom');
  for (const t of tvary) {
    assert.ok(!prekryv(t.bbox, zmensena), `tvar ${t.typ} ${JSON.stringify(t.bbox)} zasahuje hlbšie ako ${n} dieliky`);
  }
});

test('zóna zmenšená zánikom sa pre vzor ignoruje', () => {
  // 6 − 2·4 ≤ 0: zmenšená zóna neexistuje, vzor ju celú vynechá
  const zanikla = { typ: 'prazdna', x: 4, y: 4, w: 6, h: 6, okraj: -4 };
  const { svg: soZaniklou } = komponuj({ ...plagat, zony: [...plagat.zony, zanikla] });
  const { svg: beznej } = komponuj(plagat);
  assert.equal(soZaniklou, beznej);
});

test('staré spravanie sa prevádza na okraj a pole mizne', () => {
  const base = { typ: 'text', x: 1, y: 1, w: 4, h: 2 };
  const zona = (extra) => normalizujSpec({ zony: [{ ...base, ...extra }] }).zony[0];
  assert.equal(zona({ spravanie: 'prazdna' }).okraj, 0);
  assert.equal(zona({ spravanie: 'okraj' }).okraj, 1); // svg.okraj z proporcie.json
  assert.equal(zona({ spravanie: 'presah' }).okraj, -1);
  for (const s of ['prazdna', 'okraj', 'presah']) {
    assert.ok(!('spravanie' in zona({ spravanie: s })), `pole spravanie (${s}) zostalo v specu`);
  }
  // obe polia zadané: platí okraj
  assert.equal(zona({ spravanie: 'presah', okraj: 5 }).okraj, 5);
  assert.throws(() => zona({ spravanie: 'hore' }), /spravanie/);
});

test('starý textový model (riadkovanie) sa prevádza na riadok a percentá', () => {
  const base = { typ: 'text', x: 1, y: 1, w: 4, h: 6 };
  const zona = (extra) => normalizujSpec({ zony: [{ ...base, ...extra }] }).zony[0];
  // velkost 3 · riadkovanie 1,1 → riadok 3, 3 / 3 = 100 %
  const z = zona({ velkost: 3, riadkovanie: 1.1 });
  assert.equal(z.riadok, 3);
  assert.equal(z.velkost, 100);
  assert.ok(!('riadkovanie' in z), 'pole riadkovanie zostalo v specu');
  // velkost bez riadku je tiež starý spec: 0,9 · 1,1 → riadok 1, 90 %
  const z2 = zona({ velkost: 0.9 });
  assert.equal(z2.riadok, 1);
  assert.equal(z2.velkost, 90);
  // nový model sa nemení
  const z3 = zona({ riadok: 5, velkost: 150 });
  assert.equal(z3.riadok, 5);
  assert.equal(z3.velkost, 150);
  // celkom nová zóna dostáva dnešné predvolené hodnoty
  const z4 = zona({});
  assert.equal(z4.riadok, 3);
  assert.equal(z4.velkost, 80);
});

test('riadok a percentá veľkosti sa overujú na celé čísla v rozsahoch', () => {
  const base = { typ: 'text', x: 1, y: 1, w: 4, h: 6 };
  const zona = (extra) => normalizujSpec({ zony: [{ ...base, ...extra }] }).zony[0];
  assert.equal(zona({ riadok: 1, velkost: 10 }).riadok, 1);
  assert.equal(zona({ riadok: 20, velkost: 200 }).velkost, 200);
  // no upper bound on the row: a row taller than the zone only warns
  assert.equal(zona({ riadok: 500, velkost: 80 }).riadok, 500);
  const zle = [
    { riadok: 0 }, { riadok: 1.5 },
    { riadok: 3, velkost: 9 }, { riadok: 3, velkost: 201 }, { riadok: 3, velkost: 80.5 },
  ];
  for (const zly of zle) {
    assert.throws(() => zona(zly), (e) => {
      assert.ok(e instanceof ValidationError);
      assert.match(e.message, /riadok|velkost/);
      return true;
    }, JSON.stringify(zly));
  }
});

test('features: chýbajúce pole dostane predvolené — liga (a calt v Nunito), ss01 vypnuté', () => {
  const base = { typ: 'text', x: 1, y: 1, w: 4, h: 6 };
  const zona = (extra) => normalizujSpec({ zony: [{ ...base, ...extra }] }).zony[0];
  // starý spec bez poľa features (aj prekonvertovaný) už nikdy nezapaľuje ss01
  assert.deepEqual(zona({}).features,
    { liga: true, dlig: false, ss01: false, ss03: false, case: false });
  assert.deepEqual(zona({ pismo: 'Nunito' }).features, {
    liga: true, calt: true, ss01: false, ss02: false, salt: false, case: false,
    onum: false, frac: false, sups: false, subs: false, ordn: false,
  });
  // neúplný objekt doplní chýbajúce tagy predvolenými hodnotami
  assert.deepEqual(zona({ features: { dlig: true } }).features,
    { liga: true, dlig: true, ss01: false, ss03: false, case: false });
});

test('features: neznámy tag pre dané písmo je jasná chyba', () => {
  const base = { typ: 'text', x: 1, y: 1, w: 4, h: 6 };
  const zona = (extra) => normalizujSpec({ zony: [{ ...base, ...extra }] }).zony[0];
  const pripady = [
    [{ features: { xyz: true } }, /xyz/],
    // dlig pozná len Brnos Aires, nie Nunito
    [{ pismo: 'Nunito', features: { dlig: true } }, /dlig/],
    [{ features: { liga: 'zap' } }, /true\/false/],
    [{ features: ['liga'] }, /musí byť objekt/],
  ];
  for (const [zle, rx] of pripady) {
    assert.throws(() => zona(zle), (e) => {
      assert.ok(e instanceof ValidationError, `nie ValidationError pre ${JSON.stringify(zle)}`);
      assert.match(e.message, /features/);
      assert.match(e.message, rx);
      return true;
    }, JSON.stringify(zle));
  }
});

test('SVG zapíše zapnuté aj vypnuté features explicitne do font-feature-settings', () => {
  const zona = (features) => ({
    typ: 'text', x: 1, y: 1, w: 8, h: 4, text: 'ft', pismo: 'Brnos Aires',
    riadok: 3, velkost: 80, ...(features !== undefined ? { features } : {}),
  });
  const svg = (features) => komponuj({ zony: [zona(features)] }).svg;
  // predvolene: liga zapnutá, ss01 vypnuté — žiadne natvrdo zapnuté tagy
  assert.match(svg(), /style="font-feature-settings: 'liga' 1, 'dlig' 0, 'ss01' 0, 'ss03' 0, 'case' 0"/);
  // zapnuté dlig a ss03, vypnutá liga: každý tag má svoju hodnotu
  assert.match(svg({ liga: false, dlig: true, ss03: true }),
    /style="font-feature-settings: 'liga' 0, 'dlig' 1, 'ss01' 0, 'ss03' 1, 'case' 0"/);
  // vypnutá liga nesmie padnúť do predvoleného prehliadača (formát bez čísel)
  assert.doesNotMatch(svg(), /font-feature-settings: 'liga'(?! \d)/);
});

test('zmena písma zachová spoločné tagy, zvyšok dostane predvolené nového písma', () => {
  const poZmene = featuresPoZmenePisma({ liga: false, dlig: true, ss01: true }, 'Nunito');
  assert.deepEqual(poZmene, {
    liga: false, calt: true, ss01: true, ss02: false, salt: false, case: false,
    onum: false, frac: false, sups: false, subs: false, ordn: false,
  });
});

// --- rez (statický rez) a hrubka (osa variabilného písma) ---

// minimálna textová zóna nad predvolenými hodnotami jadra; viac slov, aby sa
// zmeral aj zalomený riadok (prvé slovo riadka sa nemeria)
const zonaText = (extra) => ({
  typ: 'text', x: 1, y: 1, w: 8, h: 4, text: 'ft va', ...extra,
});
const specZTextom = (extra) => normalizujSpec({ zony: [zonaText(extra)] }).zony[0];

test('rez/hrubka: chýbajúce pole dostane predvolený rez, resp. hrúbku osi', () => {
  assert.equal(specZTextom({}).rez, 'regular');
  assert.ok(!('hrubka' in specZTextom({})), 'statické písmo nesie hrubku');
  assert.equal(specZTextom({ pismo: 'Nunito' }).hrubka, 400);
  assert.ok(!('rez' in specZTextom({ pismo: 'Nunito' })), 'variabilné písmo nesie rez');
  assert.equal(specZTextom({ rez: 'regular' }).rez, 'regular');
  assert.equal(specZTextom({ pismo: 'Nunito', hrubka: 900 }).hrubka, 900);
  // stub engine normalises the same contract
  assert.equal(normalizujSpecStub({ zony: [zonaText({})] }).zony[0].rez, 'regular');
  assert.equal(normalizujSpecStub({ zony: [zonaText({ pismo: 'Nunito' })] }).zony[0].hrubka, 400);
});

test('hrubka mimo osi alebo desatinná je jasná chyba', () => {
  for (const zla of [{ hrubka: 199 }, { hrubka: 1001 }, { hrubka: 400.5 }, { hrubka: 'bold' }]) {
    assert.throws(() => specZTextom({ pismo: 'Nunito', ...zla }), (e) => {
      assert.ok(e instanceof ValidationError, `nie ValidationError pre ${JSON.stringify(zla)}`);
      assert.match(e.message, /hrubka/);
      return true;
    }, JSON.stringify(zla));
  }
});

test('neznámy rez je jasná chyba', () => {
  assert.throws(() => specZTextom({ rez: 'bold' }), (e) => {
    assert.ok(e instanceof ValidationError);
    assert.match(e.message, /rez/);
    assert.match(e.message, /regular/);
    return true;
  });
});

test('pole druhého druhu písma je chyba — zmena písma musí vymeniť pole', () => {
  assert.throws(() => specZTextom({ pismo: 'Nunito', rez: 'regular' }), /rez/);
  assert.throws(() => specZTextom({ hrubka: 400 }), /hrubka/);
  // sekvencia prepnutia písma z lišty: obe polia preč, predvolené nového písma
  const z = zonaText({ pismo: 'Brnos Aires', rez: 'regular' });
  const poPrepnuti = { ...z, pismo: 'Nunito' };
  delete poPrepnuti.rez;
  delete poPrepnuti.hrubka;
  Object.assign(poPrepnuti, predvolenePisma('Nunito'));
  const zona = normalizujSpec({ zony: [poPrepnuti] }).zony[0];
  assert.equal(zona.hrubka, 400);
  assert.ok(!('rez' in zona), 'rez ostal po zmene písma');
});

test('SVG nesie font-weight podľa hrúbky, @font-face celú os variabilného písma', () => {
  const fontUrls = {
    Nunito: 'https://example.com/nunito.ttf',
    'Brnos Aires': { regular: 'https://example.com/brnos-aires.woff2' },
  };
  const svg = komponuj({
    zony: [zonaText({ pismo: 'Nunito', hrubka: 900 }), zonaText({ y: 6, pismo: 'Brnos Aires' })],
  }, { fontUrls }).svg;
  assert.match(svg, /<text[^>]*font-family="Nunito"[^>]*font-weight="900"/);
  assert.match(svg, /<text[^>]*font-family="Brnos Aires"[^>]*font-weight="400"/);
  assert.match(svg, /@font-face \{ font-family: 'Nunito';[^}]*font-weight: 200 1000;/);
  assert.match(svg, /@font-face \{ font-family: 'Brnos Aires';[^}]*font-weight: 400;/);
});

test('komponuj odovzdá face zóny (rez/hrúbka) až do zmerajText', () => {
  const videne = [];
  const zmeraj = (text, pismo, velkost, features, face) => {
    videne.push(face);
    return text.length * velkost;
  };
  komponuj({
    zony: [zonaText({ pismo: 'Nunito', hrubka: 900 }), zonaText({ y: 6, pismo: 'Brnos Aires' })],
  }, { zmerajText: zmeraj });
  assert.ok(videne.length > 0, 'meranie sa nezavolalo');
  for (const face of videne) {
    assert.ok(face.family === 'Nunito' || face.family === 'Brnos Aires',
      `nečakaná rodina ${face.family}`);
    assert.equal(face.weight, face.family === 'Nunito' ? 900 : 400);
    assert.equal(face.style, 'normal');
  }
});

test('všetky tvary sú vnútri orezaného formátu', () => {
  const { tvary } = komponuj(plagat);
  const W = plagat.grid.stlpce;
  const H = (plagat.format.vyska * W) / plagat.format.sirka;
  assert.ok(tvary.length > 0);
  for (const t of tvary) {
    assert.ok(t.bbox.x >= -EPS && t.bbox.y >= -EPS, `tvar ${t.typ} trčí hore/vľavo`);
    assert.ok(t.bbox.x + t.bbox.w <= W + EPS, `tvar ${t.typ} trčí vpravo`);
    assert.ok(t.bbox.y + t.bbox.h <= H + EPS, `tvar ${t.typ} trčí dole: ${JSON.stringify(t.bbox)} nad ${H}`);
  }
});

test('SVG neobsahuje NaN ani Infinity', () => {
  for (const spec of [plagat, nahlad, { ...plagat, inverzia: true }]) {
    const { svg } = komponuj(spec);
    assert.doesNotMatch(svg, /NaN|Infinity/);
  }
});

test('prázdna fotková zóna bez zdroja kreslí šedý placeholder', () => {
  const { svg } = komponuj(plagat);
  assert.match(svg, /id="fotky"/);
  assert.match(svg, /#e3e3e3/);
});

test('normalizujSpec doplní všetky predvolené polia', () => {
  const spec = normalizujSpec({});
  assert.equal(spec.format.sirka, 420);
  assert.equal(spec.grid.stlpce, 30);
  assert.equal(spec.variant, '1');
  assert.deepEqual(spec.zony, []);
  assert.equal(typeof spec.kompozicia.pomery.noha, 'number');
});

test('rozmiestnenie dlazdice varuje a beží ako voľné', () => {
  const { varovania, svg } = komponuj({ ...nahlad, kompozicia: { ...nahlad.kompozicia, rozmiestnenie: 'dlazdice' } });
  assert.ok(varovania.some((v) => v.includes('dlazdice')));
  assert.ok(svg.includes('id="pattern"'));
});

test('neplatný spec skončí na ValidationError so slovenskou správou', () => {
  const pripady = [
    [{ format: { sirka: -1 } }, /sirka/],
    [{ format: { jednotka: 'cm' } }, /jednotka/],
    [{ grid: { stlpce: 1.5 } }, /stlpce/],
    [{ grid: { zvysok: 'hore' } }, /zvysok/],
    [{ kresba: { weight: 140 } }, /weight/],
    [{ kompozicia: { velkost: [6, 1] } }, /velkost/],
    [{ kompozicia: { pomery: { acky: 5 } } }, /Neznámy typ/],
    [{ kompozicia: { pomery: { noha: 0 } } }, /pomery/],
    [{ variant: true }, /variant/],
    [{ inverzia: 'nie' }, /inverzia/],
    [{ zony: [{ typ: 'text', x: 1, y: 1, w: 99, h: 2 }] }, /presahuje šírku/],
    [{ zony: [{ typ: 'fotka', x: 1, y: 40, w: 2, h: 4 }] }, /presahuje výšku/],
    [{ zony: [{ typ: 'text', x: 1, y: 1, w: 2, h: 2, okraj: 21 }] }, /okraj/],
    [{ zony: [{ typ: 'text', x: 1, y: 1, w: 2, h: 2, okraj: -21 }] }, /okraj/],
    [{ zony: [{ typ: 'text', x: 1, y: 1, w: 2, h: 2, okraj: 1.5 }] }, /okraj/],
    [{ zony: [{ typ: 'text', x: 0, y: 0, w: 2, h: 1, pismo: 'Comic Sans' }] }, /pismo/],
    [{ zony: [{ typ: 'fotka', x: 0, y: 0, w: 2, h: 1, rezim: 'vyrez' }] }, /rezim/],
    [{ neviem: 1 }, /Neznáme pole/],
  ];
  for (const [spec, rx] of pripady) {
    assert.throws(() => normalizujSpec(spec), (e) => {
      assert.ok(e instanceof ValidationError, `nie ValidationError pre ${JSON.stringify(spec)}`);
      assert.match(e.message, rx);
      return true;
    }, JSON.stringify(spec));
  }
});

test('tvary sa reťazia cez spoje rovnakej hrúbky', async () => {
  const { komponuj } = await import('../core/kompozicia/index.js');
  const spec = JSON.parse(readFileSync(new URL('../priklady/plagat-a2.json', import.meta.url), 'utf8'));
  const { tvary } = komponuj(spec);
  const spojene = tvary.filter((t) => t.spoje.length);
  assert.ok(spojene.length >= 2, 'aspoň jedna reťaz');
  const OPAK = { down: 'up', up: 'down', left: 'right', right: 'left' };
  // a teardrop hung along a leg (bok) sits on the leg's side, not on a joint
  for (const t of spojene.filter((u) => !u.bok)) {
    for (const id of t.spoje) {
      const j = t.joints.find((q) => q.id === id);
      const partner = tvary.some((u) => u !== t && u.joints.some((q) => u.spoje.includes(q.id)
        && Math.hypot(q.x - j.x, q.y - j.y) < 1e-6 && Math.abs(q.t - j.t) < 1e-9 && OPAK[q.dir] === j.dir));
      assert.ok(partner, `spoj ${t.typ}.${id} má protikus`);
    }
  }
});

test('dĺžka reťaze [min, max] sa dá zadať a overuje sa', () => {
  const spec = JSON.parse(readFileSync(new URL('../priklady/plagat-a2.json', import.meta.url), 'utf8'));
  // [1, 1]: one shape per chain, joined only to the teardrops ending it
  const jeden = komponuj({ ...spec, kompozicia: { ...spec.kompozicia, retazenieDlzka: [1, 1] } });
  for (const t of jeden.tvary.filter((u) => u.typ !== 'kvapka')) {
    for (const id of t.spoje) {
      const j = t.joints.find((q) => q.id === id);
      const partner = jeden.tvary.find((u) => u !== t
        && u.joints.some((q) => Math.hypot(q.x - j.x, q.y - j.y) < 1e-6));
      assert.equal(partner?.typ, 'kvapka', `${t.typ}.${id} je napojený na ${partner?.typ}`);
    }
  }
  assert.throws(
    () => komponuj({ ...spec, kompozicia: { ...spec.kompozicia, retazenieDlzka: [5, 2] } }),
    /retazenieDlzka/);
});

test('každá čiara končí slzou: tvar reťaze má obsadené všetky spoje', () => {
  const { tvary } = komponuj({ variant: '7' });
  const reťaz = tvary.filter((t) => t.joints.length);
  assert.ok(reťaz.length > 0);
  for (const t of reťaz) {
    assert.equal(t.spoje.length, t.joints.length, `${t.typ} má voľný koniec`);
  }
});

test('polooblúk sa nenapája priamo na ďalší polooblúk', () => {
  for (const variant of ['1', '7', '42']) {
    const { tvary } = komponuj({ variant });
    const polkruhy = tvary.filter((t) => t.typ === 'polkruh');
    for (const a of polkruhy) {
      for (const id of a.spoje) {
        const j = a.joints.find((q) => q.id === id);
        const susedia = polkruhy.filter((b) => b !== a
          && b.joints.some((q) => b.spoje.includes(q.id) && Math.hypot(q.x - j.x, q.y - j.y) < 1e-6));
        assert.equal(susedia.length, 0, `variant ${variant}: polkruh na polkruhu`);
      }
    }
  }
});

test('pomery sú podiely v reťazi: typ s pomerom 0 sa neobjaví', () => {
  const { tvary } = komponuj({ variant: '3', kompozicia: { pomery: { noha: 80, kvapka: 20 } } });
  assert.ok(tvary.length > 0);
  for (const t of tvary) {
    assert.ok(['noha', 'kvapka', 'stvrtoblouk'].includes(t.typ), `nečakaný typ ${t.typ}`);
  }
});
