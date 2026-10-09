// Generátor Brnos Aires — phase 4 UI. One top bar, one canvas, no modes.
// The whole spec lives in a single object; every change re-renders the sheet
// through the composition engine (debounced) and persists to localStorage.

import * as engine from './engine.js';
import { TYPES, buildShape, defaultParams, computeAxes, paramSpec, proporcie } from '../core/index.js';
import { maxVelkost } from '../core/kompozicia/velkost.js';
import { createViewer } from './viewer.js';
import {
  exportSvgFile, exportPngFile, exportAvifFile, avifSupported,
  rasterDimensions, download, fontUrlsAbsolute,
} from './export.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const LS_KEY = 'brnosaires-generator-spec-v1';
const MM_TO_PX = 96 / 25.4; // CSS px per mm at zoom 100 %
const ZOOM_STEPS = [25, 33, 50, 67, 75, 90, 100, 125, 150, 200];

const FORMAT_PRESETS = {
  A2: { sirka: 420, vyska: 594, jednotka: 'mm', dpi: 300, spadavka: 3 },
  A3: { sirka: 297, vyska: 420, jednotka: 'mm', dpi: 300, spadavka: 3 },
  IG: { sirka: 1080, vyska: 1350, jednotka: 'px', dpi: 72, spadavka: 0 },
  web: { sirka: 1200, vyska: 630, jednotka: 'px', dpi: 72, spadavka: 0 },
};

const SPRAVANIE = [
  ['prazdna', 'prázdna'],
  ['presah', 'presah'],
  ['okraj', 'okraj'],
];

// ---------- state ----------

let spec = loadSpec();
let result = null; // last good komponuj() output
let view = { s: 1, vbX: 0, vbY: 0, bleedD: 0, cols: 8, rowsD: 0 };
let zoomPct = 75;
let selected = -1;
let editorOpen = false;
let photoPan = false;
let dragging = null;

const overlay = $('#overlay');
const svgHost = $('#svg-host');
const zonesHost = $('#zones');
const gridLines = $('#grid-lines');
const bleedMark = $('#bleed-mark');
const zoneBar = $('#zone-bar');

function loadSpec() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // types and settings dropped from the set (koleno, bod, retazenie,
      // rozlozenie) must not discard the saved state
      if (saved?.kompozicia) zahodZastarane(saved.kompozicia);
      return engine.normalizujSpec(saved);
    }
  } catch (err) {
    console.warn('Uložený stav sa nepodarilo načítať, začínam odznova.', err);
  }
  try {
    return engine.normalizujSpec({});
  } catch (err) {
    console.error(err);
    return null;
  }
}

let saveTimer = 0;
function saveLocal() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(spec));
    } catch {
      // private mode or full storage: working in memory is enough
    }
  }, 400);
}

// ---------- render pipeline ----------

let renderTimer = 0;
let posledneVarovanie = '';
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 50);
}

// Keeps every zone inside the format (a smaller format or grid would leave
// it hanging over the edge, which the engine rejects).
function vmestiZony() {
  const f = spec.format, cols = spec.grid.stlpce;
  const rows = Math.max(1, Math.floor((f.vyska * cols) / f.sirka + 1e-6));
  for (const z of spec.zony) {
    z.w = clamp(z.w, 1, cols);
    z.h = clamp(z.h, 1, rows);
    z.x = clamp(z.x, 0, cols - z.w);
    z.y = clamp(z.y, 0, rows - z.h);
  }
}

function render() {
  vmestiZony();
  try {
    result = engine.komponuj(spec, { fontUrls: fontUrlsAbsolute() });
  } catch (err) {
    toast(err.message || String(err));
    return; // keep the last good sheet on screen
  }
  mountSvg(result.svg);
  relayout();
  syncBar();
  // a warning shows once, not again on every slider step that keeps it
  const varovanie = result.varovania.join(' ');
  if (varovanie && varovanie !== posledneVarovanie) toast(varovanie, 5000);
  posledneVarovanie = varovanie;
  saveLocal();
}

function mountSvg(svgString) {
  svgHost.innerHTML = svgString;
  const svgEl = svgHost.querySelector('svg');
  svgEl.style.width = '100%';
  svgEl.style.height = '100%';
  return svgEl;
}

function layoutSheet(svgEl) {
  const f = spec.format, g = spec.grid;
  const dielikUnits = f.sirka / g.stlpce; // mm or px per dielik
  const unitPx = f.jednotka === 'mm' ? MM_TO_PX : 1;
  const s = dielikUnits * unitPx * zoomPct / 100; // screen px per dielik
  const vb = svgEl.viewBox.baseVal;
  $('#sheet').style.width = `${Math.round(vb.width * s)}px`;
  $('#sheet').style.height = `${Math.round(vb.height * s)}px`;
  document.body.classList.toggle('inverted', spec.inverzia);
  view = {
    s, vbX: vb.x, vbY: vb.y,
    bleedD: f.spadavka / dielikUnits,
    cols: g.stlpce,
    rowsD: f.vyska / dielikUnits,
  };
}

function dielikPx() { return view.s; }

// Cursor position in dieliks, relative to the trimmed format origin.
// The viewBox starts one bleed left of the format (vbX = -bleedD), so a
// client point maps to dieliks by adding vbX, never by adding the bleed.
function cursorDieliks(e) {
  const r = overlay.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) / view.s + view.vbX,
    y: (e.clientY - r.top) / view.s + view.vbY,
  };
}

function zoneRectPx(z) {
  const off = -view.vbX;
  const offY = -view.vbY;
  return {
    left: (z.x + off) * view.s,
    top: (z.y + offY) * view.s,
    width: z.w * view.s,
    height: z.h * view.s,
  };
}

function maxCellY(h) {
  return Math.max(0, Math.floor(view.rowsD - h));
}


