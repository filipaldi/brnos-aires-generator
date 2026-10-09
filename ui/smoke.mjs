// Smoke test for the generator UI. Starts serve.js when nothing listens on
// the port, drives the page with Playwright (global node_modules, browser in
// PLAYWRIGHT_BROWSERS_PATH) and saves four screenshots. Fails when the
// browser console reports errors.
//
//   node ui/smoke.mjs [output-dir]

import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 41235;
const URL = `http://localhost:${PORT}/ui/`;
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

async function portOpen() {
  try {
    await fetch(`http://localhost:${PORT}/ui/`, { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

let server = null;
if (!(await portOpen())) {
  server = spawn(process.execPath, [path.join(ROOT, 'ui/serve.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));
  for (let i = 0; i < 50; i++) {
    if (await portOpen()) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!(await portOpen())) {
    console.error('Server sa nespustil na porte', PORT);
    process.exit(1);
  }
}

// ---------- the run ----------

const errors = [];
let browser;
try {
  const { chromium } = loadPlaywright();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // Resource failures carry no URL in the console text; the response
    // listener below reports them (with the URL) instead.
    if (/^Failed to load resource/.test(msg.text())) return;
    errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('response', (r) => {
    // The engine adapter probes core/kompozicia and falls back to the stub;
    // that probe is allowed to 404 while phase 2 is not merged.
    if (r.status() >= 400 && !r.url().includes('/core/kompozicia/')) {
      errors.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#sheet svg', { timeout: 15000 });
  await page.waitForTimeout(400);
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
  await page.waitForTimeout(400);
  const typed = await page.locator('#text-editor').inputValue().catch(() => null);
  if (typed !== 'MILONGA') errors.push(`editor neobsahuje MILONGA, ale „${typed}“`);
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[1]) });

  // (c) the Parametre popover
  await page.click('#btn-parametre');
  await page.waitForSelector('.popover:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT_DIR, SHOTS[2]) });
  // no keyboard shortcuts: the button closes its own popover
  await page.click('#btn-parametre');

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

if (errors.length) {
  console.error('CHYBY:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log(`OK — ${SHOTS.length} screenshoty v ${OUT_DIR}`);
