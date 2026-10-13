// Generátor Brnos Aires — phase 4 UI. One top bar, one canvas, no modes.
// The whole spec lives in a single object; every change re-renders the sheet
// through the composition engine (debounced) and persists to localStorage.

import * as engine from './engine.js';
import { TYPES, buildShape, defaultParams, computeAxes, paramSpec, proporcie } from '../core/index.js';
import { featuresPoZmenePisma, fontFeatureSettings, predvoleneFeatures, FONTY } from '../core/kompozicia/features.js';
import {
  faceZony, facesFontov, fontFaceCss, jeVariabilne, osaPisma, predvolenePisma, rezyPisma,
} from '../core/kompozicia/pisma.js';
import { maxVelkost } from '../core/kompozicia/velkost.js';
import { fotkaVRamiku, obdlznikFotky, pritiahniFotku } from '../core/kompozicia/fotka.js';
import { orezoveZnacky, rozmerPlatna } from '../core/kompozicia/znacky.js';
import { createViewer } from './viewer.js';
import {
  sablonaJson, suboryIndexu, citajSablonu, zhodujeSaSoSablonou,
} from './state/sablony.js';
import { dlazdiceUvodu } from './state/uvod.js';
import {
  exportSvgFile, exportPngFile, exportAvifFile, avifSupported,
  rasterDimensions, fontUrlsAbsolute,
} from './export.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const LS_KEY = 'brnosaires-generator-spec-v1';
const LS_MEDIUM_KEY = 'brnosaires-generator-medium-v1';
const MM_TO_PX = 96 / 25.4; // CSS px per mm at zoom 100 %
const MIERKA_MAX = proporcie.kompozicia.mierkaFotky.max;
const ZOOM_STEPS = [25, 33, 50, 67, 75, 90, 100, 125, 150, 200];

// The five fields a medium of presets/media.json sets on spec.format; the
// margin (grid.okraj) belongs to the grid, so a medium never touches it
const POLIA_FORMATU = ['sirka', 'vyska', 'jednotka', 'dpi', 'spadavka'];

// ---------- state ----------

// The saved work (or null) is kept apart from the current spec: the start
// screen offers it as Pokračovať and the clean canvas as the first tile.
const ulozenySpec = nacitajUlozeny();
let spec = ulozenySpec ?? cistySpec();
let view = { s: 1, vbX: 0, vbY: 0, bleedD: 0, znackyD: 0, okrajD: 0, cols: 8, rowsD: 0 };
let zoomPct = 75;
let selected = -1;
let editorOpen = false;
// The photo zone bar's mode: Rámik (false) moves and resizes the frame with
// its photo, Fotka (true) edits the photo and the frame of the selected zone
// apart. Editor state only, never saved in the spec.
let fotkaMod = false;
let fotkaCakaNaSheet = false; // a photo edit not yet on the composed sheet
let dragging = null;

const overlay = $('#overlay');
const svgHost = $('#svg-host');
const zonesHost = $('#zones');
const gridLines = $('#grid-lines');
const bleedMark = $('#bleed-mark');
const okrajMark = $('#okraj-mark');
const zoneBar = $('#zone-bar');

// The static fonts' rezy (Brnos Aires) are declared here, not in ui.css: the
// rules come from the model in proporcie.json, so dropping a new cut's file
// into fonts/ and adding its item is all a second rez takes. Nunito, the
// variable interface and sheet font, stays declared in ui.css. Absolute URLs,
// the same ones the exports use.
{
  const style = document.createElement('style');
  style.textContent = facesFontov(Object.fromEntries(
    Object.entries(fontUrlsAbsolute()).filter(([, urls]) => typeof urls === 'object'),
  )).map((face) => fontFaceCss(face, { swap: true })).join('\n');
  document.head.append(style);
}

// A spec saved earlier (the state, a template) made current: settings the
// generator dropped are removed, then the engine validates and normalises
// it. Throws the engine's error when the spec is not valid.
function pripravSpec(saved) {
  // types and settings dropped from the set (koleno, bod, retazenie,
  // rozlozenie) must not discard the saved state
  if (saved?.kompozicia) zahodZastarane(saved.kompozicia);
  // the margin moved from the format (its unit) to the grid (dieliky):
  // a format.okraj saved by the earlier preview is dropped, not converted
  if (saved?.format && typeof saved.format === 'object') delete saved.format.okraj;
  return engine.normalizujSpec(saved);
}

// The work saved in the browser, validated, or null when there is none or
// it no longer loads.
function nacitajUlozeny() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return pripravSpec(JSON.parse(raw));
  } catch (err) {
    console.warn('Uložený stav sa nepodarilo načítať, začínam odznova.', err);
  }
  return null;
}

// A clean spec: the engine's default.
function cistySpec() {
  try {
    return engine.normalizujSpec({});
  } catch (err) {
    console.error(err);
    return null;
  }
}

// The spec a start-screen tile opened (as JSON) while it is still untouched:
// a clean canvas or a template that nobody edited yet does not overwrite the
// saved work, so a wrong click on a tile loses nothing before a real edit.
let neupravenyJson = null;

let saveTimer = 0;
function saveLocal() {
  clearTimeout(saveTimer);
  if (neupravenyJson !== null) {
    if (JSON.stringify(spec) === neupravenyJson) return;
    neupravenyJson = null;
  }
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
let poziadavka = 0; // id of the newest render request
const composeNote = $('#compose-note');

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 50);
}

// The grid lines a zone edge may sit on: the format's columns and whole
// rows, or, with a margin (grid.okraj), only those inside its guide — okraj
// whole dieliky in from the left, top and right edge and from the last whole
// row. Zones stay out of the margin like the pattern does.
function oblastZon() {
  const f = spec.format, cols = spec.grid.stlpce;
  const rows = Math.max(1, Math.floor((f.vyska * cols) / f.sirka + 1e-6));
  const ok = spec.grid.okraj ?? 0;
  return { x0: ok, y0: ok, x1: cols - ok, y1: rows - ok };
}

// Keeps every zone inside the format and its margin (a smaller format or
// grid, or a wider margin, would leave it hanging over the edge, which the
// engine rejects): a zone is shrunk to fit and pushed inside.
function vmestiZony() {
  // the margin first: a medium with fewer rows must not leave it too wide
  spec.grid.okraj = clamp(spec.grid.okraj ?? 0, 0, maxOkraj());
  const o = oblastZon();
  for (const z of spec.zony) {
    z.w = clamp(z.w, 1, o.x1 - o.x0);
    z.h = clamp(z.h, 1, o.y1 - o.y0);
    z.x = clamp(z.x, o.x0, o.x1 - z.w);
    z.y = clamp(z.y, o.y0, o.y1 - z.h);
    // a frame of other proportions may leave the photo short of an edge
    if (z.typ === 'fotka') Object.assign(z, pritiahniFotku(z, z, MIERKA_MAX));
  }
}

// Composing runs in a worker (engine.js) and takes seconds: the sheet keeps
// the previous drawing until the newest spec comes back — an answer to an
// older request (id < poziadavka) is dropped.
async function render() {
  vmestiZony();
  zmerajFotky();
  const id = ++poziadavka;
  composeNote.hidden = false;
  const data = await engine.komponujAsync(id, spec, { fontUrls: fontUrlsAbsolute() });
  if (data.id !== poziadavka) return; // superseded by a newer spec
  composeNote.hidden = true;
  fotkaCakaNaSheet = false;
  if (data.error) {
    toast(data.error);
    return; // keep the last good sheet on screen
  }
  mountSvg(data.svg);
  relayout();
  syncBar();
  // a warning shows once, not again on every slider step that keeps it
  const varovanie = data.varovania.join(' ');
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
    znackyD: rozmerPlatna(f).pas / dielikUnits, // the crop-mark band, 0 without a bleed
    okrajD: g.okraj ?? 0,
    cols: g.stlpce,
    rowsD: f.vyska / dielikUnits,
  };
}

function dielikPx() { return view.s; }

// Cursor position in dieliks, relative to the trimmed format origin.
// The viewBox starts one bleed and one crop-mark band left of the format
// (vbX = -bleedD - znackyD), so a client point maps to dieliks by adding
// vbX, never by adding the bleed.
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

// The one snapping rule of the canvas: every zone edge lies on a grid line,
// the one nearest to the cursor (the threshold sits in the middle of a cell).
// `min` and `max` are the first and last line a zone may use (oblastZon).
function naCiaru(v, max, min = 0) {
  return clamp(Math.round(v), min, max);
}