// ---------- overlay ----------

function drawOverlay() {
  overlay.style.setProperty('--dielik-px', `${view.s}px`);
  // the dielik grid starts one bleed inside the sheet (at the trimmed format)
  overlay.style.setProperty('--grid-ox', `${-view.vbX * view.s}px`);
  overlay.style.setProperty('--grid-oy', `${-view.vbY * view.s}px`);

  // Bleed: always faintly marked, inset from the sheet edge.
  const bi = view.bleedD * view.s;
  bleedMark.style.left = `${bi}px`;
  bleedMark.style.top = `${bi}px`;
  bleedMark.style.right = `${bi}px`;
  bleedMark.style.bottom = `${bi}px`;

  zonesHost.replaceChildren();
  spec.zony.forEach((z, i) => {
    const div = document.createElement('div');
    div.className = 'zone' + (i === selected ? ' sel' : '') + (z.typ === 'prazdna' ? ' prazdna' : '');
    if (i === selected && z.typ === 'fotka' && photoPan) div.classList.add('photo-pan');
    Object.assign(div.style, styleRect(zoneRectPx(z)));
    div.dataset.i = String(i);
    if (z.typ === 'prazdna') {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Dvojklik pre text alebo pretiahni fotku';
      div.append(hint);
    }
    if (i === selected) {
      for (const corner of ['tl', 'tr', 'bl', 'br']) {
        const handle = document.createElement('div');
        handle.className = `handle ${corner}`;
        handle.dataset.corner = corner;
        div.append(handle);
      }
    }
    zonesHost.append(div);
  });

  drawZoneBar();
  positionEditor();
}

function styleRect(r) {
  return {
    left: `${r.left}px`, top: `${r.top}px`,
    width: `${r.width}px`, height: `${r.height}px`,
  };
}

function drawZoneBar() {
  if (selected < 0 || !spec.zony[selected]) {
    zoneBar.hidden = true;
    return;
  }
  const z = spec.zony[selected];
  zoneBar.hidden = false;
  // rebuilding the bar while one of its fields has focus (every render
  // redraws the overlay) would throw away what the designer is typing
  const key = `${selected}:${z.typ}:${photoPan}`;
  if (zoneBar.dataset.key === key && zoneBar.contains(document.activeElement)) {
    placeZoneBar(z);
    return;
  }
  zoneBar.dataset.key = key;
  zoneBar.replaceChildren();

  const makeSelect = (label, options, value, onInput) => {
    const wrap = document.createElement('label');
    wrap.append(label + ' ');
    const select = document.createElement('select');
    for (const [val, name] of options) {
      const option = document.createElement('option');
      option.value = val;
      option.textContent = name;
      select.append(option);
    }
    select.value = value;
    select.addEventListener('input', () => { onInput(select.value); scheduleRender(); });
    wrap.append(select);
    return wrap;
  };

  const makeNumber = (label, value, attrs, onInput) => {
    const wrap = document.createElement('label');
    wrap.append(label + ' ', numberInput(value, attrs, onInput));
    return wrap;
  };

  if (z.typ === 'text') {
    zoneBar.append(
      makeSelect('Písmo', [['Brnos Aires', 'Brnos Aires'], ['Nunito', 'Nunito']], z.pismo,
        (v) => { z.pismo = v; positionEditor(); }),
      // whole percent of a dielik (the core takes 0.1–20 dielika)
      makeNumber('Veľkosť %', Math.round(z.velkost * 100), { min: 10, max: 2000, step: 1 },
        (v) => { z.velkost = v / 100; positionEditor(); }),
      makeSelect('Zarovnanie', [['vlavo', 'vľavo'], ['stred', 'na stred'], ['vpravo', 'vpravo']],
        z.zarovnanie, (v) => { z.zarovnanie = v; }),
      makeSelect('Správanie', SPRAVANIE, z.spravanie, (v) => { z.spravanie = v; }),
    );
  } else if (z.typ === 'fotka') {
    zoneBar.append(
      makeSelect('Režim', [['ramik', 'rámik'], ['maska', 'maska'], ['prekrytie', 'prekrytie']],
        z.rezim, (v) => { z.rezim = v; }),
      makeSelect('Správanie', SPRAVANIE, z.spravanie, (v) => { z.spravanie = v; }),
    );
    if (photoPan) {
      const note = document.createElement('span');
      note.textContent = 'Posun fotky: ťahaj, kolieskom zoom';
      zoneBar.append(note);
    }
  }

  const del = document.createElement('button');
  del.className = 'del';
  del.title = 'Zmazať zónu';
  del.textContent = '✕';
  del.addEventListener('click', () => deleteZone(selected));
  zoneBar.append(del);
  placeZoneBar(z);
}

// Place under the zone, above when there is no room.
function placeZoneBar(z) {
  const r = zoneRectPx(z);
  zoneBar.style.left = '0px';
  zoneBar.style.top = '0px';
  const bw = zoneBar.offsetWidth;
  const bh = zoneBar.offsetHeight;
  const ow = overlay.clientWidth;
  const oh = overlay.clientHeight;
  let left = clamp(r.left, 0, Math.max(0, ow - bw));
  let top = r.top + r.height + 8;
  if (top + bh > oh) top = r.top - bh - 8;
  zoneBar.style.left = `${Math.max(0, left)}px`;
  zoneBar.style.top = `${Math.max(0, top)}px`;
}

function selectZone(i) {
  selected = i;
  photoPan = false;
  drawOverlay();
}

function deleteZone(i) {
  if (i < 0 || i >= spec.zony.length) return;
  closeEditor();
  spec.zony.splice(i, 1);
  selected = -1;
  scheduleRender();
}

// ---------- pointer interactions on the canvas ----------

