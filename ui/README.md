# Rozhranie generátora — fáza 4

Webové rozhranie generátora: hore jedna lišta, pod ňou plátno. Beží priamo
v prehliadači, bez build kroku a bez závislostí.

## Spustenie

```sh
node ui/serve.js
```

Otvor `http://localhost:41235/ui/`. Server servíruje koreň
repozitára, takže jadro (`/core/`) aj fonty
(`/fonts/`) sa nahrajú na tie isté adresy ako v produkcii.

## Čo kde je

| Súbor | Obsah |
|---|---|
| `serve.js` | malý statický server (port 41235) |
| `index.html`, `ui.css` | kostra stránky a štýl (čierno-biely) |
| `ui.js` | lišta, popovery, plátno, zóny, ukladanie stavu |
| `state/sablony.js` | pravidlá šablón bez DOM: zahodenie fotiek, text pre JSON template, čítanie `index.json` a súboru šablóny, zhoda so specom |
| `engine.js` | adapter: natiahne `core/kompozicia`, kým neexistuje, použije `stub.js`; skladanie posiela do workera, pri zlyhaní kreslí na hlavnom vlákne |
| `worker.js` | web worker so skladaním (`komponuj` jadra mimo hlavné vlákno) |
| `stub.js` | náhradný engine (rovnaké API, náhodné rozmiestnenie so seedom) |
| `viewer.js` | prehliadač tvarov (tlačidlo Tvary) |
| `meranie.js` | meranie šírky textu cez canvas (fonty a rezy ako v SVG) pre zalomenie do zóny a tesných obdĺžnikov písmen (`zmerajGlyfy`) pre obtekanie textu vzorom; funguje aj vo workeri |
| `export.js` | SVG priamo, PNG/AVIF cez canvas s vloženými fontmi; v claude.ai artefakte ukladá cez hostiteľa (downloads, bez AVIF) |
| `smoke.mjs` | smoke test cez Playwright s piatimi screenshotmi (aj mód Fotka fotozóny) |

## Práca s rozhraním

- **Zóna:** potiahni po prázdnom mieste, prichytáva sa na dieliky. Dvojklik
  → textová zóna; pretiahni fotku → fotková zóna. Presun ťahaním,
  veľkosť za rohy. Vybraná zóna má pod sebou lištu s parametrami.
- **Typy v Parametroch:** popover ukazuje typy ako jeden stĺpec dlaždíc (ikona,
  posuvník „podiel“ v %, rozsah „veľkosť“). Podiely držia súčet presne 100 %:
  pohyb jedného posuvníka rozloží zvyšok pomerne na ostatné typy. Aj kvapka
  má rozsah veľkosti (jej šírku). Riadok „Krúžky a kvapky“ už neexistuje.
- **Fotka:** lišta fotozóny s fotkou má dva módy. **Rámik** (predvolený):
  ťahanie zóny a jej rohov hýbe rámikom aj fotkou spolu. **Fotka:** celá
  fotka je vidieť, časť mimo rámika priesvitne; ťahanie fotky ju posúva,
  okrúhle rohy fotky ju proporčne zväčšia či zmenšia, štvorcové rohy a hrany
  rámika menia rámik a fotka ostane na mieste. Fotka vždy pokryje rámik
  (mierka aspoň 100 %), posun aj mierka sú celé %. Dvojklik ani koliesko
  fotku nemenia; mód sa do spec neukladá.
- **Klávesy len na vybranej zóne:** Delete/Backspace ju maže, Cmd/Ctrl+C
  kopíruje, Cmd/Ctrl+V prilepí kópiu o dielik vpravo dole, Cmd/Ctrl+D
  duplikuje, Escape ruší výber. V poliach (textový editor, čísla, ponuky)
  klávesy fungujú normálne a všetko sa dá aj vyklikať — zónu duplikuje
  tlačidlo v jej lište, maže ✕. Prehliadač tvarov otvára tlačidlo Tvary.
- **Skladanie beží vo web workeri:** pri zmene ostáva na plátne stará kresba
  a v hornom paneli svieti „skladám…“, kým nová nie je hotová. Posuvníky v
  Parametroch počas ťahania menia len číslo (a spec); list sa prekreslí až
  po pustení alebo kliknutí.
- **Čísla** v ponukách sú celé, desatinné sa zaokrúhlia.

- **Šablóny:** panel Šablóny v lište ukazuje šablóny z repozitára
  (`presets/sablony/`), klik šablónu načíta. Export → JSON template
  skopíruje aktuálny dokument ako súbor šablóny (bez fotiek).

Stav sa automaticky ukladá do `localStorage`; náhodný variant tlačidlom `⟳`
je jediné miesto, kde rozhranie ťahá náhodu (engine zostáva deterministický).

## Náhradný engine

Kým nevznikne `core/kompozicia/` (fáza 2), rozhranie zobrazuje v
rohu poznámku „náhradný engine“ a kreslí `stub.js`: rovnaké API
(`normalizujSpec`, `komponuj`), triviálne rozmiestnenie so seedom z variantu.
Po doplnení jadra sa prepne automaticky, bez zmeny v rozhraní.

## Smoke test

```sh
node ui/smoke.mjs [adresár-pre-screenshoty]
```

Vyžaduje Playwright v globálnych `node_modules` (`npm root -g`) a Chromium v
`PLAYWRIGHT_BROWSERS_PATH`. Server si podľa potreby sám spustí a vypne.

Už bežiaci web (napr. `_site` z `scripts/zostav-web.sh` servírovaný cez
`python3 -m http.server`) otestuješ premennou `BASE_URL`; skúša sa vždy
`<base>/ui/`:

```sh
BASE_URL=http://localhost:8000 node ui/smoke.mjs /tmp/web-screenshoty
```
