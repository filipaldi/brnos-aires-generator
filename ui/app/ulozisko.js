// Browser adapter: one text value under one localStorage key. Every access is
// wrapped — in a private window, with blocked site data or a full storage the
// page keeps working in memory and only loses what it could not keep.

export function ulozisko(kluc) {
  return {
    citaj() {
      try {
        return localStorage.getItem(kluc);
      } catch {
        return null;
      }
    },
    zapis(text) {
      try {
        localStorage.setItem(kluc, text);
        return true;
      } catch {
        return false;
      }
    },
  };
}