overlay.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('#zone-bar, #text-editor')) return;
  const handle = e.target.closest('.handle');
  const zoneDiv = e.target.closest('.zone');
  const pos = cursorDieliks(e);

  if (handle) {
    const i = Number(handle.closest('.zone').dataset.i);
    selected = i;
    dragging = { kind: 'resize', corner: handle.dataset.corner, i };
    gridLines.hidden = false;
    overlay.setPointerCapture(e.pointerId);
    drawOverlay();
    return;
  }

  if (zoneDiv) {
    const i = Number(zoneDiv.dataset.i);
    const z = spec.zony[i];
    if (isDoublePress(e, i)) {
      e.preventDefault(); // keep the focus in the text editor it opens
      zoneDoubleClick(i);
      return;
    }
    if (selected !== i) photoPan = false;
    selected = i;
    if (z.typ === 'fotka' && photoPan) {
      dragging = {
        kind: 'photo-pan', i,
        start: pos, posun: [...z.posun],
      };
      zoneDiv.classList.add('dragging-photo');
    } else {
      dragging = {
        kind: 'move', i,
        grabX: pos.x - z.x, grabY: pos.y - z.y,
        moved: false,
      };
    }
    gridLines.hidden = false;
    overlay.setPointerCapture(e.pointerId);
    drawOverlay();
    return;
  }

  // Empty space: start creating a zone (a plain click only deselects).
  lastPress = null;
  closeEditor();
  selected = -1;
  const cell = {
    x: clamp(Math.floor(pos.x), 0, view.cols),
    y: clamp(Math.floor(pos.y), 0, Math.floor(view.rowsD)),
  };
  dragging = { kind: 'create', start: cell };
  gridLines.hidden = false;
  overlay.setPointerCapture(e.pointerId);
  drawOverlay();
});

overlay.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const pos = cursorDieliks(e);
  const posCell = {
    x: clamp(Math.floor(pos.x), 0, view.cols),
    y: clamp(Math.floor(pos.y), 0, Math.floor(view.rowsD)),
  };
  // a resized edge snaps to the nearest grid line, not to the cell's start
  const posLine = {
    x: clamp(Math.round(pos.x), 0, view.cols),
    y: clamp(Math.round(pos.y), 0, Math.floor(view.rowsD)),
  };

  if (dragging.kind === 'create') {
    const rect = rectFromCells(dragging.start, posCell);
    let ghost = $('#zone-create-ghost');
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.id = 'zone-create-ghost';
      overlay.append(ghost);
    }
    Object.assign(ghost.style, styleRect({
      left: (rect.x - view.vbX) * view.s,
      top: (rect.y - view.vbY) * view.s,
      width: rect.w * view.s,
      height: rect.h * view.s,
    }));
    return;
  }

  const z = spec.zony[dragging.i];
  if (!z) return;

  if (dragging.kind === 'move') {
    dragging.moved = true;
    z.x = clamp(Math.round(pos.x - dragging.grabX), 0, view.cols - z.w);
    z.y = clamp(Math.round(pos.y - dragging.grabY), 0, maxCellY(z.h));
  } else if (dragging.kind === 'resize') {
    const l = { x: z.x, y: z.y };
    const r = { x: z.x + z.w, y: z.y + z.h };
    const c = dragging.corner;
    if (c.includes('l')) l.x = clamp(posLine.x, 0, r.x - 1);
    if (c.includes('r')) r.x = clamp(posLine.x, l.x + 1, view.cols);
    if (c.includes('t')) l.y = clamp(posLine.y, 0, r.y - 1);
    if (c.includes('b')) r.y = clamp(posLine.y, l.y + 1, Math.floor(view.rowsD));
    z.x = l.x; z.y = l.y; z.w = r.x - l.x; z.h = r.y - l.y;
    if (editorOpen) positionEditor();
  } else if (dragging.kind === 'photo-pan') {
    z.posun = [
      dragging.posun[0] + (pos.x - dragging.start.x),
      dragging.posun[1] + (pos.y - dragging.start.y),
    ];
  }

  const div = zonesHost.querySelector(`.zone[data-i="${dragging.i}"]`);
  if (div) Object.assign(div.style, styleRect(zoneRectPx(z)));
  drawZoneBar();
});

function rectFromCells(a, b) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
  };
}

overlay.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  const d = dragging;
  dragging = null;
  gridLines.hidden = true;
  $('#zone-create-ghost')?.remove();

  if (d.kind === 'create') {
    const pos = cursorDieliks(e);
    const rect = rectFromCells(d.start, {
      x: clamp(Math.floor(pos.x), 0, view.cols),
      y: clamp(Math.floor(pos.y), 0, Math.floor(view.rowsD)),
    });
    if (rect.w >= 1 && rect.h >= 1) {
      rect.w = Math.min(rect.w, view.cols - rect.x);
      rect.h = Math.min(rect.h, Math.floor(view.rowsD) - rect.y);
      spec.zony.push({ typ: 'prazdna', spravanie: 'prazdna', ...rect });
      selected = spec.zony.length - 1;
      drawOverlay(); // show the new zone now, the sheet follows after recomposing
      scheduleRender();
    }
    return;
  }

  if (d.kind === 'photo-pan') {
    zonesHost.querySelector(`.zone[data-i="${d.i}"]`)?.classList.remove('dragging-photo');
  }
  // a plain click only selects: nothing changed, no need to recompose
  if (d.kind === 'move' && !d.moved) return;
  scheduleRender();
});

overlay.addEventListener('pointercancel', () => {
  dragging = null;
  gridLines.hidden = true;
  $('#zone-create-ghost')?.remove();
  scheduleRender();
});

function zoneAt(pos) {
  for (let i = spec.zony.length - 1; i >= 0; i--) {
    const z = spec.zony[i];
    if (pos.x >= z.x && pos.x < z.x + z.w && pos.y >= z.y && pos.y < z.y + z.h) return i;
  }
  return -1;
}