// The height need not divide into whole rows; the last whole line counts.
function maxRiadok() {
  return Math.floor(view.rowsD);
}


// ---------- overlay ----------

function drawOverlay() {
  overlay.style.setProperty('--dielik-px', `${view.s}px`);
  // the dielik grid starts one bleed inside the sheet (at the trimmed format)
  overlay.style.setProperty('--grid-ox', `${-view.vbX * view.s}px`);
  overlay.style.setProperty('--grid-oy', `${-view.vbY * view.s}px`);

  // Bleed: the same eight crop marks as the export (core/kompozicia/znacky.js),
  // drawn here as screen-pixel lines so they stay visible at any zoom. The
  // element itself covers the trimmed format; the marks sit outside it, in
  // the band beyond the bleed.
  Object.assign(bleedMark.style, styleRect({
    left: -view.vbX * view.s,
    top: -view.vbY * view.s,
    width: view.cols * view.s,
    height: view.rowsD * view.s,
  }));
  bleedMark.replaceChildren(...(view.znackyD > 0 ? orezoveZnacky({
    sirka: view.cols * view.s,
    vyska: view.rowsD * view.s,
    spadavka: view.bleedD * view.s,
    dlzka: view.znackyD * view.s,
  }) : []).map(([x1, y1, x2, y2]) => {
    const znacka = document.createElement('div');
    znacka.className = 'znacka';
    Object.assign(znacka.style, y1 === y2
      ? { left: `${Math.min(x1, x2)}px`, top: `${y1 - 0.5}px`, width: `${Math.abs(x2 - x1)}px`, height: '1px' }
      : { left: `${x1 - 0.5}px`, top: `${Math.min(y1, y2)}px`, width: '1px', height: `${Math.abs(y2 - y1)}px` });
    return znacka;
  }));

  // Margin (okraj): a guide on grid lines, okraj whole dieliky in from the
  // trimmed format's left, top and right edge and from the last whole row.
  // An editor guide only: it shows while the grid lines do (the stylesheet
  // hides it with them), and the export draws no line for it at all.
  const ok = view.okrajD;
  okrajMark.hidden = ok <= 0;
  Object.assign(okrajMark.style, styleRect({
    left: (ok - view.vbX) * view.s,
    top: (ok - view.vbY) * view.s,
    width: (view.cols - 2 * ok) * view.s,
    height: (maxRiadok() - 2 * ok) * view.s,
  }));

  zonesHost.replaceChildren();
  spec.zony.forEach((z, i) => {
    const div = document.createElement('div');
    div.className = 'zone' + (i === selected ? ' sel' : '') + (z.typ === 'prazdna' ? ' prazdna' : '');
    if (i === selected && jeFotkaMod(z)) div.classList.add('foto-mod');
    Object.assign(div.style, styleRect(zoneRectPx(z)));
    div.dataset.i = String(i);
    if (z.typ === 'prazdna') {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Dvojklik pre text alebo pretiahni fotku';
      div.append(hint);
    }
    if (z.typ === 'fotka' && !z.zdroj) div.append(tvarNahrady(nahradaFotky(i), z));
    if (i === selected) {
      // in mode Fotka the frame also takes its edges, the photo's own
      // corners take its corner handles
      const uchyty = jeFotkaMod(z) ? ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'] : ['tl', 'tr', 'bl', 'br'];
      for (const corner of uchyty) {
        const handle = document.createElement('div');
        handle.className = `handle ${corner}`;
        handle.dataset.corner = corner;
        div.append(handle);
      }
    }
    zonesHost.append(div);
  });
  const vybrana = spec.zony[selected];
  if (vybrana && jeFotkaMod(vybrana)) zonesHost.append(...prvkyFotky(vybrana));

  drawZoneBar();
  positionEditor();
}

// A photo zone without its photo (a loaded template keeps no photos): a
// placeholder drawn here, a grey wash with a diagonal cross and a
// "Nahrať fotku" button that opens the file picker, until a photo is
// uploaded or dropped in. It lives in the overlay only, so the exported
// files keep what the core writes for such a zone (a plain light grey
// rectangle). Translucent, so a pattern reaching into the zone shows.
function nahradaFotky(i) {
  const wrap = document.createElement('div');
  wrap.className = 'foto-nahrada';
  wrap.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
    + '<path d="M0 0L100 100M100 0L0 100" vector-effect="non-scaling-stroke"/></svg>';
  const cta = document.createElement('div');
  cta.className = 'foto-cta';
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Nahrať fotku';
  b.addEventListener('click', () => vyberFotku(i));
  const popis = document.createElement('span');
  popis.textContent = 'alebo ju sem pretiahni';
  cta.append(b, popis);
  wrap.append(cta);
  return wrap;
}

// The placeholder takes the shape the sheet gives a photo zone: its
// rounded corners (zaoblenie, % of half the shorter side) and its border
// (% of a dielik, the pattern colour from the stylesheet), drawn inside the
// zone like the core draws it.
function tvarNahrady(el, z) {
  const rx = (Math.min(z.w, z.h) / 2) * ((z.zaoblenie ?? 0) / 100);
  const b = (z.border ?? 0) / 100;
  el.style.borderRadius = `${rx * view.s}px`;
  el.style.borderWidth = `${b * view.s}px`;
  return el;
}

// ---------- the photo of a zone in mode Fotka ----------

// Mode Fotka applies to the selected photo zone once it has its photo.
function jeFotkaMod(z) {
  return fotkaMod && z?.typ === 'fotka' && Boolean(z.zdroj);
}

// The whole photo in mode Fotka: translucent over the sheet, so the part
// outside the frame (what the frame crops) shows, with its own corner
// handles. While the photo is dragged, and until the sheet is recomposed,
// a full-strength copy clipped to the frame's shape shows the result.
function prvkyFotky(z) {
  const cela = document.createElement('div');
  cela.className = 'foto-cela';
  const obraz = document.createElement('img');
  obraz.className = 'foto-obraz';
  obraz.alt = '';
  obraz.draggable = false;
  obraz.src = z.zdroj;
  const vnutro = obraz.cloneNode();
  vnutro.className = 'foto-vnutro';
  cela.append(obraz, vnutro);
  const uchyty = ['tl', 'tr', 'bl', 'br'].map((corner) => {
    const u = document.createElement('div');
    u.className = `foto-uchyt ${corner}`;
    u.dataset.fotoCorner = corner;
    u.title = 'Ťahaj roh fotky: zväčší alebo zmenší ju';
    return u;
  });
  polozFotku(z, [cela, ...uchyty]);
  return [cela, ...uchyty];
}

// Places the photo elements of mode Fotka over the zone z (on every move
// of a drag, so the image is never rebuilt).
function polozFotku(z, prvky = zonesHost.querySelectorAll('.foto-cela, .foto-uchyt')) {
  const foto = obdlznikFotky(z, z);
  const r = zoneRectPx({ x: foto.x, y: foto.y, w: foto.w, h: foto.h });
  for (const el of prvky) {
    if (el.classList.contains('foto-cela')) {
      Object.assign(el.style, styleRect(r));
      // the frame's shape in the photo's own pixels: an inset with the
      // zone's rounded corners
      const s = view.s;
      const rx = (Math.min(z.w, z.h) / 2) * ((z.zaoblenie ?? 0) / 100) * s;
      const vnutro = el.querySelector('.foto-vnutro');
      vnutro.style.clipPath = `inset(${(z.y - foto.y) * s}px ${(foto.x + foto.w - z.x - z.w) * s}px `
        + `${(foto.y + foto.h - z.y - z.h) * s}px ${(z.x - foto.x) * s}px round ${rx}px)`;
      el.classList.toggle('tahanie', Boolean(dragging?.fotka) || fotkaCakaNaSheet);
    } else {
      const c = el.dataset.fotoCorner;
      el.style.left = `${r.left + (c.includes('r') ? r.width : 0)}px`;
      el.style.top = `${r.top + (c.includes('b') ? r.height : 0)}px`;
    }
  }
}

