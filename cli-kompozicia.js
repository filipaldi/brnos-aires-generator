#!/usr/bin/env node
// CLI for compositions (phase 2).
//
//   node cli-kompozicia.js kompozicia --spec <file.json> --out <file.svg> [--variant <text>] [--png]
//
// The same command also runs through the shared entry:
//   node cli.js kompozicia --spec ...
//
// --variant overrides the spec's variant. Fonts are referenced by relative
// URLs from the output SVG to fonts/; the PNG export inlines
// them as base64 data URLs in a temporary SVG so text renders in Chromium.

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { komponuj } from './core/kompozicia/index.js';
import { loadProporcie } from './core/axes.js';
import { mimeFormatu, suboryFontov } from './core/kompozicia/pisma.js';
import { renderPng } from './png.js';

const SCRIPT = 'node cli.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function die(msg) {
  console.error(`Chyba: ${msg}`);
  process.exit(1);
}

function usage() {
  console.log(`Kompozícia Brnos Aires — fáza 2

Použitie:
  ${SCRIPT} kompozicia --spec <súbor.json> --out <súbor.svg> [--variant <text>] [--png]

Formát specu: priklady/plagat-a2.json a priklady/nahlad-akcie.json.`);
}

function nacitajSpec(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    die(`spec „${file}“ sa nedá prečítať.`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    die(`spec „${file}“ nie je platný JSON: ${e.message}`);
  }
}

// Fonts used by text zones of the spec, as relative URLs from the output file.
// The files come from the model in proporcie.json (kompozicia.pisma): a
// variable font is one URL, a static font one URL per rez — a new Brnos Aires
// cut lands in the CLI exports by adding its item there, nothing here.
function fontyRelativne(outFile, spec) {
  const outDir = path.dirname(path.resolve(outFile));
  const pouzite = new Set(
    (spec.zony || []).filter((z) => z.typ === 'text' && z.text).map((z) => z.pismo || 'Brnos Aires'),
  );
  const urls = {};
  for (const { pismo, rezId, subor } of suboryFontov()) {
    if (!pouzite.has(pismo)) continue;
    const url = path.relative(outDir, path.join(ROOT, subor)).split(path.sep).join('/');
    if (rezId === null) urls[pismo] = url;
    else (urls[pismo] ??= {})[rezId] = url;
  }
  return urls;
}

// The same fonts inlined as data URLs, so the temporary PNG SVG has no
// external references.
function fontyInline(spec) {
  const pouzite = new Set(
    (spec.zony || []).filter((z) => z.typ === 'text' && z.text).map((z) => z.pismo || 'Brnos Aires'),
  );
  const urls = {};
  for (const { pismo, rezId, subor, format } of suboryFontov()) {
    if (!pouzite.has(pismo)) continue;
    const dataUrl = `data:${mimeFormatu(format)};base64,${readFileSync(path.join(ROOT, subor)).toString('base64')}`;
    if (rezId === null) urls[pismo] = dataUrl;
    else (urls[pismo] ??= {})[rezId] = dataUrl;
  }
  return urls;
}

// --- kompozicia -------------------------------------------------------------

export async function cmdKompozicia(args) {
  const opts = parse('kompozicia', args, {
    spec: { type: 'string' },
    out: { type: 'string' },
    variant: { type: 'string' },
    png: { type: 'boolean', default: false },
  });
  if (!opts.spec) die('Chýba --spec <súbor.json> s definíciou kompozície.');
  if (!opts.out) die('Chýba --out <súbor.svg>, kam mám výsledok zapísať.');

  const spec = nacitajSpec(opts.spec);
  if (opts.variant !== undefined) spec.variant = opts.variant;

  const vysledok = komponuj(spec, { fontUrls: fontyRelativne(opts.out, spec) });
  for (const v of vysledok.varovania) console.error(`Pozor: ${v}`);
  writeFileSync(opts.out, vysledok.svg, 'utf8');
  console.log(`Zapísané: ${opts.out}`);

  if (!opts.png) return;
  const maxSirka = loadProporcie().kompozicia.png.maxSirka;
  const scale = Math.min(1, maxSirka / vysledok.sirkaPx);
  const sirka = Math.max(1, Math.round(vysledok.sirkaPx * scale));
  const vyska = Math.max(1, Math.round(vysledok.vyskaPx * scale));
  // standalone SVG with inlined fonts and pixel dimensions for the screenshot
  const tmpSvg = komponuj(spec, { fontUrls: fontyInline(spec) }).svg
    .replace(/^(<svg[^>]*width=")[^"]*(" height=")[^"]*(")/, `$1${sirka}px$2${vyska}px$3`);
  const tmpFile = opts.out.replace(/\.svg$/i, '') + '.png-tmp.svg';
  const pngFile = opts.out.replace(/\.svg$/i, '') + '.png';
  writeFileSync(tmpFile, tmpSvg, 'utf8');
  try {
    await renderPng(tmpFile, pngFile);
  } finally {
    unlinkSync(tmpFile);
  }
}

function parse(command, args, options) {
  try {
    return parseArgs({ args, options, strict: true, allowPositionals: false }).values;
  } catch (e) {
    die(`zlé voľby príkazu ${command}: ${e.message.split('\n')[0]}. Spusti „${SCRIPT} kompozicia“ bez argumentov pre nápovedu.`);
  }
}

// --- main (only when run directly; cli.js imports cmdKompozicia) --

const VLASTNY_BEH = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (VLASTNY_BEH) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (!command || command === 'pomoc' || command === '--help') {
      usage();
      process.exit(command ? 0 : 1);
    }
    if (command !== 'kompozicia') {
      usage();
      die(`neznámy príkaz „${command}“. Jediný príkaz tohto skriptu je kompozicia.`);
    }
    await cmdKompozicia(rest);
  } catch (e) {
    if (e?.name === 'ValidationError') die(e.message);
    die(e?.stack || e?.message || String(e));
  }
}