// The zone divs are rebuilt on every pointerdown and the pointer is captured
// by the overlay, so the browser never fires click/dblclick on a zone. The
// second press on the same zone within the double-click time counts instead.
let lastPress = null;
function isDoublePress(e, i) {
  const prev = lastPress;
  lastPress = { t: e.timeStamp, x: e.clientX, y: e.clientY, i };
  if (!prev || prev.i !== i || e.timeStamp - prev.t > 500
    || Math.abs(e.clientX - prev.x) > 6 || Math.abs(e.clientY - prev.y) > 6) return false;
  lastPress = null;
  return true;
}

// Double-click: text zone opens the editor, photo zone toggles pan/zoom.
function zoneDoubleClick(i) {
  const z = spec.zony[i];
  if (!z) return;
  if (z.typ === 'text') {
    openEditor(i);
  } else if (z.typ === 'prazdna') {
    zoneToText(i, 'Enter');
  } else if (z.typ === 'fotka') {
    photoPan = !photoPan;
    drawOverlay();
    if (photoPan) toast('Úprava fotky: ťahaj pre posun, kolieskom zoom, dvojklik ukončí.', 4000);
  }
}

// Wheel zooms the photo while its pan mode is on.
overlay.addEventListener('wheel', (e) => {
  if (!photoPan || selected < 0) return;
  const z = spec.zony[selected];
  if (!z || z.typ !== 'fotka') return;
  e.preventDefault();
  z.zoom = clamp(z.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.2, 8);
  scheduleRender();
}, { passive: false });

// ---------- dropping photos ----------

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Súbor sa nepodarilo prečítať.'));
    reader.readAsDataURL(file);
  });
}

overlay.addEventListener('dragover', (e) => e.preventDefault());

overlay.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (!file) {
    toast('Pretiahni obrázkový súbor (JPG, PNG, WebP…).');
    return;
  }
  const pos = cursorDieliks(e);
  const cell = {
    x: clamp(Math.floor(pos.x), 0, view.cols - 1),
    y: clamp(Math.floor(pos.y), 0, maxCellY(1)),
  };
  const hit = zoneAt(pos);

  try {
    const zdroj = await readImageFile(file);
    if (hit >= 0) {
      const z = spec.zony[hit];
      Object.assign(z, { typ: 'fotka', zdroj, rezim: 'ramik', posun: [0, 0], zoom: 1 });
      selected = hit;
    } else {
      // a 4 × 3 frame, moved inwards when dropped near the edge
      const rows = Math.max(1, Math.floor(view.rowsD));
      const w = Math.min(4, view.cols);
      const h = Math.min(3, rows);
      spec.zony.push({
        typ: 'fotka', x: clamp(cell.x, 0, view.cols - w), y: clamp(cell.y, 0, rows - h), w, h, spravanie: 'prazdna',
        zdroj, rezim: 'ramik', posun: [0, 0], zoom: 1,
      });
      selected = spec.zony.length - 1;
    }
    scheduleRender();
  } catch (err) {
    toast(err.message);
  }
});

// ---------- inline text editing ----------

function zoneToText(i, firstKey) {
  const z = spec.zony[i];
  z.typ = 'text';
  z.text = firstKey === 'Enter' ? '' : firstKey;
  z.pismo = 'Brnos Aires';
  z.velkost = Math.min(1.2, Math.max(0.4, z.h - 0.3));
  z.zarovnanie = 'vlavo';
  z.riadkovanie = 1.1;
  openEditor(i);
}

function openEditor(i) {
  const z = spec.zony[i];
  if (!z || z.typ !== 'text') return;
  selected = i;
  editorOpen = true;
  let ta = document.getElementById('text-editor');
  if (!ta) {
    ta = document.createElement('textarea');
    ta.id = 'text-editor';
    ta.spellcheck = false;
    ta.addEventListener('input', () => {
      z.text = ta.value;
      scheduleRender();
    });
    ta.addEventListener('blur', (e) => {
      // Clicking a control in the zone bar must not close the editor.
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#zone-bar')) return;
      closeEditor();
    });
    overlay.append(ta);
  }
  positionEditor();
  ta.value = z.text;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  drawOverlay();
}

// The sheet's text layer puts the first baseline riadokPrvy · font-size under
// the zone top; a textarea puts its first line half-leading + ascent under the
// top of its box, which depends on the font's own metrics. The offset is
// measured live in a hidden mirror with the exact styles the editor gets
// (a zero-size inline-block starts a line and sits with its bottom edge on
// the baseline), never assumed from a formula.
const FONT_FEATURES = "'liga', 'ss01'"; // the sheet's <text> sets the same

const baselineCache = new Map();
const warmedFonts = new Set();
let metricBox = null;

function firstBaselineOffset(family, fontPx, riadkovanie) {
  const key = `${family}|${fontPx}|${riadkovanie}`;
  if (baselineCache.has(key)) return baselineCache.get(key);
  if (!metricBox) {
    const box = document.createElement('div');
    box.id = 'text-metrics';
    const mark = document.createElement('span');
    box.append(mark, 'Hx');
    document.body.append(box);
    metricBox = { box, mark };
  }
  const { box, mark } = metricBox;
  box.style.fontFamily = family;
  box.style.fontSize = `${fontPx}px`;
  box.style.lineHeight = String(riadkovanie);
  box.style.fontFeatureSettings = FONT_FEATURES;
  const offset = mark.getBoundingClientRect().top - box.getBoundingClientRect().top;
  baselineCache.set(key, offset);
  const shorthand = `${fontPx}px ${family}`;
  if (!warmedFonts.has(shorthand)) {
    // until the webfont loads the mirror reports the fallback's metrics;
    // re-measure and re-place once it is ready
    warmedFonts.add(shorthand);
    document.fonts.load(shorthand, 'Hx')
      .then(() => { baselineCache.clear(); positionEditor(); })
      .catch(() => {});
  }
  return offset;
}