// The pixel size of every photo that does not carry it yet (a photo just
// dropped in, a spec saved before the field existed): read from the image
// itself, then the sheet is recomposed with the photo's real proportions.
const meraneFotky = new Set();
function zmerajFotky() {
  for (const z of spec.zony) {
    if (z.typ !== 'fotka' || !z.zdroj || z.rozmer || meraneFotky.has(z.zdroj)) continue;
    const zdroj = z.zdroj;
    meraneFotky.add(zdroj);
    const img = new Image();
    img.onload = () => {
      meraneFotky.delete(zdroj);
      if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return;
      for (const zona of spec.zony) {
        if (zona.typ === 'fotka' && zona.zdroj === zdroj && !zona.rozmer) {
          zona.rozmer = [img.naturalWidth, img.naturalHeight];
        }
      }
      drawOverlay();
      scheduleRender();
    };
    img.onerror = () => meraneFotky.delete(zdroj);
    img.src = zdroj;
  }
}

// Opens the file picker and puts the chosen image into photo zone i,
// keeping the zone's own mierka, posun, zaoblenie and border (as a drop does).
function vyberFotku(i) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    const z = spec.zony[i];
    if (!file || !z || z.typ !== 'fotka') return;
    if (!file.type.startsWith('image/')) {
      toast('Vyber obrázkový súbor (JPG, PNG, WebP…).');
      return;
    }
    try {
      z.zdroj = await readImageFile(file);
      delete z.rozmer; // measured anew from this photo
      selected = i;
      scheduleRender();
    } catch (err) {
      toast(err.message);
    }
  });
  input.click();
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
  // the photo mode belongs to the key: it lights one of the mode buttons
  const key = `${selected}:${z.typ}:${jeFotkaMod(z)}`;
  if (zoneBar.dataset.key === key && zoneBar.contains(document.activeElement)) {
    placeZoneBar(z);
    return;
  }
  zoneBar.dataset.key = key;
  zoneBar.replaceChildren();

  // icon + control pairs; the icon names the field, the control holds the value
  const makeField = (ico, label, control) => {
    const wrap = document.createElement('label');
    wrap.className = 'z-field';
    control.setAttribute('aria-label', label);
    wrap.append(ikona(ico, label), control);
    return wrap;
  };

  const makeSelect = (ico, label, options, value, onInput) => {
    const select = document.createElement('select');
    for (const [val, name] of options) {
      const option = document.createElement('option');
      option.value = val;
      option.textContent = name;
      select.append(option);
    }
    select.value = value;
    select.addEventListener('input', () => { onInput(select.value); scheduleRender(); });
    return makeField(ico, label, select);
  };

  const makeNumber = (ico, label, value, attrs, onInput) =>
    makeField(ico, label, numberInput(value, attrs, onInput));

  // Whole-number slider 0–100 with its value beside it: a drag moves the
  // number and the spec (onInput may preview), the sheet is recomposed when
  // the slider is released (change fires on release and on a track click).
  const makeSlider = (ico, label, value, onInput) => {
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
    });
    range.addEventListener('change', scheduleRender);
    const field = makeField(ico, label, range);
    field.classList.add('z-slider');
    field.append(num);
    return field;
  };

  // the selected zone's placeholder follows a slider drag before the sheet
  // is recomposed
  const nahradaVybranej = (z) => {
    const el = zonesHost.querySelector(`.zone[data-i="${selected}"] .foto-nahrada`);
    if (el) tvarNahrady(el, z);
  };

  // Icon toggle group (alignment, photo mode, obtekanie). The buttons keep
  // their own active look — the bar is not rebuilt while one of its fields
  // has focus. A group with a label prefixes it to every option
  // („Zarovnanie: vľavo“); a group without one gives each option its whole
  // sentence as the title and names only the group itself.
  const makeToggle = (label, options, aktualna, onInput, prekresli = true) => {
    const group = document.createElement('span');
    group.className = 'z-seg';
    group.setAttribute('role', 'group');
    if (label) group.setAttribute('aria-label', label);
    const tlacidla = options.map(([val, nazov, ico, napis]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'z-tgl';
      const popis = label ? `${label}: ${nazov}` : nazov;
      b.title = popis;
      b.setAttribute('aria-label', popis);
      b.append(ikona(ico, popis));
      // a button may carry its short name beside the icon (the photo modes)
      if (napis) {
        const t = document.createElement('span');
        t.className = 'z-tgl-napis';
        t.textContent = napis;
        b.classList.add('s-napisom');
        b.append(t);
      }
      b.dataset.hodnota = val;
      b.addEventListener('click', () => { onInput(val); obnov(); if (prekresli) scheduleRender(); });
      group.append(b);
      return [val, b];
    });
    const obnov = () => {
      const v = aktualna();
      for (const [val, b] of tlacidla) {
        const zapnute = val === v;
        b.classList.toggle('zapnute', zapnute);
        b.setAttribute('aria-pressed', String(zapnute));
      }
    };
    obnov();
    return group;
  };

  // Obtekanie: what the pattern wraps — the zone's frame or the letters
  // themselves; okraj then keeps its distance from that. Whole-verb-phrase
  // titles, so the group goes out without a label prefix.
  const makeObtekanie = (z) => {
    const group = makeToggle('', [
      ['ram', 'Obtekať rámik', 'obtekanie-ram'],
      ['text', 'Obtekať písmená', 'obtekanie-text'],
    ], () => z.obtekanie, (v) => { z.obtekanie = v; });
    group.setAttribute('aria-label', 'Obtekanie');
    return group;
  };

  // The rez field next to the font select: a variable font gets a whole-number
  // axis field (min–max of its weight axis), a static font a select of its
  // rezy. A single rez shows locked, never hidden — the author sees the font
  // does have a rez, just not two yet.
  const poleRezu = (z) => {
    if (jeVariabilne(z.pismo)) {
      const { min, max, predvolene } = osaPisma(z.pismo);
      return makeNumber('rez', `Rez písma — hrúbka ${min}–${max}`, z.hrubka ?? predvolene,
        { min, max, step: 1 }, (v) => { z.hrubka = v; positionEditor(); });
    }
    const rezy = rezyPisma(z.pismo);
    const select = document.createElement('select');
    for (const rez of rezy) {
      const option = document.createElement('option');
      option.value = rez.id;
      option.textContent = rez.nazov;
      select.append(option);
    }
    select.value = z.rez ?? rezy[0].id;
    if (rezy.length < 2) select.disabled = true;
    select.addEventListener('input', () => {
      z.rez = select.value;
      positionEditor();
      scheduleRender();
    });
    return makeField('rez', 'Rez písma', select);
  };

  if (z.typ === 'text') {
    zoneBar.append(
      makeSelect('pismo', 'Písmo', FONTY.map((p) => [p, p]), z.pismo, (v) => {
        z.pismo = v;
        // tags both fonts share keep their state, the rest reset to the
        // new font's defaults; the open features popover is stale, close it
        z.features = featuresPoZmenePisma(z.features, v);
        // the rez field belongs to the font: the switch sets the new font's
        // default rez (or axis weight) and drops the other field
        delete z.rez;
        delete z.hrubka;
        Object.assign(z, predvolenePisma(v));
        zavriFeaturesPopover();
        // the rez control changes its shape with the font — rebuild the bar
        // (the guard would keep the stale field while the select has focus)
        zoneBar.dataset.key = '';
        drawZoneBar();
        positionEditor();
      }),
      poleRezu(z),
      // whole dieliks: baselines of the text sit on the dielik grid this far apart
      makeNumber('riadok', 'Výška riadku v dielikoch', z.riadok, { min: 1, step: 1 },
        (v) => { z.riadok = v; positionEditor(); }),
      // whole percent of the row: 150 % = glyphs half a row taller than the row
      makeNumber('velkost', 'Veľkosť % riadku', z.velkost, { min: 10, max: 200, step: 1 },
        (v) => { z.velkost = v; positionEditor(); }),
      makeToggle('Zarovnanie', [
        ['vlavo', 'vľavo', 'zarovnanie-vlavo'],
        ['stred', 'na stred', 'zarovnanie-stred'],
        ['vpravo', 'vpravo', 'zarovnanie-vpravo'],
      ], () => z.zarovnanie, (v) => { z.zarovnanie = v; positionEditor(); }),
      makeFeaturesTlacidlo(z),
      // whole dieliks of free space around the zone (negative lets the
      // pattern reach that deep into it)
      makeNumber('okraj', 'Okraj', z.okraj, { min: -20, max: 20, step: 1 }, (v) => { z.okraj = v; }),
      makeObtekanie(z),
    );
  } else if (z.typ === 'fotka') {
    // the mode: Rámik moves and resizes frame and photo together, Fotka
    // moves and scales the photo and resizes the frame apart — editor
    // state, so switching never recomposes the sheet
    if (z.zdroj) {
      zoneBar.append(makeToggle('Mód', [
        ['ramik', 'Rámik — ťahanie hýbe rámikom aj fotkou spolu', 'mod-ramik', 'Rámik'],
        ['fotka', 'Fotka — ťahaj fotku, jej rohy menia veľkosť, rámik sa mení zvlášť', 'mod-fotka', 'Fotka'],
      ], () => (jeFotkaMod(z) ? 'fotka' : 'ramik'), (v) => {
        fotkaMod = v === 'fotka';
        drawOverlay();
      }, false));
    }
    zoneBar.append(
      makeNumber('okraj', 'Okraj', z.okraj, { min: -20, max: 20, step: 1 }, (v) => { z.okraj = v; }),
      // whole % of half the zone's shorter side: 100 = a semicircle
      makeSlider('zaoblenie', 'Zaoblenie % polovice kratšej strany', z.zaoblenie ?? 0,
        (v) => { z.zaoblenie = v; nahradaVybranej(z); if (jeFotkaMod(z)) polozFotku(z); }),
      // whole % of one dielik, drawn inside the zone in the pattern colour
      makeSlider('border', 'Border % dielika', z.border ?? 0,
        (v) => { z.border = v; nahradaVybranej(z); }),
    );
  }

  const dup = document.createElement('button');
  dup.className = 'del';
  dup.title = 'Duplikovať zónu';
  dup.append(ikona('duplikovat', 'Duplikovať zónu'));
  dup.addEventListener('click', duplicateZone);
  zoneBar.append(dup);

  const del = document.createElement('button');
  del.className = 'del';
  del.title = 'Zmazať zónu';
  del.textContent = '✕';
  del.addEventListener('click', () => deleteZone(selected));
  zoneBar.append(del);
  placeZoneBar(z);
}

