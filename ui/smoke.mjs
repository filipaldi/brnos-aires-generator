// Smoke test for the generator UI. Starts serve.js when nothing listens on
// the port, drives the page with Playwright (global node_modules, browser in
// PLAYWRIGHT_BROWSERS_PATH) and saves six screenshots. Fails when the
// browser console reports errors. Checks the start screen first (the clean
// canvas, then the repository's templates in index order; Pokračovať after a
// reload with saved work), the grid snapping (every zone edge lands on the
// grid line nearest to the cursor, threshold mid-cell), the crop marks and
// okraj guide, and mode Fotka of a photo zone: dragging the photo and its
// corner changes posun and mierka in whole %.
//
//   node ui/smoke.mjs [output-dir]
//
// BASE_URL=http://host:port tests a site that is already being served at
// <base>/ui/ (e.g. the _site assembled by scripts/zostav-web.sh under
// python3 -m http.server) — no server of our own is started then.

import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.argv[2]
  ?? '/tmp/brnos-ui-smoke';
const SHOTS = [
  'ui-uvod.png',
  'ui-initial.png',
  'ui-zona-milonga.png',
  'ui-parametre.png',
  'ui-prehliadac-tvarov.png',
  'ui-fotka-mod.png',
];

mkdirSync(OUT_DIR, { recursive: true });

// ---------- playwright from global node_modules ----------

function loadPlaywright() {
  const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const require = createRequire(path.join(globalRoot, 'noop.js'));
  return require('playwright');
}

// ---------- server ----------

// Without BASE_URL we always start our own server on a free port: a server
// already sitting on 41235 may belong to another checkout and serve
// different files. With BASE_URL the site under test is already running;
// the page is always <base>/ui/ (a trailing /ui is tolerated).
function volnyPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const ZAKLAD = (process.env.BASE_URL ?? '').replace(/\/+$/, '').replace(/\/ui$/, '');
const PORT = ZAKLAD ? 0 : await volnyPort();
const URL = ZAKLAD || `http://localhost:${PORT}/ui/`;