function positionEditor() {
  const ta = document.getElementById('text-editor');
  if (!ta || selected < 0) return;
  const z = spec.zony[selected];
  if (!z || z.typ !== 'text') return;
  const r = zoneRectPx(z);
  const fontPx = z.velkost * dielikPx();
  const family = z.pismo === 'Brnos Aires' ? "'Brnos Aires', serif" : "'Nunito', sans-serif";
  ta.style.fontFamily = family;
  ta.style.fontSize = `${fontPx}px`;
  ta.style.lineHeight = String(z.riadkovanie);
  ta.style.textAlign = z.zarovnanie === 'stred' ? 'center' : (z.zarovnanie === 'vpravo' ? 'right' : 'left');
  ta.style.fontFeatureSettings = FONT_FEATURES;
  // The box is shifted so the two first baselines meet (padding cannot go
  // negative); the 1 px border grows the box around the zone instead of
  // pushing the text, so the content box stays exactly on the zone rect and
  // wrapping, size and alignment match the sheet line for line.
  const baselinePx = z.velkost * proporcie.kompozicia.svg.riadokPrvy * dielikPx();
  const top = r.top + baselinePx - firstBaselineOffset(family, fontPx, z.riadkovanie) - 1;
  ta.style.left = `${r.left - 1}px`;
  ta.style.top = `${top}px`;
  ta.style.width = `${r.width + 2}px`;
  ta.style.height = `${Math.max(2, r.top + r.height + 1 - top)}px`;
}

function closeEditor() {
  // removing a focused textarea fires blur, which would re-enter here and
  // tear the node down a second time; the flag says it is already closing
  if (!editorOpen) return;
  editorOpen = false;
  const ta = document.getElementById('text-editor');
  if (!ta) return;
  if (selected >= 0 && spec.zony[selected]) {
    const z = spec.zony[selected];
    if (z.typ === 'text' && !z.text) {
      // Nothing was written: the zone goes back to being empty.
      z.typ = 'prazdna';
      delete z.text; delete z.pismo; delete z.velkost;
      delete z.zarovnanie; delete z.riadkovanie;
    }
  }
  ta.remove();
  scheduleRender();
}

// ---------- top bar ----------

function syncBar() {
  const f = spec.format, g = spec.grid;
  $('#btn-format').textContent = `${f.sirka} × ${f.vyska} ${f.jednotka} · Grid ${g.stlpce} ▾`;
  const input = $('#variant-input');
  if (document.activeElement !== input) input.value = spec.variant;
}

function setVariant(value) {
  spec.variant = String(value);
  syncBar();
  scheduleRender();
}

function stepVariant(delta) {
  const n = parseInt(spec.variant, 10);
  setVariant(Number.isFinite(n) ? Math.max(1, n + delta) : 42);
}

$('#variant-prev').addEventListener('click', () => stepVariant(-1));
$('#variant-next').addEventListener('click', () => stepVariant(1));
$('#variant-random').addEventListener('click', () => setVariant(1 + Math.floor(Math.random() * 999)));
$('#variant-input').addEventListener('change', (e) => {
  setVariant(e.target.value.trim() || '1');
  e.target.blur();
});

// ---------- popovers ----------

const popovers = [];

function closePopovers() {
  for (const p of popovers) p.close();
}

