// Šablóny (user-made templates): the whole spec plus the chosen medium, saved
// under a name. Pure data rules only — no DOM, no storage: the page reads and
// writes the serialized list through the browser adapter ui-app supplies, so
// everything here runs (and is tested) in Node.
//
// A template never carries photos: every photo zone loses its `zdroj`
// (rezim, posun, zoom and its place stay), and the editor shows a placeholder
// in a photo zone without one until the user drops their own photo in.

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

// A typed name, trimmed with inner whitespace collapsed; '' when nothing is left.
export function upravNazov(nazov) {
  return typeof nazov === 'string' ? nazov.trim().replace(/\s+/g, ' ') : '';
}

const jeObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A medium as the page remembers it ({ skupina, nazov }) or null.
function upravMedium(m) {
  return jeObjekt(m) && typeof m.skupina === 'string' && typeof m.nazov === 'string'
    ? { skupina: m.skupina, nazov: m.nazov }
    : null;
}

// The template saved from the current spec and medium.
export function vytvorSablonu(nazov, spec, medium) {
  return { nazov: upravNazov(nazov), spec: bezFotiek(spec), medium: upravMedium(medium) };
}

// The stored list as text.
export function serializujSablony(sablony) {
  return JSON.stringify(sablony.map(({ nazov, spec, medium }) => ({ nazov, spec, medium })));
}

// The stored text back as a list. Anything unreadable — bad JSON, not an
// array, an item without a name or a spec object, a repeated name — is left
// out, never thrown: the page works with whatever survives. The spec itself
// is only checked for its shape here; the page validates it on load through
// the same path as a saved spec, and a photo source that slipped in is dropped.
export function parsujSablony(text) {
  if (typeof text !== 'string' || !text) return [];
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out = [];
  const mena = new Set();
  for (const item of data) {
    if (!jeObjekt(item) || !jeObjekt(item.spec)) continue;
    const nazov = upravNazov(item.nazov);
    if (!nazov || mena.has(nazov)) continue;
    mena.add(nazov);
    out.push({ nazov, spec: bezFotiek(item.spec), medium: upravMedium(item.medium) });
  }
  return out;
}

export const najdiSablonu = (sablony, nazov) => sablony.find((s) => s.nazov === upravNazov(nazov));

// The list with the template added at the end, or replacing the one of the
// same name in its place (the page asks before overwriting).
export function pridajSablonu(sablony, sablona) {
  const i = sablony.findIndex((s) => s.nazov === sablona.nazov);
  if (i < 0) return [...sablony, sablona];
  return sablony.map((s, j) => (j === i ? sablona : s));
}

// The list with one template renamed in place; unchanged when the new name is
// empty or taken by another template.
export function premenujSablonu(sablony, stary, novy) {
  const nazov = upravNazov(novy);
  if (!nazov || sablony.some((s) => s.nazov === nazov && s.nazov !== stary)) return sablony;
  return sablony.map((s) => (s.nazov === stary ? { ...s, nazov } : s));
}

export const zmazSablonu = (sablony, nazov) => sablony.filter((s) => s.nazov !== nazov);

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
