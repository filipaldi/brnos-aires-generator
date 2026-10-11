// Médiá (presets/media.json) a okraj formátu: tvar dát médií, celé čísla,
// skupiny podľa issue, validácia okraja v jadre aj v náhradnom engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { komponuj, normalizujSpec } from '../core/kompozicia/index.js';
import { normalizujSpec as normalizujSpecStub } from '../ui/stub.js';
import { ValidationError } from '../core/errors.js';

const exec = promisify(execFile);
const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const NODE = process.execPath;

const MEDIA = JSON.parse(readFileSync(new URL('../presets/media.json', import.meta.url), 'utf8'));

const SKUPINY = ['Tlač A', 'Tlač B', 'Ostatná tlač', 'Instagram', 'Facebook', 'LinkedIn', 'Web'];
const POLIA = ['nazov', 'sirka', 'vyska', 'jednotka', 'dpi', 'spadavka', 'okraj'];
const CELE_CISLA = ['sirka', 'vyska', 'dpi', 'spadavka', 'okraj'];

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
});

test('okraj formátu: chýbajúce pole znamená 0, zadané sa zachová', () => {
  assert.equal(normalizujSpec({}).format.okraj, 0);
  assert.equal(normalizujSpec({ format: { sirka: 420, vyska: 594 } }).format.okraj, 0);
  assert.equal(normalizujSpec({ format: { okraj: 7 } }).format.okraj, 7);
  // the same contract in the fallback engine
  assert.equal(normalizujSpecStub({}).format.okraj, 0);
  assert.equal(normalizujSpecStub({ format: { okraj: 7 } }).format.okraj, 7);
});

test('okraj formátu: záporné a desatinné číslo je chyba', () => {
  for (const zla of [-1, 2.5, '5', null]) {
    assert.throws(() => normalizujSpec({ format: { okraj: zla } }), (e) => {
      assert.ok(e instanceof ValidationError, `nie ValidationError pre ${JSON.stringify(zla)}`);
      assert.match(e.message, /format\.okraj/);
      return true;
    }, JSON.stringify(zla));
  }
  assert.throws(() => normalizujSpecStub({ format: { okraj: -1 } }), (e) => {
    assert.ok(e instanceof ValidationError);
    assert.match(e.message, /okraj/i);
    return true;
  });
  assert.throws(() => normalizujSpecStub({ format: { okraj: 1.5 } }), /okraj/i);
});

test('formát média z presets/media.json prejde validáciou jadra', () => {
  // a medium minus its name is exactly a spec format: okraj included,
  // spadavka of its world (the CLI applies it the same way)
  const { nazov, ...a3 } = vsetkyMedia().find((m) => m.nazov === 'A3');
  const spec = normalizujSpec({ format: a3 });
  assert.equal(spec.format.okraj, 0);
  assert.equal(spec.format.spadavka, 3);
  assert.equal(spec.format.dpi, 300);
});

test('okraj formátu: aspoň polovica kratšej strany je chyba', () => {
  assert.throws(() => normalizujSpec({ format: { sirka: 100, vyska: 200, okraj: 50 } }), /format\.okraj/);
  assert.equal(normalizujSpec({ format: { sirka: 100, vyska: 200, okraj: 49 } }).format.okraj, 49);
  assert.throws(() => normalizujSpecStub({ format: { sirka: 100, vyska: 200, okraj: 50 } }), /okraj/i);
});

test('vodiaca čiara okraja je v SVG len pri nenulovom okraji', () => {
  const zaklad = { variant: 'okraj', zony: [] };
  const bez = komponuj(zaklad).svg;
  assert.doesNotMatch(bez, /id="okraj"/);
  const s = komponuj({ ...zaklad, format: { sirka: 420, vyska: 594, okraj: 21 } }).svg;
  // 21 mm on a 420 mm sheet of 30 columns is 1.5 dieliks
  assert.match(s, /<g id="okraj"><rect x="1\.5" y="1\.5" width="27"/);
  assert.equal(s.replace(/<g id="okraj">.*<\/g>\n/, ''), bez, 'okraj nemení nič iné');
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