async function portOpen() {
  try {
    await fetch(URL, { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

const server = ZAKLAD ? null : spawn(process.execPath, [path.join(ROOT, 'ui/serve.js')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(PORT) },
});
if (server) server.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));
for (let i = 0; i < 50 && !(await portOpen()); i++) {
  await new Promise((r) => setTimeout(r, 100));
}
if (!(await portOpen())) {
  console.error('Server nie je dostupný na', URL);
  if (server) server.kill();
  process.exit(1);
}

// ---------- the run ----------

const errors = [];
let browser;
let workerSpusteny = false; // composing must run off the main thread
try {
  const { chromium } = loadPlaywright();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  page.on('console', (msg) => {
    // Resource failures carry no URL in the console text; the response
    // listener below reports them (with the URL) instead.
    if (msg.type() === 'error' && !/^Failed to load resource/.test(msg.text())) {
      errors.push(`console: ${msg.text()}`);
    }
    // the compose worker falling back to the main thread is a bug here
    if (msg.type() === 'warning' && /hlavnom vlákne/.test(msg.text())) {
      errors.push(`console: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('worker', () => { workerSpusteny = true; });
  // failed requests (DNS, aborted, network error) carry no HTTP response —
  // report them separately from the status listener below
  page.on('requestfailed', (r) => {
    errors.push(`request ${r.url()} — ${r.failure()?.errorText ?? 'zlyhal'}`);
  });
  page.on('response', (r) => {
    // The engine adapter probes core/kompozicia and falls back to the stub;
    // that probe is allowed to 404 while phase 2 is not merged.
    if (r.status() >= 400 && !r.url().includes('/core/kompozicia/')) {
      errors.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  // Composing runs in a worker and takes seconds: the „skladám…“ note must
  // come up while the newest spec is being composed and go down once its
  // result is on the sheet.
  const cakajNaSkladanie = async () => {
    await page.waitForSelector('#compose-note:not([hidden])', { timeout: 5000 });
    // a hidden element never reaches the "visible" state — wait for the
    // attribute itself, i.e. for the newest compose being applied
    await page.waitForSelector('#compose-note[hidden]', { state: 'attached', timeout: 15000 });
  };

  // (a) the start screen: tiles instead of the canvas — the clean canvas
  // first, no Pokračovať in a fresh browser, then every template of
  // presets/sablony/index.json in its order
  const sablonyDir = path.join(ROOT, 'presets/sablony');
  const nazvySablon = JSON.parse(readFileSync(path.join(sablonyDir, 'index.json'), 'utf8')).sablony
    .map((subor) => JSON.parse(readFileSync(path.join(sablonyDir, subor), 'utf8')).nazov);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#uvod:not([hidden])', { timeout: 5000 });
  await page.waitForFunction((n) => document.querySelectorAll('.dlazdica[data-druh="sablona"]').length === n,
    nazvySablon.length, { timeout: 5000 }).catch(() => {});
  const dlazdice = await page.locator('.dlazdica').evaluateAll((bs) => bs.map((b) => ({
    druh: b.dataset.druh,
    nazov: b.querySelector('.nazov')?.textContent,
    rozmer: b.querySelector('.rozmer')?.textContent ?? '',
  })));
  const ocakavane = ['cisty', ...nazvySablon.map(() => 'sablona')];
  if (JSON.stringify(dlazdice.map((d) => d.druh)) !== JSON.stringify(ocakavane)) {
    errors.push(`dlaždice ${JSON.stringify(dlazdice.map((d) => d.druh))}, majú byť ${JSON.stringify(ocakavane)}`);
  }
  const nazvy = dlazdice.filter((d) => d.druh === 'sablona').map((d) => d.nazov);
  if (JSON.stringify(nazvy) !== JSON.stringify(nazvySablon)) {
    errors.push(`šablóny na dlaždiciach ${JSON.stringify(nazvy)}, majú byť ${JSON.stringify(nazvySablon)}`);
  }
  for (const d of dlazdice) {
    if (!/^\d+ × \d+ (px|mm)$/.test(d.rozmer)) errors.push(`dlaždica ${d.nazov} má rozmer „${d.rozmer}“`);
  }
  if (await page.locator('#sheet svg').count()) errors.push('list sa skladá už pod dlaždicami');
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[0]) });

  // a click on the clean canvas opens the editor
  await page.click('.dlazdica[data-druh="cisty"]');
  await page.waitForSelector('#uvod', { state: 'hidden', timeout: 5000 });
  // the first svg lands only after the first (async) compose finishes
  await page.waitForSelector('#sheet svg', { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[1]) });
  // the real engine must be up: a core/ file missing from the site would
  // silently fall back to the stub
  if (await page.locator('#stub-note:not([hidden])').count()) {
    errors.push('beží náhradný engine — jadro sa nenačítalo celé');
  }
  // both fonts must have really loaded (a 404 would leave a fallback face)
  const fonty = await page.evaluate(async () => {
    const out = {};
    for (const pismo of ['Brnos Aires', 'Nunito']) {
      try {
        out[pismo] = (await document.fonts.load(`100px '${pismo}'`)).length > 0;
      } catch {
        out[pismo] = false;
      }
    }
    return out;
  });
  for (const [pismo, ok] of Object.entries(fonty)) {
    if (!ok) errors.push(`písmo ${pismo} sa nenačítalo`);
  }

  // (b) drag a zone on the empty canvas, double-click it, type into it
  const box = await page.locator('#overlay').boundingBox();
  const sx = box.x + box.width * 0.16;
  const sy = box.y + box.height * 0.10;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + box.width * 0.52, sy + box.height * 0.14, { steps: 12 });
  await page.mouse.up();
  await page.waitForSelector('.zone.sel', { timeout: 15000 });
  await page.mouse.dblclick(sx + box.width * 0.2, sy + box.height * 0.05);
  await page.waitForSelector('#text-editor', { timeout: 5000 });
  await page.keyboard.type('MILONGA');
  const typed = await page.locator('#text-editor').inputValue().catch(() => null);
  if (typed !== 'MILONGA') errors.push(`editor neobsahuje MILONGA, ale „${typed}“`);
  await cakajNaSkladanie();
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[2]) });

  // (c) the Parametre popover. A dragged slider moves its number (and the
  // spec) live; the sheet is recomposed only after the thumb is released.
  await page.click('#btn-parametre');
  await page.waitForSelector('.popover:not([hidden])', { timeout: 5000 });
  // opening the popover blurs the text editor, which recomposes once more —
  // wait it out so only the slider can start composing below
  await cakajNaSkladanie();
  const slider = page.locator('.popover:not([hidden]) .row input[type="range"]').first();
  const cislo = page.locator('.popover:not([hidden]) .row .num').first();
  const cisloPred = await cislo.textContent();
  const sb = await slider.boundingBox();
  const slid = sb.y + sb.height / 2;
  await page.mouse.move(sb.x + sb.width * 0.25, slid);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 0.75, slid, { steps: 6 });
  const cisloPo = await cislo.textContent();
  const skladaloPocasTahu = await page.evaluate(() => !document.querySelector('#compose-note').hidden);
  await page.mouse.up();
  if (cisloPo === cisloPred) errors.push(`číslo pri slideri sa počas ťahania nezmenilo (${cisloPred} → ${cisloPo})`);
  if (skladaloPocasTahu) errors.push('skladanie bežalo už počas ťahania sliderom');
  await cakajNaSkladanie();
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[3]) });
  // the button closes its own popover (Escape is not a popover shortcut)
  await page.click('#btn-parametre');

  // (c2) one snapping rule everywhere: a zone edge lands on the grid line
  // nearest to the cursor, the threshold in the middle of a cell — for
  // creating, moving and resizing. The grid geometry is read from the page:
  // the dielik from the overlay's CSS variable, line 0 at the bleed mark
  // (the trimmed format's corner, where zoneRectPx puts dielik 0).
  const m = await page.evaluate(() => {
    const overlay = document.querySelector('#overlay');
    const ov = overlay.getBoundingClientRect();
    const bm = document.querySelector('#bleed-mark').getBoundingClientRect();
    const s = parseFloat(getComputedStyle(overlay).getPropertyValue('--dielik-px'));
    return { left: ov.left, top: ov.top, ox: bm.left - ov.left, oy: bm.top - ov.top, s };
  });
  const X = (d) => m.left + m.ox + d * m.s; // page px of the grid position d
  const Y = (d) => m.top + m.oy + d * m.s;
  const vDielikoch = (r) => ({
    x: (r.x - m.left - m.ox) / m.s,
    y: (r.y - m.top - m.oy) / m.s,
    w: r.width / m.s,
    h: r.height / m.s,
  });
  const porovnaj = (co, z, ocakavane) => {
    for (const [k, v] of Object.entries(ocakavane)) {
      if (Math.abs(z[k] - v) > 0.05) errors.push(`${co}: ${k}=${z[k].toFixed(2)}, má byť ${v}`);
    }
  };
  const rectZony = async (i) => vDielikoch(await page.locator(`.zone[data-i="${i}"]`).boundingBox());
  const tahaj = (x0, y0, x1, y1) => page.mouse.move(x0, y0)
    .then(() => page.mouse.down())
    .then(() => page.mouse.move(x1, y1, { steps: 6 }));

  // creating: a press just past the middle of a cell snaps the corner to the
  // next line, just before the middle to the previous one; the ghost already
  // shows the snapped rect during the drag (what you see is what you get)
  await tahaj(X(23.6), Y(14.6), X(27), Y(17));
  porovnaj('duch pri vytváraní A',
    vDielikoch(await page.locator('#zone-create-ghost').boundingBox()), { x: 24, y: 15, w: 3, h: 2 });
  await page.mouse.up();
  porovnaj('vytvorenie A (za stredom bunky → ďalšia čiara)', await rectZony(1), { x: 24, y: 15, w: 3, h: 2 });

  await tahaj(X(23.4), Y(20.4), X(27), Y(23));
  await page.mouse.up();
  porovnaj('vytvorenie B (pred stredom bunky → predchádzajúca čiara)', await rectZony(2), { x: 23, y: 20, w: 4, h: 3 });

  // moving: the top-left corner snaps to the line nearest to (cursor − grab);
  // resizing right after the move — the moved zone stays selected, so its
  // handles are the ones on screen
  const rohTr = async () => {
    const r = await page.locator('.zone.sel .handle.tr').boundingBox();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };

  await tahaj(X(25.6), Y(16), X(26.2), Y(16));
  porovnaj('presun A počas ťahania', await rectZony(1), { x: 25, y: 15, w: 3, h: 2 });
  await page.mouse.up();
  porovnaj('presun A (za stredom bunky → ďalšia čiara)', await rectZony(1), { x: 25, y: 15, w: 3, h: 2 });

  // resizing: the dragged edge snaps to the nearest line, the other stays put
  let roh = await rohTr();
  await tahaj(roh.x, roh.y, X(28.6), roh.y);
  porovnaj('zmena veľkosti A počas ťahania', await rectZony(1), { x: 25, y: 15, w: 4, h: 2 });
  await page.mouse.up();
  porovnaj('zmena veľkosti A (za stredom bunky → ďalšia čiara)', await rectZony(1), { x: 25, y: 15, w: 4, h: 2 });

  await tahaj(X(25), Y(21.5), X(25.4), Y(21.5));
  await page.mouse.up();
  porovnaj('presun B (pred stredom bunky → predchádzajúca čiara)', await rectZony(2), { x: 23, y: 20, w: 4, h: 3 });

  roh = await rohTr();
  await tahaj(roh.x, roh.y, X(27.4), roh.y);
  await page.mouse.up();
  porovnaj('zmena veľkosti B (pred stredom bunky → ostáva na čiare)', await rectZony(2), { x: 23, y: 20, w: 4, h: 3 });

  // the zones from the drags must compose like any other spec
  await cakajNaSkladanie();

  // (c3) the bleed shows as the eight crop marks of the export, and the
  // margin guide (okraj) only while the grid lines are visible
  const znacky = await page.locator('#bleed-mark .znacka').count();
  const spadavka = await page.evaluate(() => {
    const vb = document.querySelector('#sheet svg').viewBox.baseVal;
    return vb.x < 0;
  });
  if (spadavka && znacky !== 8) errors.push(`orezových značiek v editore je ${znacky}, má byť 8`);
  await page.click('#btn-format');
  const okrajPole = page.locator('.row', { has: page.locator('label', { hasText: /^Okraj$/ }) }).locator('input');
  await okrajPole.fill('1');
  await okrajPole.dispatchEvent('change');
  await page.click('#btn-format');
  await cakajNaSkladanie();
  if (await page.locator('#okraj-mark').isVisible()) errors.push('čiara okraja je vidieť, hoci grid je skrytý');
  await page.mouse.move(X(2), Y(30));
  await page.mouse.down();
  const okrajSGridom = await page.locator('#okraj-mark').isVisible();
  const gridViditelny = await page.locator('#grid-lines').isVisible();
  await page.mouse.up();
  if (!gridViditelny) errors.push('grid sa pri stlačení na plátne neukázal');
  if (!okrajSGridom) errors.push('čiara okraja sa neukázala so zapnutým gridom');
  if (await page.locator('#okraj-mark').isVisible()) errors.push('čiara okraja ostala po skrytí gridu');

  // (c4) a photo zone in mode Fotka. A 16:9 photo dropped on the empty
  // canvas makes a 4 × 3 frame centred on the cursor; the editor reads the
  // photo's pixel size, then the photo is dragged by its middle (posun) and
  // by its corner (mierka) — both stay whole numbers and keep the frame
  // covered.
  const ulozenaZona = (i) => page.evaluate((idx) => {
    try {
      return JSON.parse(localStorage.getItem('brnosaires-generator-spec-v1')).zony[idx] ?? null;
    } catch {
      return null;
    }
  }, i);
  // the spec is saved 400 ms after the sheet is composed
  const cakajNaZonu = async (i, podmienka, co) => {
    for (let t = 0; t < 60; t++) {
      const z = await ulozenaZona(i);
      if (z && podmienka(z)) return z;
      await page.waitForTimeout(250);
    }
    errors.push(`fotozóna: ${co} sa nedočkal`);
    return ulozenaZona(i);
  };
  await page.evaluate(async ({ x, y }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 320, 180);
    g.addColorStop(0, '#d33');
    g.addColorStop(1, '#33d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, 180);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'fotka.png', { type: 'image/png' }));
    document.querySelector('#overlay').dispatchEvent(new DragEvent('drop', {
      dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
  }, { x: X(8.2), y: Y(30.2) });
  const iFotky = 3;
  let fz = await cakajNaZonu(iFotky, (z) => z.typ === 'fotka' && Array.isArray(z.rozmer), 'rozmer fotky');
  porovnaj('fotozóna z pretiahnutia', await rectZony(iFotky), { x: 6, y: 29, w: 4, h: 3 });
  if (JSON.stringify(fz?.rozmer) !== '[320,180]') errors.push(`fotozóna: rozmer ${JSON.stringify(fz?.rozmer)}, má byť [320,180]`);
  if (fz?.mierka !== 100 || JSON.stringify(fz?.posun) !== '[0,0]') {
    errors.push(`fotozóna: nová fotka má mierku ${fz?.mierka} a posun ${JSON.stringify(fz?.posun)}`);
  }
  await page.click('#zone-bar .z-tgl[data-hodnota="fotka"]');
  await page.waitForSelector('.foto-cela', { timeout: 5000 });
  if (!(await page.locator('#zone-bar .z-tgl[data-hodnota="fotka"].zapnute').count())) {
    errors.push('fotozóna: tlačidlo módu Fotka nie je zapnuté');
  }
  // the whole photo: 16:9 at the height of the 3-dielik frame
  porovnaj('celá fotka v móde Fotka', vDielikoch(await page.locator('.foto-cela').boundingBox()),
    { x: 8 - 8 / 3, y: 29, w: 16 / 3, h: 3 });
  const celeCisla = (z) => Number.isInteger(z.mierka) && z.posun.every(Number.isInteger);
  // the middle of the photo, half a dielik to the left
  await tahaj(X(8), Y(30.5), X(7.5), Y(30.5));
  await page.mouse.up();
  fz = await cakajNaZonu(iFotky, (z) => z.posun[0] !== 0, 'posun fotky');
  if (!celeCisla(fz)) errors.push(`fotozóna: posun ${JSON.stringify(fz.posun)} nie sú celé čísla`);
  if (fz.posun[0] !== -12 || fz.posun[1] !== 0) errors.push(`fotozóna: posun ${JSON.stringify(fz.posun)}, má byť [-12,0]`);
  porovnaj('rámik po posune fotky', await rectZony(iFotky), { x: 6, y: 29, w: 4, h: 3 });
  // the photo's bottom-right corner, one dielik further right: 6.33 / 5.33
  // dieliks wide is a mierka of 119 %
  const uchyt = await page.locator('.foto-uchyt.br').boundingBox();
  const ux = uchyt.x + uchyt.width / 2;
  const uy = uchyt.y + uchyt.height / 2;
  await tahaj(ux, uy, ux + m.s, uy);
  await page.mouse.up();
  fz = await cakajNaZonu(iFotky, (z) => z.mierka > 100, 'mierka fotky');
  if (!celeCisla(fz)) errors.push(`fotozóna: mierka ${fz.mierka} / posun ${JSON.stringify(fz.posun)} nie sú celé čísla`);
  if (fz.mierka < 115 || fz.mierka > 125) errors.push(`fotozóna: mierka ${fz.mierka}, má byť okolo 119`);
  await cakajNaSkladanie().catch(() => {});
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[5]) });
  // back to Rámik: the photo's own handles go away
  await page.click('#zone-bar .z-tgl[data-hodnota="ramik"]');
  if (await page.locator('.foto-cela, .foto-uchyt').count()) errors.push('fotozóna: v móde Rámik ostala celá fotka');

  // (d) the shape viewer, opened from the bottom of the Parametre popover;
  // the click closes the popover on the way
  await page.click('#btn-parametre');
  await page.waitForSelector('.popover:not([hidden]) #btn-prehliadac', { timeout: 5000 });
  await page.click('.popover:not([hidden]) #btn-prehliadac');
  await page.waitForSelector('#viewer:not([hidden])', { timeout: 5000 });
  if (await page.evaluate(() => [...document.querySelectorAll('.popover')].some((p) => !p.hidden))) {
    errors.push('popover Parametre ostal otvorený po otvorení prehliadača tvarov');
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[4]) });

  // (e) after a reload the work saved above comes back through Pokračovať,
  // the second tile, with its zones
  const zonyPred = await page.locator('.zone').count();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#uvod:not([hidden])', { timeout: 5000 });
  const druhy = await page.locator('.dlazdica').evaluateAll((bs) => bs.map((b) => b.dataset.druh));
  if (druhy[1] !== 'pokracovat') errors.push(`po reloade nie je Pokračovať druhá dlaždica: ${JSON.stringify(druhy)}`);
  await page.click('.dlazdica[data-druh="pokracovat"]');
  await page.waitForSelector('#sheet svg', { timeout: 15000 });
  const zonyPo = await page.locator('.zone').count();
  if (zonyPo !== zonyPred) errors.push(`Pokračovať načítalo ${zonyPo} zón, uložených bolo ${zonyPred}`);
} catch (err) {
  errors.push(`beh: ${err.message}`);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

if (!workerSpusteny) errors.push('skladanie nebeží vo web workeri');

if (errors.length) {
  console.error('CHYBY:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log(`OK — ${SHOTS.length} screenshoty v ${OUT_DIR}`);
