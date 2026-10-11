// Médiá (presets/media.json) a okraj mriežky: tvar dát médií, celé čísla,
// skupiny podľa issue, validácia okraja (v dielikoch) v jadre aj v náhradnom
// engine, jeho vodiaca čiara v SVG a to, že vzor aj zóny ostávajú vnútri neho.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { komponuj, normalizujSpec } from '../core/kompozicia/index.js';
import { komponuj as komponujStub, normalizujSpec as normalizujSpecStub } from '../ui/stub.js';
import { ValidationError } from '../core/errors.js';

const exec = promisify(execFile);
const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const NODE = process.execPath;

const MEDIA = JSON.parse(readFileSync(new URL('../presets/media.json', import.meta.url), 'utf8'));

const SKUPINY = ['Tlač A', 'Tlač B', 'Ostatná tlač', 'Instagram', 'Facebook', 'LinkedIn', 'Web'];
const POLIA = ['nazov', 'sirka', 'vyska', 'jednotka', 'dpi', 'spadavka'];
const CELE_CISLA = ['sirka', 'vyska', 'dpi', 'spadavka'];

const EPS = 1e-6;

const vsetkyMedia = () => MEDIA.skupiny.flatMap((s) => s.media);

test('skupiny médií sú presne podľa issue, v jeho poradí', () => {
  assert.deepEqual(MEDIA.skupiny.map((s) => s.nazov), SKUPINY);
});

test('každé médium má všetky polia, celé čísla a známu jednotku', () => {
  const mena = new Set();
  for (const m of vsetkyMedia()) {
    for (const pole of POLIA) {
      assert.ok(pole in m, `${m.nazov ?? '?'} nemá pole ${pole}`);
    }
    for (const pole of CELE_CISLA) {
      assert.ok(Number.isInteger(m[pole]), `${m.nazov}: ${pole}=${m[pole]} nie je celé číslo`);
      assert.ok(m[pole] >= 0, `${m.nazov}: ${pole}=${m[pole]} je záporné`);
    }
    assert.ok(['mm', 'px'].includes(m.jednotka), `${m.nazov}: jednotka ${m.jednotka}`);
    assert.ok(typeof m.nazov === 'string' && m.nazov !== '', `${m.nazov}: prázdny názov`);
    assert.ok(m.sirka > 0 && m.vyska > 0, `${m.nazov}: rozmer ${m.sirka} × ${m.vyska}`);
    assert.ok(!mena.has(m.nazov), `názov ${m.nazov} je v zozname dvakrát`);
    mena.add(m.nazov);
  }
  assert.ok(mena.size >= 30, `očakávaný aspoň 30 médií, našiel som ${mena.size}`);
});

test('tlač 300 DPI so spadávkou 3 (Billboard 50), digitál 72 DPI bez spadávky', () => {
  for (const m of vsetkyMedia()) {
    if (m.jednotka !== 'mm') continue;
    assert.equal(m.dpi, m.nazov === 'Billboard' ? 50 : 300, `${m.nazov}: DPI ${m.dpi}`);
    assert.equal(m.spadavka, 3, `${m.nazov}: spadávka ${m.spadavka}`);
  }
  for (const m of vsetkyMedia()) {
    if (m.jednotka !== 'px') continue;
    assert.equal(m.dpi, 72, `${m.nazov}: DPI ${m.dpi}`);
    assert.equal(m.spadavka, 0, `${m.nazov}: spadávka ${m.spadavka}`);
  }
});

test('rozmery médií sedia s issue (výber)', () => {
  const podlaNazvu = Object.fromEntries(vsetkyMedia().map((m) => [m.nazov, m]));
  const ocakavane = {
    A0: [841, 1189], A6: [105, 148],
    B0: [1000, 1414], B6: [125, 176],
    Billboard: [5100, 2400], Vizitka: [90, 50],
    'IG post štvorec': [1080, 1080],
    'IG post 3:4 (mriežka profilu)': [1080, 1440],
    'IG story / reels': [1080, 1920],
    'FB titulka udalosti': [1920, 1005],
    'LI banner profilu': [1584, 396],
    'LI titulka firmy': [1128, 191],
    'OG obrázok': [1200, 630],
    'Karta udalosti 16:9': [1200, 675],
  };
  for (const [nazov, rozmer] of Object.entries(ocakavane)) {
    assert.ok(podlaNazvu[nazov], `chýba médium ${nazov}`);
    assert.deepEqual([podlaNazvu[nazov].sirka, podlaNazvu[nazov].vyska], rozmer, nazov);
  }
  // dropped by the owner: the landscape IG post is no medium any more
  assert.ok(!podlaNazvu['IG post na šírku'], 'IG post na šírku má zo zoznamu zmiznúť');
});

