# Espressophie – Website

Homepage der App **Espressophie** – „Verstehen, was in der Tasse passiert.“

**Grundsatz: In der App wird getrackt, auf der Website ausgewertet und entdeckt.**
Die Website trägt nichts ein und verändert keine Daten.

Statische Seite, ausgeliefert über GitHub Pages:

- `index.html` – Startseite
- `auswertung/` – Auswertung: liest nach Google-Anmeldung die Datei der App aus dem eigenen Google Drive (nur lesen)
  und vergleicht Bohnen und Röstereien, Geschmack, beste Rezepte (teilbar), Kosten.
  Das Google-Skript wird erst beim Klick auf „Mit Google anmelden“ geladen. `demo.json` = Beispieldaten.
- `app/` – leitet auf `auswertung/` weiter (alte Adresse)
- `roestereien/` – Röstereien-Verzeichnis; **Einträge in `roestereien/roestereien.json`** (siehe unten)
- `roestereien/mitmachen/` – für Röstereien: Eintrag anfragen + QR-Code-Generator
- `r/` – Seite für geteilte Rezepte und Packungen (Link aus App, Auswertung oder QR-Code)
- `datenschutz.html`, `impressum.html` – Rechtliches
- **`_config.yml` – Name, Adresse, E-Mail und Google-Client-ID (nur hier ändern)**.
  GitHub Pages schreibt die Werte beim Veröffentlichen fest in die Seiten.
  Deshalb darf es **keine** Datei `.nojekyll` im Repository geben.
- `.well-known/assetlinks.json` – öffnet Rezept-Links direkt in der App
- `404.html`, `robots.txt`, `sitemap.xml`
- `main.js` – Animationen, Konto oben rechts, Akzentfarbe
- `style.css` – Design im Stil der App („Modern“), Hell/Dunkel folgt dem System
- `assets/app/` – Screenshots der App (Beispieldaten), je hell und dunkel

Keine Cookies, keine externen Schriften oder Skripte (Ausnahme: Google-Anmeldung, erst nach Klick).

## Rösterei eintragen

In `roestereien/roestereien.json` einen Eintrag in die Liste `roestereien` einfügen
(Komma zwischen den Einträgen nicht vergessen). Nur `name` ist Pflicht:

```json
{
  "name": "Name der Rösterei",
  "plz": "20095",
  "ort": "Hamburg",
  "text": "Ein, zwei Sätze über die Rösterei.",
  "website": "https://…",
  "shop": "https://…",
  "instagram": "@name",
  "espresso": ["Bohne 1", "Bohne 2"],
  "tags": ["Bio", "Direkthandel"],
  "qr": true
}
```

`qr: true` = die Rösterei druckt Espressophie-QR-Codes mit Startrezept auf ihre Packungen
(wird im Verzeichnis hervorgehoben). Nur Röstereien eintragen, die zugestimmt haben.

## Später: Community

Verzeichnis und Rezept-Links funktionieren ohne Server. Für eine echte Community
(Profile, öffentliche Rezepte, Bewertungen) käme später ein Backend dazu –
die Einträge in `roestereien.json` können dann übernommen werden.