function attachPopover(btn, buildContent) {
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.hidden = true;
  document.body.append(pop);
  const api = {
    close() {
      pop.hidden = true;
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    },
    toggle() {
      const willOpen = pop.hidden;
      closePopovers();
      if (willOpen) {
        buildContent(pop);
        pop.hidden = false;
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        // Align to the button, clamped to the viewport; below the top bar,
        // which wraps to more rows in a narrow window.
        const r = btn.getBoundingClientRect();
        const top = $('#topbar').getBoundingClientRect().bottom;
        pop.style.top = `${top}px`;
        pop.style.maxHeight = `${window.innerHeight - top - 8}px`;
        pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 12))}px`;
      }
    },
    isOpen: () => !pop.hidden,
    btn,
  };
  btn.addEventListener('click', () => api.toggle());
  popovers.push(api);
  return api;
}

// A press outside closes the open popover. A press on the open popover's own
// button is left to its click handler, which toggles it shut; closing it here
// first would let that click open it again.
document.addEventListener('pointerdown', (e) => {
  if (!popovers.some((p) => p.isOpen()) || e.target.closest('.popover')) return;
  if (popovers.some((p) => p.isOpen() && p.btn.contains(e.target))) return;
  closePopovers();
}, true);

function row(label, control) {
  const div = document.createElement('div');
  div.className = 'row';
  const l = document.createElement('label');
  l.textContent = label;
  div.append(l, control);
  return div;
}

function numberInput(value, attrs, onInput) {
  const input = document.createElement('input');
  input.type = 'number';
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, String(v));
  input.value = String(value);
  let posledne = value;
  // fields with step 1 take whole numbers only: a typed decimal is rounded
  const cele = String(attrs.step) === '1';
  if (cele) input.setAttribute('inputmode', 'numeric');
  // committed on change (spinner click, leaving the field), not per
  // keystroke: typing "12" must not render the sheet with Grid 1 on the way
  input.addEventListener('change', () => {
    let n = Number(input.value);
    if (!Number.isFinite(n) || input.value === '') {
      input.value = String(posledne); // an emptied field goes back
      return;
    }
    if (cele) n = Math.round(n);
    // out-of-range values snap to the field's limits instead of failing later
    n = clamp(n, attrs.min ?? -Infinity, attrs.max ?? Infinity);
    if (String(n) !== input.value) input.value = String(n);
    posledne = n;
    onInput(n);
    scheduleRender();
  });
  return input;
}

function selectInput(options, value, onInput) {
  const select = document.createElement('select');
  for (const [val, name] of options) {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = name;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('input', () => { onInput(select.value); scheduleRender(); });
  return select;
}

// the size slider of a type ends where its parameters would leave their
// limits (kruh: priemer = 0.8 · s ≤ 20, so s ≤ 25)
function maxVelkostTypu(typ) {
  return maxVelkost(typ, paramSpec(typ), proporcie.kompozicia.velkostTvaru);
}

// drops settings and types the generator no longer knows; older `typy`
// lists are converted to pomery by the core
function zahodZastarane(k) {
  delete k.retazenie;
  delete k.rozlozenie;
  delete k.akcentyNaRetaz;
  delete k.variacia;
  const spojky = proporcie.kompozicia.rozmiestnenie.retazenie.spojky;
  const zname = (t) => TYPES.some((x) => x.id === t) && !spojky.includes(t);
  if (Array.isArray(k.typy)) k.typy = k.typy.filter(zname);
  // sizes may keep connectors, only ids missing from TYPES are dropped
  if (k.velkosti && typeof k.velkosti === 'object' && !Array.isArray(k.velkosti)) {
    k.velkosti = Object.fromEntries(Object.entries(k.velkosti).filter(([t]) => TYPES.some((x) => x.id === t)));
    // a range saved before the per-type limit (kruh up to 40) is pulled in
    for (const [t, v] of Object.entries(k.velkosti)) {
      if (Array.isArray(v) && v.length === 2) k.velkosti[t] = v.map((x) => clamp(x, 1, maxVelkostTypu(t)));
    }
  }
  if (k.pomery && typeof k.pomery === 'object') {
    k.pomery = Object.fromEntries(Object.entries(k.pomery).filter(([t]) => zname(t)));
    const spolu = Object.values(k.pomery).reduce((a, v) => a + v, 0);
    if (spolu && spolu !== 100) k.pomery = naSto(k.pomery);
  }
}

// Integer percentages summing to exactly 100, proportional to the values
// (all equal when every value is 0); the rounding remainder goes to the
// largest fractions.
function naSto(vahy, spolu = 100) {
  const typy = Object.keys(vahy);
  const suma = typy.reduce((a, t) => a + vahy[t], 0);
  const presne = typy.map((t) => (suma ? vahy[t] / suma : 1 / typy.length) * spolu);
  const out = Object.fromEntries(typy.map((t, i) => [t, Math.floor(presne[i])]));
  let zvysok = spolu - Object.values(out).reduce((a, v) => a + v, 0);
  const poradie = typy.map((t, i) => [t, presne[i] - out[t]]).sort((a, b) => b[1] - a[1]);
  for (let i = 0; zvysok > 0; i = (i + 1) % poradie.length, zvysok--) out[poradie[i][0]]++;
  return out;
}

// Sets one type's share and spreads the rest of 100 % over the other types
// in proportion to their current shares.
function rozdelPomery(pomery, id, v) {
  const ostatne = Object.fromEntries(Object.entries(pomery).filter(([t]) => t !== id));
  Object.assign(pomery, naSto(ostatne, 100 - v), { [id]: v });
}

function sliderRow(label, value, onInput) {
  const div = document.createElement('div');
  div.className = 'row';
  const wrap = document.createElement('div');
  wrap.className = 'grow';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = String(value);
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = String(value);
  range.addEventListener('input', () => {
    num.textContent = range.value;
    onInput(Number(range.value));
    scheduleRender();
  });
  const l = document.createElement('label');
  l.textContent = label;
  div.append(l, wrap);
  wrap.append(range, num);
  return div;
}

// dual-thumb slider: two overlaid ranges share one track; `value` ([lo, hi])
// is updated in place and the thumbs push each other instead of crossing
function rangeSlider(value, { min, max }, onChange) {
  const mkRange = () => {
    const r = document.createElement('input');
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = '1';
    return r;
  };
  const lo = mkRange(), hi = mkRange();
  value[0] = clamp(value[0], min, max);
  value[1] = clamp(value[1], value[0], max);
  const track = document.createElement('div');
  track.className = 'range2';
  const num = document.createElement('span');
  num.className = 'num';
  const sync = () => {
    lo.value = String(value[0]);
    hi.value = String(value[1]);
    num.textContent = `${value[0]}–${value[1]}`;
    const frac = (v) => (v - min) / (max - min);
    track.style.setProperty('--lo', String(frac(value[0])));
    track.style.setProperty('--hi', String(frac(value[1])));
  };
  const changed = () => {
    sync();
    if (onChange) onChange();
    scheduleRender();
  };
  lo.addEventListener('input', () => {
    value[0] = Math.min(Number(lo.value), value[1]);
    changed();
  });
  hi.addEventListener('input', () => {
    value[1] = Math.max(Number(hi.value), value[0]);
    changed();
  });
  // the grabbed thumb moves above the other so it can be pulled apart again
  const raise = (top, other) => { top.style.zIndex = '2'; other.style.zIndex = '1'; };
  lo.addEventListener('pointerdown', () => raise(lo, hi));
  hi.addEventListener('pointerdown', () => raise(hi, lo));
  sync();
  track.append(lo, hi);
  const wrap = document.createElement('div');
  wrap.className = 'range2-row';
  wrap.append(track, num);
  return wrap;
}

// ----- format popover -----

attachPopover($('#btn-format'), (pop) => {
  const f = spec.format, g = spec.grid;

  const presets = document.createElement('div');
  presets.className = 'presets';
  for (const name of Object.keys(FORMAT_PRESETS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.addEventListener('click', () => {
      Object.assign(spec.format, FORMAT_PRESETS[name]);
      closePopovers();
      scheduleRender();
    });
    presets.append(b);
  }

  const h3a = document.createElement('h3');
  h3a.textContent = 'Formát';
  const h3b = document.createElement('h3');
  h3b.textContent = 'Mriežka';

  const sizeWrap = document.createElement('div');
  sizeWrap.className = 'grow';
  sizeWrap.append(
    numberInput(f.sirka, { min: 10, max: 20000, step: 1 }, (v) => { spec.format.sirka = v; }),
    Object.assign(document.createElement('span'), { textContent: '×' }),
    numberInput(f.vyska, { min: 10, max: 20000, step: 1 }, (v) => { spec.format.vyska = v; }),
    selectInput([['mm', 'mm'], ['px', 'px']], f.jednotka, (v) => { spec.format.jednotka = v; }),
  );

  pop.replaceChildren(
    h3a,
    row('Predvoľba', presets),
    row('Rozmer', sizeWrap),
    row('DPI', numberInput(f.dpi, { min: 18, max: 2400, step: 1 }, (v) => { spec.format.dpi = v; })),
    row('Spadávka', numberInput(f.spadavka, { min: 0, max: 50, step: 1 }, (v) => { spec.format.spadavka = v; })),
    h3b,
    row('Grid', numberInput(g.stlpce, { min: 1, max: 100, step: 1 }, (v) => {
      const pomer = clamp(v, 1, 100) / spec.grid.stlpce;
      spec.grid.stlpce = clamp(v, 1, 100);
      // zones are in dielikoch: rescale them so they keep their place
      for (const z of spec.zony) {
        z.x = Math.round(z.x * pomer);
        z.y = Math.round(z.y * pomer);
        z.w = Math.max(1, Math.round(z.w * pomer));
        z.h = Math.max(1, Math.round(z.h * pomer));
      }
    })),
    row('Zvyšok výšky', selectInput(
      [['okraje', 'okraje'], ['natiahnutie', 'natiahnutie'], ['orez', 'presah a orez']],
      g.zvysok, (v) => { spec.grid.zvysok = v; })),
  );

  const actions = document.createElement('div');
  actions.className = 'actions';
  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.textContent = 'Načítať predvoľbu';
  loadBtn.addEventListener('click', () => $('#predvolba-file').click());
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Uložiť predvoľbu';
  saveBtn.addEventListener('click', savePredvolba);
  actions.append(loadBtn, saveBtn);
  pop.append(actions);
});

function savePredvolba() {
  // A preset is the spec without the variant and without the zones.
  const { variant, zony, ...rest } = spec;
  download(
    new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' }),
    'predvolba-generator.json',
  );
  closePopovers();
}

$('#predvolba-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const loaded = JSON.parse(await file.text());
    if (loaded?.kompozicia) zahodZastarane(loaded.kompozicia);
    spec = engine.normalizujSpec({
      ...loaded,
      variant: spec.variant, // a preset never touches the variant
      zony: spec.zony,       // ...nor the zones
    });
    selected = -1;
    closePopovers();
    render();
  } catch (err) {
    toast(`Predvoľbu sa nepodarilo načítať: ${err.message}`);
  }
});

// ----- parametre popover -----

attachPopover($('#btn-parametre'), (pop) => {
  pop.classList.add('wide');
  const k = spec.kresba, c = spec.kompozicia;

  const invLabel = document.createElement('label');
  invLabel.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer';
  const invBox = document.createElement('input');
  invBox.type = 'checkbox';
  invBox.checked = spec.inverzia;
  invBox.addEventListener('change', () => {
    spec.inverzia = invBox.checked;
    scheduleRender();
  });
  invLabel.append(invBox, 'Inverzia (biele na čiernom)');

  const chainWrap = document.createElement('div');
  chainWrap.className = 'grow';
  chainWrap.append(
    rangeSlider(c.retazenieDlzka, { min: 1, max: 50 }),
    Object.assign(document.createElement('span'), { textContent: 'prvkov' }),
  );


  const typesGrid = document.createElement('div');
  typesGrid.className = 'types';
  // each type shows as a small drawing; the name stays as the tooltip. The
  // icons use a heavier fixed Weight and Contrast so thin types stay legible
  // at this size (only Zaoblenie follows the drawing)
  const osi = computeAxes(70, 85, proporcie, spec.kresba.zaoblenie);
  const kresli = engine.renderShapeSvg || engine.renderShapeSvgFallback;
  const cap = (text) => Object.assign(document.createElement('span'), { className: 'cap', textContent: text });
  // connectors (the pätka quarter) switch on by themselves with contrast
  const spojky = proporcie.kompozicia.rozmiestnenie.retazenie.spojky;
  const viditelne = TYPES.filter((x) => !spojky.includes(x.id));
  for (const t of viditelne) c.pomery[t.id] ??= 0;
  const posuvniky = [];
  const obnov = () => {
    for (const { id, range, num, l } of posuvniky) {
      range.value = String(c.pomery[id]);
      num.textContent = `${c.pomery[id]}\u00a0%`;
      l.classList.toggle('vypnuty', c.pomery[id] === 0);
    }
  };
  for (const t of viditelne) {
    const l = document.createElement('label');
    l.title = t.name;
    // the slider sets the type's share of a chain; all shares add up to 100 %
    const pomer = c.pomery[t.id] ?? 0;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.step = '1';
    range.value = String(pomer);
    range.setAttribute('aria-label', t.name);
    const num = document.createElement('span');
    num.className = 'num';
    posuvniky.push({ id: t.id, range, num, l });
    range.addEventListener('input', () => {
      rozdelPomery(c.pomery, t.id, Number(range.value));
      obnov();
      scheduleRender();
    });
    const nahlad = document.createElement('span');
    nahlad.className = 'nahlad';
    nahlad.setAttribute('aria-label', t.name);
    try {
      nahlad.innerHTML = kresli(buildShape(t.id, defaultParams(t.id), osi), { pxPerDielik: 60, margin: 0.12 })
        .replace(/ width="[^"]*" height="[^"]*"/, '');
    } catch {
      nahlad.textContent = t.name;
    }
    const pomerRow = document.createElement('div');
    pomerRow.className = 'subrow';
    pomerRow.append(cap('podiel'), range, num);
    l.append(nahlad, pomerRow);
    if (!c.velkosti[t.id]) c.velkosti[t.id] = [1, 6];
    const sizeRow = document.createElement('div');
    sizeRow.className = 'subrow';
    sizeRow.append(cap('veľkosť'), rangeSlider(c.velkosti[t.id], { min: 1, max: maxVelkostTypu(t.id) }));
    l.append(sizeRow);
    typesGrid.append(l);
  }
  obnov();

  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'Dlaždice zatiaľ fungujú ako voľné rozmiestnenie.';

  const mkH = (text) => {
    const h = document.createElement('h3');
    h.textContent = text;
    return h;
  };

  pop.replaceChildren(
    mkH('Kresba'),
    sliderRow('Weight', k.weight, (v) => { spec.kresba.weight = v; }),
    sliderRow('Contrast', k.contrast, (v) => { spec.kresba.contrast = v; }),
    sliderRow('Zaoblenie', k.zaoblenie, (v) => { spec.kresba.zaoblenie = v; }),
    row('Farby', invLabel),
    mkH('Kompozícia'),
    row('Dĺžka reťaze', chainWrap),
    row('Rozmiestnenie', selectInput(
      [['volne', 'voľné'], ['dlazdice', 'dlaždice']],
      c.rozmiestnenie, (v) => { spec.kompozicia.rozmiestnenie = v; })),
    note,
    mkH('Typy'),
    typesGrid,
  );
});

// ----- export popover -----

const exportPopover = attachPopover($('#btn-export'), (pop) => {
  const { sirkaPx, vyskaPx } = rasterDimensions(spec);
  const mkH = (text) => Object.assign(document.createElement('h3'), { textContent: text });
  const button = (text, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', async () => {
      try {
        await fn();
      } catch (err) {
        toast(`Export sa nepodaril: ${err.message}`);
      }
    });
    return b;
  };

  const svgNote = document.createElement('p');
  svgNote.className = 'note';
  svgNote.textContent = 'Text v SVG zostáva upraviteľný, v krivkách bude neskôr.';

  const pngDims = document.createElement('span');
  pngDims.className = 'note';
  pngDims.textContent = `${sirkaPx} × ${vyskaPx} px`;

  const wrap = document.createElement('div');
  wrap.className = 'presets';
  wrap.append(
    button('Stiahnuť SVG', () => exportSvgFile(spec)),
    button('Stiahnuť PNG', () => exportPngFile(spec)),
  );
  const avifWrap = document.createElement('div');
  avifWrap.className = 'presets';

  pop.replaceChildren(
    mkH('Export'),
    wrap,
    pngDims,
    svgNote,
    avifWrap,
  );

  avifSupported().then((ok) => {
    if (ok) {
      avifWrap.append(button('Stiahnuť AVIF', () => exportAvifFile(spec)));
    }
  });
});

// ---------- zoom ----------

const zoomSelect = $('#zoom');

function fitZoomPct() {
  const vb = svgHost.querySelector('svg')?.viewBox.baseVal;
  if (!vb) return 75;
  const f = spec.format, g = spec.grid;
  const dielikUnits = f.sirka / g.stlpce;
  const unitPx = f.jednotka === 'mm' ? MM_TO_PX : 1;
  const w100 = vb.width * dielikUnits * unitPx;
  const h100 = vb.height * dielikUnits * unitPx;
  const stage = $('#stage');
  const pct = Math.min(
    (stage.clientWidth - 80) / w100,
    (stage.clientHeight - 80) / h100,
  ) * 100;
  return clamp(Math.round(pct), 10, 300);
}

function setZoomOptions() {
  zoomSelect.replaceChildren();
  for (const step of ZOOM_STEPS) {
    const option = document.createElement('option');
    option.value = String(step);
    option.textContent = `${step} %`;
    zoomSelect.append(option);
  }
  const fit = document.createElement('option');
  fit.value = 'fit';
  fit.textContent = 'Prispôsobiť';
  zoomSelect.append(fit);
}

// Sizes the sheet and its overlay for the current zoom. "Prispôsobiť" is
// recomputed every time, so it follows format changes and window resizes.
// Zoom never recomposes: the sheet is only scaled.
function relayout() {
  const svgEl = svgHost.querySelector('svg');
  if (!svgEl) return;
  const fitOption = zoomSelect.querySelector('option[value="fit"]');
  if (zoomSelect.value === 'fit') {
    zoomPct = fitZoomPct();
    // Show the computed percentage in the fit option label.
    fitOption.textContent = `Prispôsobiť (${zoomPct} %)`;
  } else {
    zoomPct = Number(zoomSelect.value);
    fitOption.textContent = 'Prispôsobiť';
  }
  layoutSheet(svgEl);
  drawOverlay();
}

zoomSelect.addEventListener('change', relayout);

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (zoomSelect.value === 'fit') relayout(); }, 100);
});

// ---------- toast ----------

let toastTimer = 0;
function toast(message, ms = 3200) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

const viewer = createViewer(() => spec.kresba);
$('#btn-tvary').addEventListener('click', () => viewer.toggle());

// ---------- boot ----------

if (engine.isStubEngine) $('#stub-note').hidden = false;

setZoomOptions();
zoomSelect.value = 'fit';
render();
