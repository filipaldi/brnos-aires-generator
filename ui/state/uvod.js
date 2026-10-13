// Úvod (the start screen): on every page load the page shows tiles instead
// of the blank canvas, and a click on one opens the editor. Pure data rules
// only — no DOM, no storage: the page hands in the clean spec, the saved one
// (or null) and the loaded templates, and draws the tiles this returns, so
// everything here runs (and is tested) in Node.
//
// The order is fixed: the clean canvas first, then Pokračovať when there is
// saved work in the browser, then the repository's templates in the order of
// presets/sablony/index.json (the order they are handed in).

export const NAZOV_CISTEHO = 'Čistý canvas';
export const NAZOV_POKRACOVAT = 'Pokračovať';
export const POPIS_CISTEHO = 'Prázdny list bez šablóny.';
export const POPIS_POKRACOVAT = 'Rozpracovaná práca uložená v tomto prehliadači.';

const jeObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The size of a format as a tile shows it, "1080 × 1080 px"; '' when the
// format lacks its width, height or unit.
export function rozmerFormatu(format) {
  if (!jeObjekt(format)) return '';
  const { sirka, vyska, jednotka } = format;
  if (!Number.isFinite(sirka) || !Number.isFinite(vyska) || typeof jednotka !== 'string' || !jednotka) return '';
  return `${sirka} × ${vyska} ${jednotka}`;
}

// The tiles of the start screen, each { druh, nazov, rozmer, popis } and a
// template's tile also { sablona } (the template it opens):
//   cisty       the clean canvas, sized as the clean spec
//   pokracovat  only when `ulozeny` is a spec, sized as that spec
//   sablona     one per template, its popis only when it has one
// A template's format may leave fields to the clean spec's defaults, so its
// size falls back to them field by field.
export function dlazdiceUvodu({ cisty, ulozeny = null, sablony = [] } = {}) {
  const zaklad = jeObjekt(cisty?.format) ? cisty.format : {};
  const dlazdice = [{
    druh: 'cisty', nazov: NAZOV_CISTEHO, rozmer: rozmerFormatu(zaklad), popis: POPIS_CISTEHO,
  }];
  if (jeObjekt(ulozeny)) {
    dlazdice.push({
      druh: 'pokracovat', nazov: NAZOV_POKRACOVAT, rozmer: rozmerFormatu(ulozeny.format), popis: POPIS_POKRACOVAT,
    });
  }
  for (const sablona of Array.isArray(sablony) ? sablony : []) {
    if (!jeObjekt(sablona) || typeof sablona.nazov !== 'string') continue;
    const format = jeObjekt(sablona.spec?.format) ? sablona.spec.format : {};
    dlazdice.push({
      druh: 'sablona',
      nazov: sablona.nazov,
      rozmer: rozmerFormatu({ ...zaklad, ...format }),
      popis: typeof sablona.popis === 'string' ? sablona.popis.trim() : '',
      sablona,
    });
  }
  return dlazdice;
}
