# F1 Zeitenliste

Rundenzeiten aus F1 25 eintragen und live vergleichen. Details und Plan: siehe `CLAUDE.md`.

## Auf dem Mac starten

Einmalig Node.js installieren (z. B. `brew install node`), dann im Projektordner:

```bash
npm install
npm run dev      # Entwicklungsserver, Adresse steht im Terminal
npm test         # Tests für Zeitformat, Ranglisten, Eingabeprüfung, CSV, Datenbankzeilen
npm run build    # fertige Dateien nach dist/
```

Zum Testen auf dem Handy im selben WLAN: `npm run dev -- --host`.

## Supabase einrichten

1. `supabase/schema.sql` öffnen, oben bei `admin_emails` die E-Mails der Admin-Benutzer eintragen (vorher unter Authentication → Users anlegen),
   alles in den Supabase **SQL Editor** kopieren und **Run**. Das Ergebnis zeigt den **Event-Code**.
2. `.env.example` nach `.env` kopieren und Project URL und anon/publishable key eintragen
   (Supabase → Project Settings → API). Nie den service_role/secret key verwenden.
3. `npm run dev` neu starten und die App mit `?code=<Event-Code>` öffnen, z. B.
   `http://localhost:5173/?code=abcd2345`. Der Code wird auf dem Gerät gemerkt.

Den Event-Code ändern: im SQL Editor `update private.einstellungen set event_code = 'neuercode';`

## Aufbau

- `src/zeit.js` – Zeitformat, Ranglisten, Eingabeprüfung (ohne Oberfläche, getestet)
- `src/csv.js` – CSV-Backup erstellen und einlesen
- `src/laps.js` – Umwandlung Datenbankzeile ↔ Eintrag, Fehlerarten (getestet)
- `src/store.js` – Datenspeicher: Supabase, Warteschlange für offline, Live-Aktualisierung
- `src/main.js` – Oberfläche
- `supabase/schema.sql` – Tabelle, Rechte, Row Level Security, Limits, Live-Signal
- `prototype/` – der ursprüngliche Prototyp als Vorlage
