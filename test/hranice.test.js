// Import boundaries from the front-matter block of ARCHITECTURE.md:
// every relative import between two layer homes must not be a `forbid` edge,
// and allow + forbid must name every ordered pair of distinct layers once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_ANYWHERE = new Set(['node_modules', '.git', '_site']);
const SKIP_TOP = new Set(['test', 'scripts', 'priklady', 'fonts', 'docs']);

// Parses exactly the shapes the block uses:
//   layers:            /  name: ["dir/**", ...]
//   dependencies:      /  allow: | forbid:  /  - a -> b
function parseBlock(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) throw new Error('ARCHITECTURE.md nemá front-matter blok');
  const layers = {}, allow = [], forbid = [];
  let section = null, list = null;
  m[1].split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (line === '') return;
    let g;
    if ((g = line.match(/^(layers|dependencies):$/))) { section = g[1]; list = null; return; }
    if (section === 'layers' && (g = line.match(/^ {2}([\w-]+):\s*\[(.*)\]$/))) {
      layers[g[1]] = g[2].split(',').map((s) => s.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
      return;
    }
    if (section === 'dependencies' && (g = line.match(/^ {2}(allow|forbid):$/))) {
      list = g[1] === 'allow' ? allow : forbid;
      return;
    }
    if (section === 'dependencies' && list && (g = line.match(/^ {4}- ([\w-]+) -> ([\w-]+)$/))) {
      list.push([g[1], g[2]]);
      return;
    }
    throw new Error(`blok, riadok ${i + 2}: nečitateľné "${line}"`);
  });
  return { layers, allow, forbid };
}

// Problems with the block itself: unknown layers, self-edges, and ordered
// pairs of distinct layers named zero times or more than once.
function blockProblems({ layers, allow, forbid }) {
  const names = Object.keys(layers);
  const problems = [];
  const seen = new Map();
  for (const [kind, edges] of [['allow', allow], ['forbid', forbid]]) {
    for (const [a, b] of edges) {
      for (const n of [a, b]) if (!names.includes(n)) problems.push(`${kind}: ${a} -> ${b} menuje neznámu vrstvu ${n}`);
      if (a === b) problems.push(`${kind}: ${a} -> ${b} je hrana vrstvy na seba`);
      const k = `${a} -> ${b}`;
      seen.set(k, [...(seen.get(k) ?? []), kind]);
    }
  }
  for (const a of names) for (const b of names) {
    if (a === b) continue;
    const kinds = seen.get(`${a} -> ${b}`) ?? [];
    if (kinds.length === 0) problems.push(`${a} -> ${b} chýba v allow aj forbid`);
    if (kinds.length > 1) problems.push(`${a} -> ${b} je uvedená ${kinds.length}× (${kinds.join(', ')})`);
  }
  for (const [n, globs] of Object.entries(layers)) {
    for (const g of globs) if (!/^[\w./-]+\/\*\*$/.test(g)) problems.push(`${n}: glob ${g} nie je tvaru dir/**`);
  }
  return problems;
}

function layerOf(rel, layers) {
  for (const [name, globs] of Object.entries(layers)) {
    for (const g of globs) if (rel.startsWith(g.slice(0, -2))) return name;
  }
  return null;
}

// Blanks comments (keeping newlines and offsets) so commented-out imports do not count.
function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === q) q = null;
      i++;
    } else if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      if (c === '"' || c === "'" || c === '`') q = c;
      out += c;
      i++;
    }
  }
  return out;
}

function collectImports(src) {
  const code = stripComments(src);
  const found = [];
  const lineAt = (idx) => code.slice(0, idx).split('\n').length;
  const res = [
    /\b(?:import|export)\s+(?:[^'"`;()]*?\s*from\s*)?(['"])([^'"]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
  ];
  for (const re of res) {
    for (const m of code.matchAll(re)) found.push({ spec: m[2], line: lineAt(m.index) });
  }
  return found.sort((x, y) => x.line - y.line);
}

function walk(root) {
  const files = [];
  const visit = (dir, top) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_ANYWHERE.has(e.name) || (top && SKIP_TOP.has(e.name))) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) visit(p, false);
      else if (/\.m?js$/.test(e.name)) files.push(p);
    }
  };
  visit(root, true);
  return files.sort();
}