test('okraj mriežky: chýbajúce pole znamená 0, zadané sa zachová', () => {
  assert.equal(normalizujSpec({}).grid.okraj, 0);
  assert.equal(normalizujSpec({ grid: { stlpce: 30 } }).grid.okraj, 0);
  assert.equal(normalizujSpec({ grid: { okraj: 2 } }).grid.okraj, 2);
  // the same contract in the fallback engine
  assert.equal(normalizujSpecStub({}).grid.okraj, 0);
  assert.equal(normalizujSpecStub({ grid: { okraj: 2 } }).grid.okraj, 2);
});

test('okraj už nie je pole formátu', () => {
  assert.throws(() => normalizujSpec({ format: { okraj: 0 } }), /Neznáme pole „okraj“ v format/);
  assert.ok(!('okraj' in normalizujSpec({}).format));
});

test('okraj mriežky: záporné a desatinné číslo je chyba', () => {
  for (const zla of [-1, 2.5, '5', null]) {
    assert.throws(() => normalizujSpec({ grid: { okraj: zla } }), (e) => {
      assert.ok(e instanceof ValidationError, `nie ValidationError pre ${JSON.stringify(zla)}`);
      assert.match(e.message, /grid\.okraj/);
      return true;
    }, JSON.stringify(zla));
  }
  assert.throws(() => normalizujSpecStub({ grid: { okraj: -1 } }), (e) => {
    assert.ok(e instanceof ValidationError);
    assert.match(e.message, /okraj/i);
    return true;
  });
  assert.throws(() => normalizujSpecStub({ grid: { okraj: 1.5 } }), /okraj/i);
});

test('okraj mriežky nechá vnútri aspoň stĺpec a celý riadok', () => {
  // 10 columns on 100 × 200: 20 whole rows, so the columns bound the margin
  assert.throws(() => normalizujSpec({ format: { sirka: 100, vyska: 200 }, grid: { stlpce: 10, okraj: 5 } }), /grid\.okraj.*stĺpcov/);
  assert.equal(normalizujSpec({ format: { sirka: 100, vyska: 200 }, grid: { stlpce: 10, okraj: 4 } }).grid.okraj, 4);
  // 30 columns on a 1640 × 624 cover: 11.41… dieliky high, 11 whole rows
  const titulka = { sirka: 1640, vyska: 624, jednotka: 'px', dpi: 72, spadavka: 0 };
  assert.throws(() => normalizujSpec({ format: titulka, grid: { stlpce: 30, okraj: 6 } }), /grid\.okraj.*riadkov/);
  assert.equal(normalizujSpec({ format: titulka, grid: { stlpce: 30, okraj: 5 } }).grid.okraj, 5);
  assert.throws(() => normalizujSpecStub({ format: { sirka: 100, vyska: 200 }, grid: { stlpce: 10, okraj: 5 } }), /okraj/i);
  assert.throws(() => normalizujSpecStub({ format: titulka, grid: { stlpce: 30, okraj: 6 } }), /okraj/i);
});

test('médium nenastavuje okraj: formát média prejde validáciou jadra', () => {
  // a medium minus its name is exactly a spec format, spadavka of its world
  // (the CLI applies it the same way); the margin belongs to the grid
  for (const m of vsetkyMedia()) assert.ok(!('okraj' in m), `${m.nazov} nastavuje okraj`);
  const { nazov, ...a3 } = vsetkyMedia().find((m) => m.nazov === 'A3');
  const spec = normalizujSpec({ format: a3, grid: { okraj: 2 } });
  assert.equal(spec.grid.okraj, 2);
  assert.equal(spec.format.spadavka, 3);
  assert.equal(spec.format.dpi, 300);
});

test('vodiaca čiara okraja je v SVG len pri nenulovom okraji, na čiarach gridu', () => {
  const zaklad = { variant: 'okraj', zony: [] };
  const bez = komponuj(zaklad).svg;
  assert.doesNotMatch(bez, /id="okraj"/);
  assert.doesNotMatch(komponuj({ ...zaklad, grid: { okraj: 0 } }).svg, /id="okraj"/);
  // A2 at 30 columns is 42.43… dieliky high: 42 whole rows, so the guide is
  // 2 dieliky in from the left, top and right and from the last whole row
  const s = komponuj({ ...zaklad, grid: { okraj: 2 } }).svg;
  assert.match(s, /<g id="okraj"><rect x="2" y="2" width="26" height="38"/);
});

// SHA-256 of the SVG the composition wrote before the margin moved the
// pattern: a grid without a margin must keep producing it byte for byte
// (retuning the pattern itself changes these digests on purpose)
const PRED_OKRAJOM = [
  [{ variant: 'okraj', zony: [] },
    '4a08ea1e34bcd974cf782f4a710992829c81c1fcfcf6abf2cd8670b267552031'],
  [{
    variant: '7',
    format: { sirka: 210, vyska: 297, jednotka: 'mm', dpi: 300, spadavka: 3 },
    grid: { stlpce: 30, okraj: 0 },
    zony: [{ typ: 'prazdna', x: 0, y: 0, w: 6, h: 4 }],
  }, 'e9605fd459cc85f2dc5ba6a7a25a1d080f4a1b693581ed4cc60cd6aace268c56'],
];

