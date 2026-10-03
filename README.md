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
- `roestereien/` – Röstereien-Verzeichnis; Einträge kommen aus der Supabase-Tabelle `roasters` (siehe unten und `_supabase/README.md`)
- `roestereien/mitmachen/` – für Röstereien: Eintrag anfragen + QR-Code-Generator
- `r/` – Seite für geteilte Rezepte und Packungen (Link aus App, Auswertung oder QR-Code)
- `datenschutz.html`, `impressum.html` – Rechtliches
- **`_config.yml` – Name, Adresse, E-Mail, Google-Client-ID und Supabase-Adresse/öffentlicher Schlüssel (nur hier ändern)**.
  GitHub Pages schreibt die Werte beim Veröffentlichen fest in die Seiten.
  Deshalb darf es **keine** Datei `.nojekyll` im Repository geben.
- `.well-known/assetlinks.json` – öffnet Rezept-Links direkt in der App
- `404.html`, `robots.txt`, `sitemap.xml`
- `_tools/vorschau-server.js` – lokale Vorschau (`node _tools/vorschau-server.js`, dann http://localhost:8769); wird nicht veröffentlicht
- `main.js` – Animationen, Konto oben rechts, Akzentfarbe
- `style.css` – Design im Stil der App („Modern“), Hell/Dunkel folgt dem System
- `assets/app/` – Screenshots der App (Beispieldaten), je hell und dunkel

Keine Cookies, keine externen Schriften oder Skripte (Ausnahme: Google-Anmeldung, erst nach Klick).

## Rösterei eintragen

Im Supabase-Dashboard → **Table Editor → roasters** eine Zeile anlegen. Sichtbar auf der Website wird sie erst,
wenn `status` auf `freigegeben` steht (nach Zustimmung der Rösterei). Felder: siehe `_supabase/README.md`.

## Später: Community

Verzeichnis und Rezept-Links funktionieren ohne Server. Für eine echte Community
(Profile, öffentliche Rezepte, Bewertungen) käme später ein Backend dazu –
Grundlage (Tabellen `roasters`, `recipes`, `profiles`) steht bereits in Supabase.
