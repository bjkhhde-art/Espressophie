# Supabase – Datenbank für die Community

Projekt **Espressophie** (`zzxkdfwuspxaqzdbnluk`), Region **Frankfurt (eu-central-1)**.
Dieser Ordner wird nicht veröffentlicht (Unterstrich) – er dokumentiert nur das Schema.

**Grundsatz:** Shot-Daten bleiben im Google Drive der Nutzer. In die Datenbank kommt nur,
was geteilt wird: Profile (Anzeigename), öffentliche Rezepte, Röstereien.

## Tabellen

| Tabelle    | Inhalt | Wer sieht was | Wer schreibt |
|------------|--------|---------------|--------------|
| `roasters` | Röstereien-Verzeichnis | alle: nur `status = 'freigegeben'` | nur Admin (Dashboard) |
| `recipes`  | Rezepte (Felder wie der Rezept-Link der App) | alle: öffentliche · Autor: eigene | nur der Autor (anlegen, ändern, löschen) |
| `profiles` | Anzeigename pro Konto, keine E-Mail | alle | jeder nur sein eigenes (wird bei Registrierung automatisch angelegt) |

Alle Tabellen haben Row Level Security. Getestet am 2026-10-03: anonyme Besucher sehen nur
freigegebene Röstereien und öffentliche Rezepte und können nichts anlegen; Nutzer sehen,
ändern und löschen keine fremden privaten Rezepte.

## Rösterei eintragen (Dashboard → Table Editor → roasters)

`slug` (z. B. `roesterei-am-hafen`, nur Kleinbuchstaben/Zahlen/Bindestrich), `name`, optional
`plz`, `ort`, `beschreibung`, `website`/`shop` (mit `https://`), `instagram` (ohne @),
`espresso_bohnen`, `tags`, `nutzt_qr`. Erst sichtbar, wenn `status` auf `freigegeben` steht.
Nur öffentlich zugängliche, geschäftliche Angaben verwenden (Website, Shop, Instagram der Rösterei).
Widerspricht eine Rösterei oder will sie etwas ändern: umgehend umsetzen (Datenschutzerklärung 5.2).

## Vor echten Nutzerdaten

- Pro-Plan (Free pausiert nach 1 Woche ohne Nutzung, keine Backups)
- Auftragsverarbeitungsvertrag (DPA) im Dashboard abschließen
- Datenschutzerklärung um Supabase ergänzen
- Den `service_role`-Schlüssel nie in Website oder App einbauen – nur den öffentlichen (`anon`/publishable)

## Migrationen

`migrations/` enthält das SQL in der Reihenfolge, in der es angewendet wurde.