test('okraj 0 nechá list bajt po bajte taký, aký bol pred okrajom', () => {
  for (const [spec, digest] of PRED_OKRAJOM) {
    assert.equal(createHash('sha256').update(komponuj(spec).svg).digest('hex'), digest, spec.variant);
  }
});

// A4 at 30 columns: 42.42… dieliky high, 42 whole rows
const A4 = { sirka: 210, vyska: 297, jednotka: 'mm', dpi: 300, spadavka: 3 };

test('okraj posúva vzor: každý tvar leží vnútri vodiacej čiary okraja', () => {
  const ok = 3;
  for (const zvysok of ['okraje', 'natiahnutie', 'orez']) {
    for (const variant of ['1', '2', 'okraj']) {
      const spec = { variant, format: A4, grid: { stlpce: 30, zvysok, okraj: ok }, zony: [] };
      const { tvary, svg } = komponuj(spec);
      assert.ok(tvary.length > 0, `${zvysok}/${variant}: žiadny tvar`);
      for (const t of tvary) {
        const b = t.bbox;
        const kde = `${zvysok}/${variant} ${t.typ} ${JSON.stringify(b)}`;
        assert.ok(b.x >= ok - EPS && b.y >= ok - EPS, `${kde} zasahuje do okraja vľavo alebo hore`);
        assert.ok(b.x + b.w <= 30 - ok + EPS, `${kde} zasahuje do okraja vpravo`);
        assert.ok(b.y + b.h <= 42 - ok + EPS, `${kde} zasahuje pod vodiacu čiaru`);
      }
      // deterministic for the same spec, and a different sheet than without the margin
      assert.equal(komponuj(spec).svg, svg);
      const bez = komponuj({ ...spec, grid: { stlpce: 30, zvysok, okraj: 0 } });
      assert.notEqual(bez.svg.replace(/<g id="okraj">.*\n/, ''), svg.replace(/<g id="okraj">.*\n/, ''));
    }
  }
});

test('náhradný engine kladie vzor tiež len vnútri okraja', () => {
  const ok = 3;
  const { tvary } = komponujStub({ variant: '5', format: A4, grid: { stlpce: 30, okraj: ok } });
  assert.ok(tvary.length > 0);
  for (const { bbox: b } of tvary) {
    assert.ok(b.x >= ok - EPS && b.y >= ok - EPS && b.x + b.w <= 30 - ok + EPS && b.y + b.h <= 42 - ok + EPS,
      JSON.stringify(b));
  }
});

test('zóna musí ležať vnútri okraja gridu, v jadre aj v náhradnom engine', () => {
  const grid = { stlpce: 30, okraj: 3 };
  const zona = (r) => ({ format: A4, grid, zony: [{ typ: 'prazdna', okraj: 0, ...r }] });
  // exactly on the guide is inside
  assert.doesNotThrow(() => normalizujSpec(zona({ x: 3, y: 3, w: 24, h: 36 })));
  assert.doesNotThrow(() => normalizujSpecStub(zona({ x: 3, y: 3, w: 24, h: 36 })));
  for (const r of [
    { x: 2, y: 3, w: 4, h: 4 }, { x: 3, y: 2, w: 4, h: 4 },
    { x: 24, y: 3, w: 4, h: 4 }, { x: 3, y: 36, w: 4, h: 4 },
  ]) {
    assert.throws(() => normalizujSpec(zona(r)), (e) => {
      assert.ok(e instanceof ValidationError);
      assert.match(e.message, /zóna 1 zasahuje do okraja gridu/);
      return true;
    }, JSON.stringify(r));
    assert.throws(() => normalizujSpecStub(zona(r)), /zasahuje do okraja gridu/, JSON.stringify(r));
  }
  // without a margin the same zone at the edge stays valid
  assert.doesNotThrow(() => normalizujSpec({ format: A4, grid: { stlpce: 30 }, zony: [{ typ: 'prazdna', x: 0, y: 0, w: 4, h: 4 }] }));
});

test('CLI --format nastaví formát podľa názvu média, neznáme médium je chyba', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'brnos-media-'));
  try {
    const specSubor = path.join(dir, 'spec.json');
    writeFileSync(specSubor, JSON.stringify({ variant: 'a4', zony: [] }));
    const out = path.join(dir, 'a4.svg');
    await exec(NODE, [CLI, 'kompozicia', '--spec', specSubor, '--format', 'A4', '--out', out]);
    const svg = readFileSync(out, 'utf8');
    assert.match(svg, /width="216mm" height="303mm"/);
    await assert.rejects(
      exec(NODE, [CLI, 'kompozicia', '--spec', specSubor, '--format', 'A7', '--out', out]),
      (e) => e.code === 1 && /Neznáme médium/.test(e.stderr),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