// ---------- typographic features popover ----------

// Short Slovak labels for the popover, per font: ss01/ss03 have a concrete
// meaning in Brnos Aires (from the author), the rest are the standard OpenType
// functions each font carries (the lists live in proporcie.json).
const FEATURE_POPIES = {
  'Brnos Aires': {
    liga: 'Ligatúry',
    dlig: 'Voliteľné ligatúry (ft, fí, tt, ťt)',
    ss01: 'Set 1 – bodky',
    ss03: 'Set 3 – E',
    case: 'Kapitálkové tvary interpunkcie',
  },
  Nunito: {
    liga: 'Ligatúry',
    calt: 'Kontextové alternáty',
    ss01: 'Set 1',
    ss02: 'Set 2',
    salt: 'Alternatívne tvary',
    case: 'Kapitálkové tvary interpunkcie',
    onum: 'Staré číslice',
    frac: 'Zlomky',
    sups: 'Horný index',
    subs: 'Dolný index',
    ordn: 'Radové číslovky',
  },
};

// The features of a zone as a CSS value; a zone that predates the field (or
// is being born right now) gets the font's defaults, never a hard-coded set.
const ffsZony = (z) => fontFeatureSettings(z.features ?? predvoleneFeatures(z.pismo));

function zavriFeaturesPopover() {
  const pop = zoneBar.querySelector('.z-pop');
  if (!pop) return;
  pop.remove();
  const btn = zoneBar.querySelector('.z-feat');
  btn?.classList.remove('open');
  btn?.setAttribute('aria-expanded', 'false');
}

// A click outside the bar closes the popover; the button toggles it itself
// and the rows only switch their feature. Capture phase, so a press that
// starts a canvas drag cannot leave the popover hanging open.
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest || e.target.closest('#zone-bar')) return;
  zavriFeaturesPopover();
}, true);

function makeFeaturesTlacidlo(z) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'z-feat';
  b.title = 'Typografické funkcie';
  b.setAttribute('aria-label', 'Typografické funkcie');
  b.setAttribute('aria-haspopup', 'true');
  b.setAttribute('aria-expanded', 'false');
  b.append(ikona('features', 'Typografické funkcie'));
  b.addEventListener('click', () => {
    // toggle: an open popover only ever belongs to this button (a rebuilt
    // bar takes its popover with it)
    if (zoneBar.querySelector('.z-pop')) {
      zavriFeaturesPopover();
      return;
    }
    const pop = document.createElement('div');
    pop.className = 'z-pop';
    const nadpis = document.createElement('span');
    nadpis.className = 'z-pop-cap';
    nadpis.textContent = z.pismo;
    pop.append(nadpis);
    const popisy = FEATURE_POPIES[z.pismo] || {};
    for (const [tag, zap] of Object.entries(z.features ?? predvoleneFeatures(z.pismo))) {
      const row = document.createElement('label');
      row.className = 'z-feat-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = zap;
      const popis = document.createElement('span');
      popis.className = 'popis';
      popis.textContent = popisy[tag] ?? tag;
      const tagEl = document.createElement('span');
      tagEl.className = 'tag';
      tagEl.textContent = tag;
      // a click re-renders the sheet and re-places the editor with the new
      // features at once; the editor stays open (the popover sits in the bar)
      box.addEventListener('change', () => {
        z.features[tag] = box.checked;
        positionEditor();
        scheduleRender();
      });
      row.append(box, popis, tagEl);
      pop.append(row);
    }
    b.classList.add('open');
    b.setAttribute('aria-expanded', 'true');
    zoneBar.append(pop);
  });
  return b;
}

// ---------- zone bar icons ----------

// 16 × 16 line drawings, inline SVG built here, stroke currentColor: the bar
// stays black-and-white at any scale and in the inverted sheet. Each carries
// its Slovak name as the tooltip (title) and for screen readers (aria-label).
const IKONY = {
  pismo: '<path d="M1.8 13 5 3.6 8.2 13"/><path d="M3 9.4h4"/>'
    + '<circle cx="11.8" cy="10.8" r="2.2"/><path d="M14 13V8.6"/>',
  // small + large T
  velkost: '<path d="M1.5 3.5h7M5 3.5V13"/><path d="M9.5 8.5h5M12 8.5V13"/>',
  // three lines of growing weight — the rez / axis weight of the font
  rez: '<path d="M2.5 4h11" stroke-width="1"/>'
    + '<path d="M2.5 8h11" stroke-width="1.7"/><path d="M2.5 12h11" stroke-width="2.6"/>',
  // lines with an up-down arrow
  riadok: '<path d="M8.5 3.5H15M8.5 8H15M8.5 12.5H15"/>'
    + '<path d="M4.5 2.2v11.6M2.5 4.2l2-2 2 2M2.5 11.8l2 2 2-2"/>',
  okraj: '<rect x="1.5" y="3" width="13" height="10"/><rect x="4.7" y="6.2" width="6.6" height="3.6"/>',
  // the pattern (the four marks outside) wraps the zone's frame, or the
  // letters themselves — the marks stand around a rectangle / a glyph
  'obtekanie-ram': '<rect x="5" y="5" width="6" height="6"/>'
    + '<path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8"/>',
  'obtekanie-text': '<path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8"/>'
    + '<text x="8" y="11.8" text-anchor="middle" font-size="12.5"'
    + ' fill="currentColor" stroke="none">a</text>',
  'zarovnanie-vlavo': '<path d="M2 4h12M2 8h9M2 12h11"/>',
  'zarovnanie-stred': '<path d="M3 4h10M1.5 8h13M4 12h8"/>',
  'zarovnanie-vpravo': '<path d="M2 4h12M5 8h9M3 12h11"/>',
  // mode Rámik: the frame with its photo inside, one piece
  'mod-ramik': '<rect x="2" y="3" width="12" height="10"/><path d="M2 10.5 5.8 7l3 3 2-2L14 11"/>',
  // mode Fotka: the photo larger than the frame, its corner handle outside
  'mod-fotka': '<rect x="4.5" y="5" width="7" height="6"/>'
    + '<path d="M1.5 2h13v12h-13z" stroke-dasharray="1.6 1.4"/>'
    + '<rect x="12.6" y="12.1" width="3" height="3" fill="currentColor" stroke="none"/>',
  // a corner turning round: the photo zone's zaoblenie
  zaoblenie: '<path d="M2.5 13.5V8.5a6 6 0 0 1 6-6h5"/>',
  // a frame with a thick inner edge: the photo zone's border
  border: '<rect x="2" y="2" width="12" height="12"/>'
    + '<rect x="4.2" y="4.2" width="7.6" height="7.6" stroke-width="2.6"/>',
  // duplicate: a rect in front, the square behind it by its top and left edges
  duplikovat: '<rect x="5.5" y="5.5" width="9" height="9"/><path d="M10.5 3.5h-7v7"/>',
  // "fi" set in the interface font (its own ligature): the typographic
  // features button; a glyph, not a line drawing, so it stays legible at 16 px
  features: '<text x="8" y="12.4" text-anchor="middle" font-size="12.5"'
    + ' fill="currentColor" stroke="none">fi</text>',
};

