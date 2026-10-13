// Šablóny (templates): files in the repository, presets/sablony/<slug>.json,
// listed in display order by presets/sablony/index.json. Each one is the whole
// spec plus the chosen medium under a name, with an optional short popis
// (one or two sentences the start screen shows on the template's tile). Pure data rules only — no DOM, no
// fetch: the page loads the files and hands their parsed JSON here, so
// everything here runs (and is tested) in Node.
//
// A template never carries photos: every photo zone loses its `zdroj`
// (rezim, posun, zoom and its place stay), and the editor shows a placeholder
// in a photo zone without one until the user drops their own photo in.

// The name a copied template carries until the owner names it in its file.
export const NAZOV_NOVEJ_SABLONY = 'Nová šablóna';

// A deep copy of the spec with the photo sources removed.
export function bezFotiek(spec) {
  const kopia = structuredClone(spec);
  if (Array.isArray(kopia?.zony)) {
    for (const z of kopia.zony) {
      if (z && typeof z === 'object' && z.typ === 'fotka') delete z.zdroj;
    }
  }
  return kopia;
}

const jeObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A medium as the page remembers it ({ skupina, nazov }) or null.
function upravMedium(m) {
  return jeObjekt(m) && typeof m.skupina === 'string' && typeof m.nazov === 'string'
    ? { skupina: m.skupina, nazov: m.nazov }
    : null;
}

// The text of one template file made from the current spec and medium:
// what "JSON template" copies, ready to be pasted into presets/sablony/.
// The popis is written empty, so the designer finds the field to fill in.
export function sablonaJson(spec, medium) {
  const sablona = {
    nazov: NAZOV_NOVEJ_SABLONY, popis: '', medium: upravMedium(medium), spec: bezFotiek(spec),
  };
  return `${JSON.stringify(sablona, null, 2)}\n`;
}

// The file names of index.json in their order: strings naming a .json file
// in the same directory, each once; anything else is left out.
export function suboryIndexu(index) {
  const zoznam = jeObjekt(index) && Array.isArray(index.sablony) ? index.sablony : [];
  const out = [];
  for (const s of zoznam) {
    if (typeof s === 'string' && /^[^/\\]+\.json$/.test(s) && s !== 'index.json' && !out.includes(s)) {
      out.push(s);
    }
  }
  return out;
}

// One parsed template file as { nazov, popis?, medium, spec }, or null when
// it lacks a name or a spec object. The popis is kept only when it is a
// string (trimmed); anything else is left out. The spec itself is only checked for its shape
// here; the page validates it on load through the same path as a saved spec,
// and a photo source that slipped in is dropped.
export function citajSablonu(data) {
  if (!jeObjekt(data) || !jeObjekt(data.spec)) return null;
  const nazov = typeof data.nazov === 'string' ? data.nazov.trim() : '';
  if (!nazov) return null;
  const sablona = { nazov };
  if (typeof data.popis === 'string') sablona.popis = data.popis.trim();
  return Object.assign(sablona, { medium: upravMedium(data.medium), spec: bezFotiek(data.spec) });
}

// JSON with object keys sorted, so two specs compare by content, not by the
// order their fields were set in.
function stabilnyJson(v) {
  if (Array.isArray(v)) return `[${v.map(stabilnyJson).join(',')}]`;
  if (jeObjekt(v)) {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stabilnyJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// Whether the spec still equals the template's spec; photo sources do not
// count, so dropping a photo into the placeholder keeps the template lit.
export function zhodujeSaSoSablonou(spec, sablonaSpec) {
  return stabilnyJson(bezFotiek(spec)) === stabilnyJson(bezFotiek(sablonaSpec));
}
