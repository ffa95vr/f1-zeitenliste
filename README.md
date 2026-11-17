# F1 Zeitenliste

Rundenzeiten aus F1 25 eintragen und live vergleichen. Details und Plan: siehe `CLAUDE.md`.

## Auf dem Mac starten

Einmalig Node.js installieren (z. B. `brew install node`), dann im Projektordner:

```bash
npm install
npm run dev      # Entwicklungsserver, Adresse steht im Terminal
npm test         # Tests für Zeitformat, Ranglisten, Eingabeprüfung, CSV
npm run build    # fertige Dateien nach dist/
```

Zum Testen auf dem Handy im selben WLAN: `npm run dev -- --host`.

## Aufbau

- `src/zeit.js` – Zeitformat, Ranglisten, Eingabeprüfung (ohne Oberfläche, getestet)
- `src/csv.js` – CSV-Backup erstellen und einlesen
- `src/store.js` – Datenspeicher (Schritt 1: localStorage, Schritt 2: Supabase)
- `src/main.js` – Oberfläche
- `prototype/` – der ursprüngliche Prototyp als Vorlage