function ikona(nazov, popis) {
  const span = document.createElement('span');
  span.className = 'z-ico';
  span.title = popis;
  span.setAttribute('aria-label', popis);
  span.setAttribute('role', 'img');
  span.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IKONY[nazov]}</svg>`;
  return span;
}

// Place under the zone, above when there is no room; in mode Fotka under
// the photo where it reaches past the frame, clear of its handles.
function placeZoneBar(z) {
  let r = zoneRectPx(z);
  if (jeFotkaMod(z)) {
    const f = zoneRectPx(obdlznikFotky(z, z));
    const top = Math.min(r.top, f.top);
    const left = Math.min(r.left, f.left);
    r = {
      left, top,
      width: Math.max(r.left + r.width, f.left + f.width) - left,
      height: Math.max(r.top + r.height, f.top + f.height) - top,
    };
  }
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
  fotkaMod = false;
  drawOverlay();
}

function deleteZone(i) {
  if (i < 0 || i >= spec.zony.length) return;
  closeEditor();
  spec.zony.splice(i, 1);
  selected = -1;
  drawOverlay(); // the zone disappears now, the sheet follows after recomposing
  scheduleRender();
}

// ---------- keyboard on the selected zone ----------

// The usual keys work on the selected zone: Delete/Backspace deletes it,
// Cmd/Ctrl+C copies it, Cmd/Ctrl+V pastes the copy, Cmd/Ctrl+D duplicates
// and Escape deselects. A key pressed with focus in a field (the text
// editor, the bar's inputs and selects, anything contenteditable) keeps its
// normal meaning — typing, copy and delete included — and preventDefault
// only ever fires on a key that was actually handled.
let zoneClipboard = null; // the copied zone, a deep clone held in memory

const vPolicku = (target) => Boolean(
  target?.closest?.('input, textarea, select') || target?.isContentEditable,
);

document.addEventListener('keydown', (e) => {
  if (vPolicku(e.target)) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (key === 'Escape') {
    if (selected < 0) return;
    closeEditor();
    selected = -1;
    fotkaMod = false;
    drawOverlay();
    e.preventDefault();
  } else if (key === 'Delete' || key === 'Backspace') {
    if (!spec.zony[selected]) return;
    deleteZone(selected);
    e.preventDefault(); // Backspace would also take the page back
  } else if (mod && key === 'c') {
    const z = spec.zony[selected];
    if (!z) return;
    zoneClipboard = structuredClone(z);
    e.preventDefault();
  } else if (mod && key === 'v') {
    // paste alone works with nothing selected: the copy outlives the zone
    if (!zoneClipboard) return;
    pasteZone(zoneClipboard);
    e.preventDefault();
  } else if (mod && key === 'd') {
    if (!spec.zony[selected]) return;
    duplicateZone();
    e.preventDefault();
  }
});

// Copy + paste in one step (Cmd/Ctrl+D, the Duplikovať button). The editor
// closes first, so an untouched text zone goes back to being empty before
// the clone is made.
function duplicateZone() {
  closeEditor();
  const z = spec.zony[selected];
  if (!z) return;
  zoneClipboard = structuredClone(z);
  pasteZone(zoneClipboard);
}

// A pasted zone lands one dielik right and down from its original, clamped
// inside the format (whole dieliks); it is selected, drawn and saved exactly
// like a zone dragged out on the canvas.
function pasteZone(vzor) {
  const o = oblastZon();
  const z = structuredClone(vzor);
  z.w = clamp(Math.round(z.w), 1, o.x1 - o.x0);
  z.h = clamp(Math.round(z.h), 1, o.y1 - o.y0);
  z.x = clamp(Math.round(z.x) + 1, o.x0, o.x1 - z.w);
  z.y = clamp(Math.round(z.y) + 1, o.y0, o.y1 - z.h);
  spec.zony.push(z);
  selected = spec.zony.length - 1;
  fotkaMod = false;
  drawOverlay(); // show the new zone now, the sheet follows after recomposing
  scheduleRender();
}

// ---------- pointer interactions on the canvas ----------

overlay.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('#zone-bar, #text-editor, .foto-cta')) return;
  const handle = e.target.closest('.handle');
  const fotoUchyt = e.target.closest('.foto-uchyt');
  const zoneDiv = e.target.closest('.zone');
  const pos = cursorDieliks(e);
  const vybrana = spec.zony[selected];

  // mode Fotka: a corner of the photo scales it proportionally from the
  // opposite corner, a press on the photo (inside the frame or out) moves it
  if (vybrana && jeFotkaMod(vybrana) && (fotoUchyt || e.target.closest('.foto-cela')
    || (zoneDiv && !handle && Number(zoneDiv.dataset.i) === selected))) {
    const foto = obdlznikFotky(vybrana, vybrana);
    dragging = fotoUchyt
      ? { kind: 'foto-mierka', fotka: true, i: selected, corner: fotoUchyt.dataset.fotoCorner, foto }
      : { kind: 'foto-posun', fotka: true, i: selected, start: pos, foto };
    overlay.setPointerCapture(e.pointerId);
    polozFotku(vybrana);
    return;
  }

  if (handle) {
    const i = Number(handle.closest('.zone').dataset.i);
    selected = i;
    const z = spec.zony[i];
    // in mode Fotka the photo stays where it is on the sheet while its
    // frame changes; in Rámik it is resized with the frame
    dragging = jeFotkaMod(z)
      ? { kind: 'resize', corner: handle.dataset.corner, i, fotka: true, foto: obdlznikFotky(z, z) }
      : { kind: 'resize', corner: handle.dataset.corner, i };
    gridLines.hidden = false;
    overlay.setPointerCapture(e.pointerId);
    drawOverlay();
    return;
  }

  if (zoneDiv) {
    const i = Number(zoneDiv.dataset.i);
    const z = spec.zony[i];
    // a photo zone has no double-click: its modes are buttons in the bar
    if (z.typ !== 'fotka' && isDoublePress(e, i)) {
      e.preventDefault(); // keep the focus in the text editor it opens
      zoneDoubleClick(i);
      return;
    }
    if (selected !== i) fotkaMod = false;
    selected = i;
    dragging = {
      kind: 'move', i,
      grabX: pos.x - z.x, grabY: pos.y - z.y,
      moved: false,
    };
    gridLines.hidden = false;
    overlay.setPointerCapture(e.pointerId);
    drawOverlay();
    return;
  }

  // Empty space: start creating a zone (a plain click only deselects).
  lastPress = null;
  closeEditor();
  selected = -1;
  dragging = { kind: 'create', press: pos };
  gridLines.hidden = false;
  overlay.setPointerCapture(e.pointerId);
  drawOverlay();
});

overlay.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const pos = cursorDieliks(e);

  if (dragging.kind === 'create') {
    const rect = rectZTvorania(dragging.press, pos);
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
    // the top-left corner snaps to the line nearest to (cursor − grab)
    const o = oblastZon();
    z.x = naCiaru(pos.x - dragging.grabX, o.x1 - z.w, o.x0);
    z.y = naCiaru(pos.y - dragging.grabY, o.y1 - z.h, o.y0);
  } else if (dragging.kind === 'resize') {
    // the dragged edge snaps to the nearest line, the opposite one stays put
    const o = oblastZon();
    const l = { x: z.x, y: z.y };
    const r = { x: z.x + z.w, y: z.y + z.h };
    const c = dragging.corner;
    if (c.includes('l')) l.x = naCiaru(pos.x, r.x - 1, o.x0);
    if (c.includes('r')) r.x = Math.max(l.x + 1, naCiaru(pos.x, o.x1, o.x0));
    if (c.includes('t')) l.y = naCiaru(pos.y, r.y - 1, o.y0);
    if (c.includes('b')) r.y = Math.max(l.y + 1, naCiaru(pos.y, o.y1, o.y0));
    z.x = l.x; z.y = l.y; z.w = r.x - l.x; z.h = r.y - l.y;
    if (editorOpen) positionEditor();
    if (z.typ === 'fotka') {
      // mode Fotka: the photo stays put on the sheet, the frame changes
      // under it; Rámik: the photo keeps its mierka and posun in the frame.
      // Either way it is pulled back to cover the frame whole.
      Object.assign(z, dragging.fotka
        ? fotkaVRamiku(z, dragging.foto, z.rozmer, MIERKA_MAX)
        : pritiahniFotku(z, z, MIERKA_MAX));
    }
  } else if (dragging.kind === 'foto-posun') {
    const f = dragging.foto;
    const posunuta = { ...f, x: f.x + pos.x - dragging.start.x, y: f.y + pos.y - dragging.start.y };
    Object.assign(z, fotkaVRamiku(z, posunuta, z.rozmer, MIERKA_MAX));
  } else if (dragging.kind === 'foto-mierka') {
    // proportional: the corner opposite the dragged one stays, the size
    // follows the cursor on whichever axis it reaches further
    const f = dragging.foto;
    const c = dragging.corner;
    const sx = c.includes('r') ? 1 : -1;
    const sy = c.includes('b') ? 1 : -1;
    const ax = sx > 0 ? f.x : f.x + f.w;
    const ay = sy > 0 ? f.y : f.y + f.h;
    const pomer = f.w / f.h;
    const w = Math.max(sx * (pos.x - ax), sy * (pos.y - ay) * pomer, 0);
    const h = w / pomer;
    const nova = { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h };
    Object.assign(z, fotkaVRamiku(z, nova, z.rozmer, MIERKA_MAX));
  }

  const div = zonesHost.querySelector(`.zone[data-i="${dragging.i}"]`);
  if (div) Object.assign(div.style, styleRect(zoneRectPx(z)));
  if (jeFotkaMod(z)) polozFotku(z);
  drawZoneBar();
});

// A zone dragged out between two points: each corner snaps to the grid line
// nearest to its point (the press, the cursor), so the drag works in every
// direction. An axis whose corners share a line grows by one dielik towards
// the drag; with no movement at all the rect stays empty and a plain click
// keeps only deselecting, as before. Everything is clamped into the format
// and its margin.
function rectZTvorania(press, pos) {
  const o = oblastZon();
  const a = { x: naCiaru(press.x, o.x1, o.x0), y: naCiaru(press.y, o.y1, o.y0) };
  const b = { x: naCiaru(pos.x, o.x1, o.x0), y: naCiaru(pos.y, o.y1, o.y0) };
  const rect = {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
  };
  if (!rect.w && pos.x !== press.x) {
    rect.x = pos.x < press.x ? Math.max(o.x0, a.x - 1) : a.x;
    rect.w = 1;
  }
  if (!rect.h && pos.y !== press.y) {
    rect.y = pos.y < press.y ? Math.max(o.y0, a.y - 1) : a.y;
    rect.h = 1;
  }
  rect.w = Math.min(rect.w, o.x1 - rect.x);
  rect.h = Math.min(rect.h, o.y1 - rect.y);
  return rect;
}

overlay.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  const d = dragging;
  dragging = null;
  gridLines.hidden = true;
  $('#zone-create-ghost')?.remove();

  if (d.kind === 'create') {
    const pos = cursorDieliks(e);
    // the zone the ghost was showing all along — what you saw is what you get
    const rect = rectZTvorania(d.press, pos);
    if (rect.w >= 1 && rect.h >= 1) {
      spec.zony.push({ typ: 'prazdna', okraj: 0, ...rect });
      selected = spec.zony.length - 1;
      drawOverlay(); // show the new zone now, the sheet follows after recomposing
      scheduleRender();
    }
    return;
  }

  if (d.fotka) {
    // the photo clipped to the frame stays drawn over the sheet until the
    // sheet comes back recomposed with it
    fotkaCakaNaSheet = true;
    const z = spec.zony[d.i];
    if (jeFotkaMod(z)) polozFotku(z);
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

// Double-click: a text zone opens the editor, an empty zone becomes text.
function zoneDoubleClick(i) {
  const z = spec.zony[i];
  if (!z) return;
  if (z.typ === 'text') {
    openEditor(i);
  } else if (z.typ === 'prazdna') {
    zoneToText(i, 'Enter');
  }
}

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
  const hit = zoneAt(pos);

  try {
    const zdroj = await readImageFile(file);
    if (hit >= 0) {
      const z = spec.zony[hit];
      if (z.typ === 'fotka' && !z.zdroj) {
        // the placeholder of a template: the photo takes the zone's own
        // mierka, posun, zaoblenie and border, saved with the template
        z.zdroj = zdroj;
        delete z.rozmer; // measured anew from this photo
      } else {
        Object.assign(z, { typ: 'fotka', zdroj, mierka: 100, posun: [0, 0] });
        delete z.rozmer;
      }
      selected = hit;
    } else {
      // a 4 × 3 frame centred on the cursor, edges on the nearest lines,
      // inside the margin
      const o = oblastZon();
      const w = Math.min(4, o.x1 - o.x0);
      const h = Math.min(3, Math.max(1, o.y1 - o.y0));
      spec.zony.push({
        typ: 'fotka',
        x: naCiaru(pos.x - w / 2, o.x1 - w, o.x0),
        y: naCiaru(pos.y - h / 2, o.y1 - h, o.y0),
        w, h, okraj: 0,
        zdroj, mierka: 100, posun: [0, 0],
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
  // author's default: rows of 3 dieliks, glyphs filling 80 % of the row
  z.riadok = 3;
  z.velkost = 80;
  z.zarovnanie = 'vlavo';
  // a fresh text zone wraps the letters right away (obtekanie 'text')
  z.obtekanie = 'text';
  z.features = predvoleneFeatures(z.pismo);
  Object.assign(z, predvolenePisma(z.pismo));
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
// the baseline), never assumed from a formula. The zone's font features and
// its rez weight are part of the mirrored styles — and of the cache key.
const baselineCache = new Map();
const warmedFonts = new Set();
let metricBox = null;

function firstBaselineOffset(family, weight, fontPx, riadkovanie, ffs) {
  const key = `${family}|${weight}|${fontPx}|${riadkovanie}|${ffs}`;
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
  box.style.fontWeight = String(weight);
  box.style.fontSize = `${fontPx}px`;
  box.style.lineHeight = String(riadkovanie);
  box.style.fontFeatureSettings = ffs;
  const offset = mark.getBoundingClientRect().top - box.getBoundingClientRect().top;
  baselineCache.set(key, offset);
  const shorthand = `${weight} ${fontPx}px ${family}`;
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
  // the same numbers as the sheet: glyphs fill velkost % of the row, rows sit
  // riadok dieliks apart
  const fontD = (z.riadok * z.velkost) / 100;
  const fontPx = fontD * dielikPx();
  const riadkovanie = z.riadok / fontD; // line height as a multiple of the font size
  // the same face the sheet's <text> gets: the rez family/weight of a static
  // font or the zone's axis weight of a variable one
  const face = faceZony(z);
  const family = `'${face.family}', ${z.pismo === 'Brnos Aires' ? 'serif' : 'sans-serif'}`;
  const ffs = ffsZony(z);
  ta.style.fontFamily = family;
  ta.style.fontWeight = String(face.weight);
  ta.style.fontSize = `${fontPx}px`;
  ta.style.lineHeight = `${z.riadok * dielikPx()}px`;
  ta.style.textAlign = z.zarovnanie === 'stred' ? 'center' : (z.zarovnanie === 'vpravo' ? 'right' : 'left');
  ta.style.fontFeatureSettings = ffs;
  // The box is shifted so the two first baselines meet (padding cannot go
  // negative); the 1 px border grows the box around the zone instead of
  // pushing the text, so the content box stays exactly on the zone rect and
  // wrapping, size and alignment match the sheet line for line.
  const baselinePx = fontD * proporcie.kompozicia.svg.riadokPrvy * dielikPx();
  const top = r.top + baselinePx - firstBaselineOffset(family, face.weight, fontPx, riadkovanie, ffs) - 1;
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
      delete z.zarovnanie; delete z.riadok; delete z.features; delete z.obtekanie;
      delete z.rez; delete z.hrubka;
    }
  }
  ta.remove();
  scheduleRender();
}

// ---------- top bar ----------

function syncBar() {
  const f = spec.format, g = spec.grid;
  const btn = $('#btn-format');
  btn.textContent = 'Dokument ▾';
  btn.title = `${f.sirka} × ${f.vyska} ${f.jednotka} · Grid ${g.stlpce}`;
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
    // Rebuild the open popover in place, keeping its scroll position.
    rebuild() {
      const y = pop.scrollTop;
      buildContent(pop);
      pop.scrollTop = y;
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
  // a drag moves only the number and the spec; the sheet is recomposed when
  // the slider is released (change fires on release and on a track click)
  range.addEventListener('input', () => {
    num.textContent = range.value;
    onInput(Number(range.value));
  });
  range.addEventListener('change', scheduleRender);
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
  };
  // a drag moves only the number and the value; the sheet is recomposed when
  // a thumb is released or the track is clicked
  lo.addEventListener('input', () => {
    value[0] = Math.min(Number(lo.value), value[1]);
    changed();
  });
  hi.addEventListener('input', () => {
    value[1] = Math.max(Number(hi.value), value[0]);
    changed();
  });
  lo.addEventListener('change', scheduleRender);
  hi.addEventListener('change', scheduleRender);
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

// Media (named formats) are data in presets/media.json, loaded at runtime as
// JSON — the ui never imports from presets/. Until they arrive the panel
// shows Custom alone; an open panel fills up in place, a closed one builds
// with them on open.
let mediaSkupiny = null;
let mediaHost = null; // the groups container of the format panel on screen
let customZvolene = false; // Custom clicked: it stays lit even on a medium's values
// The medium last clicked (group + name), kept in the browser beside the
// spec: several media share the same values (1080 × 1350 px), so the one
// clicked is the one lit while the format still matches it.
let zvoleneMedium = nacitajZvoleneMedium();

function nacitajZvoleneMedium() {
  try {
    const m = JSON.parse(localStorage.getItem(LS_MEDIUM_KEY));
    return typeof m?.skupina === 'string' && typeof m?.nazov === 'string' ? m : null;
  } catch {
    return null;
  }
}

function ulozZvoleneMedium() {
  try {
    localStorage.setItem(LS_MEDIUM_KEY, JSON.stringify(zvoleneMedium));
  } catch {
    // private mode or full storage: the choice lives for this visit only
  }
}
let custom1Pole = null; // the first editable field of Custom (the width)

fetch(new URL('../presets/media.json', import.meta.url))
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(({ skupiny }) => {
    mediaSkupiny = Array.isArray(skupiny) ? skupiny : null;
    if (mediaHost?.isConnected) nakresliMedia(mediaHost);
  })
  .catch((err) => {
    console.warn('Médiá sa nepodarilo načítať, panel Formát ukáže len Custom.', err);
  });

// A medium fits when the format equals it in every field it sets.
function sediMedium(medium) {
  return POLIA_FORMATU.every((k) => spec.format[k] === medium[k]);
}

// The one lit medium: the clicked one while the format fits it, otherwise
// the first fitting one in list order; none (Custom) when nothing fits or
// Custom was clicked.
// The lit one with its group ({ skupina, medium }), or null.
function aktivnaPolozkaMedia() {
  if (customZvolene) return null;
  const vsetky = (mediaSkupiny ?? []).flatMap(({ nazov: skupina, media }) =>
    (media ?? []).map((medium) => ({ skupina, medium })));
  const zvolene = zvoleneMedium && vsetky.find(({ skupina, medium }) =>
    skupina === zvoleneMedium.skupina && medium.nazov === zvoleneMedium.nazov);
  if (zvolene && sediMedium(zvolene.medium)) return zvolene;
  return vsetky.find(({ medium }) => sediMedium(medium)) ?? null;
}

const aktivneMedium = () => aktivnaPolozkaMedia()?.medium ?? null;

function skupinaButtonov(nazov, buttony) {
  const group = document.createElement('div');
  group.className = 'media-group';
  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = nazov;
  const presets = document.createElement('div');
  presets.className = 'presets';
  presets.append(...buttony);
  group.append(cap, presets);
  return group;
}

function buttonMedia(text, aktivny, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.classList.toggle('aktivny', aktivny);
  b.setAttribute('aria-pressed', String(aktivny));
  b.addEventListener('click', onClick);
  return b;
}

function nakresliMedia(host) {
  host.replaceChildren();
  const aktivne = aktivneMedium();
  for (const { nazov, media } of mediaSkupiny ?? []) {
    const buttony = (media ?? []).map((medium) => {
      const aktivny = medium === aktivne;
      // a click applies the whole format of the medium; the grid stays
      return buttonMedia(medium.nazov, aktivny, () => {
        for (const k of POLIA_FORMATU) spec.format[k] = medium[k];
        customZvolene = false;
        zvoleneMedium = { skupina: nazov, nazov: medium.nazov };
        ulozZvoleneMedium();
        // the panel stays open, so the fields below show the new medium
        formatPopover.rebuild();
        scheduleRender();
      });
    });
    host.append(skupinaButtonov(nazov, buttony));
  }
  // Custom keeps the current values: the editable rows below the groups are it
  host.append(skupinaButtonov('Custom', [buttonMedia('Custom', !aktivne, () => {
    customZvolene = true;
    nakresliMedia(host);
    custom1Pole?.focus();
  })]));
}

// A typed format field: the value goes to the spec and the lit medium follows.
function poleFormatu(k, attrs) {
  return numberInput(spec.format[k], attrs, (v) => {
    spec.format[k] = v;
    if (mediaHost?.isConnected) nakresliMedia(mediaHost);
  });
}

// The widest margin (grid.okraj, in dieliky) the grid takes: twice the
// margin stays below both the columns and the whole rows.
function maxOkraj() {
  const f = spec.format, cols = spec.grid.stlpce;
  const rows = Math.floor((f.vyska * cols) / f.sirka + 1e-6);
  return Math.max(0, Math.floor((Math.min(cols, rows) - 1) / 2));
}

const formatPopover = attachPopover($('#btn-format'), (pop) => {
  const f = spec.format, g = spec.grid;

  const media = document.createElement('div');
  media.className = 'media';
  mediaHost = media;
  nakresliMedia(media);

  const h3a = document.createElement('h3');
  h3a.textContent = 'Dokument';
  const h3b = document.createElement('h3');
  h3b.textContent = 'Mriežka';

  // the margin in whole dieliky of the grid, at most what leaves a column
  // and a whole row inside
  // a wider margin pushes the zones inside it at once
  const okrajPole = numberInput(g.okraj, { min: 0, max: maxOkraj(), step: 1 }, (v) => {
    spec.grid.okraj = clamp(v, 0, maxOkraj());
    vmestiZony();
    drawOverlay();
  });

  const sizeWrap = document.createElement('div');
  sizeWrap.className = 'grow';
  sizeWrap.append(
    custom1Pole = poleFormatu('sirka', { min: 10, max: 20000, step: 1 }),
    Object.assign(document.createElement('span'), { textContent: '×' }),
    poleFormatu('vyska', { min: 10, max: 20000, step: 1 }),
    selectInput([['mm', 'mm'], ['px', 'px']], f.jednotka, (v) => {
      spec.format.jednotka = v;
      if (mediaHost?.isConnected) nakresliMedia(mediaHost);
    }),
  );

  pop.replaceChildren(
    h3a,
    media,
    row('Rozmer', sizeWrap),
    row('DPI', poleFormatu('dpi', { min: 18, max: 2400, step: 1 })),
    row('Spadávka', poleFormatu('spadavka', { min: 0, max: 50, step: 1 })),
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
      // the margin stays in dieliky; a smaller grid clamps it to what fits
      spec.grid.okraj = clamp(spec.grid.okraj, 0, maxOkraj());
      okrajPole.value = String(spec.grid.okraj);
      okrajPole.max = String(maxOkraj());
    })),
    row('Okraj', okrajPole),
    row('Zvyšok výšky', selectInput(
      [['okraje', 'okraje'], ['natiahnutie', 'natiahnutie'], ['orez', 'presah a orez']],
      g.zvysok, (v) => { spec.grid.zvysok = v; })),
  );
});

// ----- šablóny popover -----

// Templates are files in the repository (presets/sablony/<slug>.json, in the
// order of presets/sablony/index.json), loaded at runtime as JSON like the
// media — the ui never imports from presets/. A file that is missing or
// unreadable is skipped. The rules (no photos, the file's shape, the match
// with the spec) live in ui/state/sablony.js; this is the panel: the list,
// and a click loads the template.
let sablony = null; // [{ subor, nazov, medium, spec }] once loaded
// the template loaded last and the spec it gave: it stays lit while the spec
// still equals it
let poslednaSablona = null;

const SABLONY_URL = new URL('../presets/sablony/', import.meta.url);

async function nacitajJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

nacitajJson(new URL('index.json', SABLONY_URL))
  .then((index) => Promise.all(suboryIndexu(index).map((subor) =>
    nacitajJson(new URL(subor, SABLONY_URL))
      .then((data) => {
        const s = citajSablonu(data);
        if (!s) throw new Error('chýba názov alebo spec');
        return { subor, ...s };
      })
      .catch((err) => {
        console.warn(`Šablónu ${subor} sa nepodarilo načítať, vynechávam ju.`, err);
        return null;
      }))))
  .then((zoznam) => zoznam.filter(Boolean))
  .catch((err) => {
    console.warn('Zoznam šablón sa nepodarilo načítať.', err);
    return [];
  })
  .then((zoznam) => {
    sablony = zoznam;
    if (sablonyPopover.isOpen()) sablonyPopover.rebuild();
    if (!uvod.hidden) nakresliUvod();
  });

// A template replaces the current spec through the same path as the saved
// state; one that does not validate leaves the current spec as it is.
// Returns whether the template was loaded.
function nacitajSablonu(s) {
  let novy;
  try {
    novy = pripravSpec(structuredClone(s.spec));
  } catch (err) {
    toast(`Šablónu „${s.nazov}“ sa nepodarilo načítať: ${err.message}`, 5000);
    return false;
  }
  closeEditor();
  selected = -1;
  fotkaMod = false;
  spec = novy;
  customZvolene = false;
  zvoleneMedium = s.medium;
  ulozZvoleneMedium();
  poslednaSablona = { subor: s.subor, spec: structuredClone(spec) };
  zoneBar.dataset.key = '';
  syncBar();
  drawOverlay();
  sablonyPopover.rebuild();
  scheduleRender();
  return true;
}

const sablonyPopover = attachPopover($('#btn-sablony'), (pop) => {
  pop.classList.add('sablony');
  if (!sablony?.length) {
    pop.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'note', textContent: 'Zatiaľ žiadne šablóny.',
    }));
    return;
  }
  const zoznam = document.createElement('div');
  zoznam.className = 'presets zoznam';
  for (const s of sablony) {
    const svieti = poslednaSablona?.subor === s.subor && zhodujeSaSoSablonou(spec, poslednaSablona.spec);
    const b = buttonMedia(s.nazov, svieti, () => nacitajSablonu(s));
    b.title = `Načítať šablónu ${s.nazov}`;
    zoznam.append(b);
  }
  pop.replaceChildren(zoznam);
});

// ----- start screen -----

// On every load the page opens on tiles (ui/state/uvod.js decides which, in
// what order): the clean canvas, Pokračovať with the saved work, then the
// templates as they arrive. A click opens the editor with that spec; the
// tiles are buttons, so Tab and Enter work too. There is no way back — the
// templates stay in the Šablóny panel and the tiles return on the next load.
const uvod = $('#uvod');
const uvodDlazdice = $('#uvod-dlazdice');

function nakresliUvod() {
  // the tile under the keyboard focus keeps it while templates arrive
  const fokus = document.activeElement?.closest?.('.dlazdica');
  const kluc = fokus ? `${fokus.dataset.druh}:${fokus.dataset.subor ?? ''}` : null;
  const buttony = dlazdiceUvodu({ cisty: cistySpec(), ulozeny: ulozenySpec, sablony: sablony ?? [] })
    .map((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dlazdica';
      b.dataset.druh = d.druh;
      if (d.sablona) b.dataset.subor = d.sablona.subor;
      const casti = [['nazov', d.nazov], ['rozmer', d.rozmer], ['popis', d.popis]]
        .filter(([, text]) => text)
        .map(([className, textContent]) => Object.assign(document.createElement('span'), { className, textContent }));
      b.append(...casti);
      b.addEventListener('click', () => otvorDlazdicu(d));
      return b;
    });
  uvodDlazdice.replaceChildren(...buttony);
  const znova = kluc && buttony.find((b) => `${b.dataset.druh}:${b.dataset.subor ?? ''}` === kluc);
  if (znova) znova.focus();
}

function otvorDlazdicu(d) {
  if (d.druh === 'sablona') {
    // a template that does not validate shows its error and keeps the tiles
    if (!nacitajSablonu(d.sablona)) return;
  } else {
    const novy = d.druh === 'pokracovat' ? ulozenySpec : cistySpec();
    if (!novy) return;
    spec = novy;
    if (d.druh === 'cisty') {
      // kept in memory only: the saved work keeps its medium until an edit
      customZvolene = false;
      zvoleneMedium = null;
    }
    syncBar();
    drawOverlay();
    scheduleRender();
  }
  neupravenyJson = d.druh === 'pokracovat' ? null : JSON.stringify(spec);
  uvod.hidden = true;
  zamkniEditor(false);
}

// While the tiles are up, the editor behind them takes no focus or clicks.
function zamkniEditor(zamknuty) {
  for (const el of [$('#topbar'), $('#stage')]) el.inert = zamknuty;
}

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
    // the shares move live during the drag; the sheet is recomposed on release
    range.addEventListener('input', () => {
      rozdelPomery(c.pomery, t.id, Number(range.value));
      obnov();
    });
    range.addEventListener('change', scheduleRender);
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

  // the shape viewer is a debugging tool, so it sits at the bottom as a quiet
  // link rather than in the top bar; its changes never reach the poster
  const prehliadac = document.createElement('button');
  prehliadac.type = 'button';
  prehliadac.id = 'btn-prehliadac';
  prehliadac.className = 'link-btn';
  prehliadac.textContent = 'Prehliadač tvarov…';
  prehliadac.addEventListener('click', () => {
    closePopovers();
    viewer.open();
  });
  const prehliadacWrap = document.createElement('div');
  prehliadacWrap.className = 'pop-foot';
  prehliadacWrap.append(prehliadac);

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
    prehliadacWrap,
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

  // JSON template: the current spec as a template file (photos left out) to
  // the clipboard; where the clipboard refuses, the text waits selected in
  // a read-only field below the buttons
  const sablonaWrap = document.createElement('div');
  sablonaWrap.className = 'sablona-json';
  const sablonaBtn = document.createElement('button');
  sablonaBtn.type = 'button';
  sablonaBtn.textContent = 'JSON template';
  sablonaBtn.addEventListener('click', () => {
    const polozka = aktivnaPolozkaMedia();
    const text = sablonaJson(spec, polozka && { skupina: polozka.skupina, nazov: polozka.medium.nazov });
    const ukazText = () => {
      const pole = document.createElement('textarea');
      pole.readOnly = true;
      pole.spellcheck = false;
      pole.rows = 8;
      pole.value = text;
      pole.setAttribute('aria-label', 'JSON šablóny');
      sablonaWrap.replaceChildren(pole);
      pole.focus();
      pole.select();
      toast('Schránka nie je dostupná: text šablóny je označený, skopíruj ho.', 5000);
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast('Skopírované'), ukazText);
    } catch {
      ukazText(); // no clipboard at all (an insecure page)
    }
  });
  const sablonaPresets = document.createElement('div');
  sablonaPresets.className = 'presets sablona-tlacidlo';
  sablonaPresets.append(sablonaBtn);

  pop.replaceChildren(
    mkH('Export'),
    wrap,
    pngDims,
    svgNote,
    avifWrap,
    sablonaPresets,
    sablonaWrap,
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

// opened from the Parametre popover (Prehliadač tvarov…)
const viewer = createViewer(() => spec.kresba);

// ---------- boot ----------

if (engine.isStubEngine) $('#stub-note').hidden = false;

setZoomOptions();
zoomSelect.value = 'fit';
// the sheet is composed once a tile is clicked
zamkniEditor(true);
nakresliUvod();
