// Smoke test for the generator UI. Starts serve.js when nothing listens on
// the port, drives the page with Playwright (global node_modules, browser in
// PLAYWRIGHT_BROWSERS_PATH) and saves four screenshots. Fails when the
// browser console reports errors. Also checks the grid snapping: every zone
// edge lands on the grid line nearest to the cursor, threshold mid-cell.
//
//   node ui/smoke.mjs [output-dir]

import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.argv[2]
  ?? '/tmp/brnos-ui-smoke';
const SHOTS = [
  'ui-initial.png',
  'ui-zona-milonga.png',
  'ui-parametre.png',
  'ui-prehliadac-tvarov.png',
];

mkdirSync(OUT_DIR, { recursive: true });

// ---------- playwright from global node_modules ----------

function loadPlaywright() {
  const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const require = createRequire(path.join(globalRoot, 'noop.js'));
  return require('playwright');
}

// ---------- server ----------

// Always our own server on a free port: a server already sitting on 41235
// may belong to another checkout and serve different files.
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

const PORT = await volnyPort();
const URL = `http://localhost:${PORT}/ui/`;

async function portOpen() {
  try {
    await fetch(URL, { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

const server = spawn(process.execPath, [path.join(ROOT, 'ui/serve.js')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(PORT) },
});
server.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));
for (let i = 0; i < 50 && !(await portOpen()); i++) {
  await new Promise((r) => setTimeout(r, 100));
}
if (!(await portOpen())) {
  console.error('Server sa nespustil na porte', PORT);
  server.kill();
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

  await page.goto(URL, { waitUntil: 'networkidle' });
  // the first svg lands only after the first (async) compose finishes
  await page.waitForSelector('#sheet svg', { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[0]) });

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
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[1]) });

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
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[2]) });
  // no keyboard shortcuts: the button closes its own popover
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

  // (d) the shape viewer, opened by the Tvary button
  await page.click('#btn-tvary');
  await page.waitForSelector('#viewer:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[3]) });
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
