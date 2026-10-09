#!/bin/sh
# Zostaví adresár s tým, čo generátor v prehliadači naozaj načítava
# (GitHub Pages, lokálny test): ui/ bez serve.js a smoke.mjs (tie sú len
# pre vývoj), celé core/, fonts/ a JSON, ktoré jadro importuje —
# proporcie.json (core/axes.js) a assets.json (core/primitives/krivka.js);
# fonty hlási ui.css a ui/export.js. Navyše CNAME, .nojekyll a index.html
# presmerujúci koreň na ui/. Nič iné do _site nepatrí.
#   scripts/zostav-web.sh <výstupný-adresár>
# Exit 0 = zostavené, 1 = chýba kus, 2 = zlé použitie.

set -eu

[ $# -eq 1 ] || { echo "usage: $0 <výstupný-adresár>" >&2; exit 2; }

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
OUT=$1

[ -f "$ROOT/ui/index.html" ] || {
    echo "zostav-web: v $ROOT nevyzerá byť repozitár generátora" >&2; exit 2; }

rm -rf "$OUT"
mkdir -p "$OUT/ui" "$OUT/core" "$OUT/fonts"

# vývojové súbory ui/ servujú len lokálne, prehliadač ich nenačítava
for f in "$ROOT"/ui/*; do
    case $f in */serve.js|*/smoke.mjs) continue ;; esac
    cp "$f" "$OUT/ui/"
done
cp -R "$ROOT"/core/. "$OUT/core/"
cp "$ROOT"/fonts/* "$OUT/fonts/"
cp "$ROOT/proporcie.json" "$ROOT/assets.json" "$OUT/"

printf '%s\n' 'generator.brnosaires.com' >"$OUT/CNAME"
: >"$OUT/.nojekyll"
cat >"$OUT/index.html" <<'HTML'
<!doctype html>
<html lang="sk">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=ui/">
  <title>Generátor Brnos Aires</title>
</head>
<body>
  <p>Generátor býva v <a href="ui/">ui/</a> — presmerovávam ťa tam.</p>
</body>
</html>
HTML

# pojistka: kus, bez ktorého web nefunguje, nesmie v zostave chýbať
for f in ui/index.html ui/ui.js ui/worker.js core/index.js core/kompozicia/index.js \
         fonts/brnos-aires.woff2 fonts/nunito-variable.ttf proporcie.json assets.json; do
    [ -f "$OUT/$f" ] || { echo "zostav-web: v zostave chýba $f" >&2; exit 1; }
done
echo "zostavené v $OUT"