function resolveImport(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const p of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

// Every import from layer A into layer B (A != B) whose edge is in `forbid`.
// Files and targets outside every layer glob are today's flat tree and are skipped.
function violations(root, block) {
  const forbid = new Set(block.forbid.map(([a, b]) => `${a} -> ${b}`));
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  const out = [];
  for (const file of walk(root)) {
    const from = layerOf(rel(file), block.layers);
    if (!from) continue;
    for (const { spec, line } of collectImports(fs.readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
      const target = resolveImport(file, spec);
      if (!target) continue;
      const to = layerOf(rel(target), block.layers);
      if (!to || to === from || !forbid.has(`${from} -> ${to}`)) continue;
      out.push(`${rel(file)}:${line}: ${from} -> ${to} je vo forbid (import '${spec}')`);
    }
  }
  return out;
}

// ---- the real repository ----

const real = parseBlock(fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8'));

test('blok ARCHITECTURE.md je úplný: každá dvojica vrstiev práve raz, žiadna neznáma vrstva', () => {
  assert.ok(Object.keys(real.layers).length > 0);
  assert.deepEqual(blockProblems(real), []);
});

test('importy medzi domovmi vrstiev neprekračujú forbid', () => {
  assert.deepEqual(violations(ROOT, real), []);
});

// ---- the parser and the checker on fixtures ----

const FAKE = `---
layers:
  low:   ["lib/low/**"]
  high:  ["lib/high/**"]

dependencies:
  allow:
    - high -> low
  forbid:
    - low -> high
---

# prose
`;

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hranice-'));
  for (const [p, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), body);
  }
  return dir;
}

test('parser číta vrstvy, allow a forbid', () => {
  const b = parseBlock(FAKE);
  assert.deepEqual(b.layers, { low: ['lib/low/**'], high: ['lib/high/**'] });
  assert.deepEqual(b.allow, [['high', 'low']]);
  assert.deepEqual(b.forbid, [['low', 'high']]);
  assert.deepEqual(blockProblems(b), []);
});

test('parser odmietne riadok mimo známych tvarov', () => {
  assert.throws(() => parseBlock('---\nlayers:\n  a: x\n---\n'), /nečitateľné/);
});

test('úplnosť: chýbajúca, zdvojená a neznáma hrana', () => {
  const b = parseBlock(FAKE);
  assert.deepEqual(blockProblems({ ...b, forbid: [] }), ['low -> high chýba v allow aj forbid']);
  assert.deepEqual(blockProblems({ ...b, allow: [['high', 'low'], ['low', 'high']] }),
    ['low -> high je uvedená 2× (allow, forbid)']);
  assert.match(blockProblems({ ...b, allow: [...b.allow, ['high', 'ghost']] }).join('\n'), /neznámu vrstvu ghost/);
});

test('checker nájde zakázaný import, prepustí povolený a ignoruje plochý strom', () => {
  const dir = fixture({
    'lib/low/a.js': "import { x } from '../high/b.js';\nexport const y = 1;\n",
    'lib/high/b.js': "import { y } from '../low/a.js';\nimport '../../flat.js';\nexport const x = 2;\n",
    'flat.js': "import { x } from './lib/high/b.js';\n",
  });
  try {
    assert.deepEqual(violations(dir, parseBlock(FAKE)),
      ["lib/low/a.js:1: low -> high je vo forbid (import '../high/b.js')"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checker nájde dynamický import, export-from a viacriadkový import; komentár nie', () => {
  const dir = fixture({
    'lib/high/index.js': 'export const x = 2;\n',
    'lib/low/a.js': [
      "// import { x } from '../high/index.js';",
      'export const y = 1;',
      "const m = await import('../high/index.js');",
      "export { x } from '../high';",
      'import {',
      '  x as z,',
      "} from '../high/index.js';",
    ].join('\n'),
  });
  try {
    assert.deepEqual(violations(dir, parseBlock(FAKE)), [
      "lib/low/a.js:3: low -> high je vo forbid (import '../high/index.js')",
      "lib/low/a.js:4: low -> high je vo forbid (import '../high')",
      "lib/low/a.js:5: low -> high je vo forbid (import '../high/index.js')",
    ]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
