# F1 Zeitenliste – Projektbeschreibung

Sprache: Antworten, Oberfläche und Kommentare auf **Deutsch**. Entwickelt wird auf einem **Mac** (macOS, Terminal-Befehle für zsh/bash).
Arbeitsweise: in kleinen Schritten arbeiten, nach jedem Schritt kurz sagen, was geändert wurde, und es testen. Vor größeren Entscheidungen (Hosting, Dienste, Kosten) kurz nachfragen.

## Ziel und Termin

Eine Web-App, in der Spieler ihre Rundenzeiten aus F1 25 eintragen und alle Zeiten live vergleichen können. Anlass ist das **Weihnachtsessen am 4. Dezember** in einem Geschäft mit drei Fahrstationen und ca. 35–40 Leuten. **Bis dahin muss Version 1 (siehe unten) laufen.** Alles Weitere (Konten, Freunde) kommt danach.

## Ausgangspunkt: der fertige Prototyp

Datei: `prototype/f1-25-zeitenliste.html` (eine einzelne HTML-Datei, die Daten liegen nur lokal im Browser, `localStorage`-Schlüssel `f1xmas_v1`).
**Bitte zuerst vollständig lesen.** Ihr Verhalten und Aussehen sollen in der neuen App erhalten bleiben. Was der Prototyp kann:

- **Eintragen:** Name, Strecke, Auto/Team (optional), Station, Rundenzeit, drei optionale Sektorzeiten. Datum und Uhrzeit werden automatisch gespeichert.
- **Neue-Bestzeit-Karte** direkt nach dem Speichern: „Neue Bestzeit!" mit Abstand zur alten Zeit, „Erste Zeit auf …", „Keine neue Bestzeit" mit Rückstand, plus „Neuer Rekord an <Station> auf <Strecke>", wenn es die schnellste Zeit an dieser Station ist.
- **Zeiten:** jede Fahrt als eigene Zeile (neueste zuerst), filterbar nach Fahrer und Strecke, Löschen mit Bestätigung.
- **Fahrer:** Fortschritt eines Fahrers, gruppiert nach Strecke, mit Verlaufsdiagramm, Veränderung zur vorherigen Fahrt (grün = schneller, rot = langsamer), hervorgehobener Bestzeit und „Idealer Runde" aus den besten Sektoren.
- **R21 / R5 / G29:** Rangliste je Station und Strecke (beste Zeit pro Fahrer).
- **Wertung:** Ansicht „Pro Rig" (ein Rig wählbar) oder „Zusammen" (frei wählbar, welche Rigs zusammengezählt werden), jeweils als Siegerpodest für Platz 1–3 und darunter die Liste.
- **Gefahren:** wer schon gefahren ist (Anzahl Strecken und Zeiten).
- **TV:** große Rangliste (Top 10) für Fernseher oder Beamer. Wechselt automatisch alle 12 s die Strecke, springt bei einer neuen Zeit sofort zu deren Strecke, Auswahl „Alle Rigs" oder einzelnes Rig, Pause, nächste Strecke, Vollbild.
- **Mehr:** QR-Code zur App, CSV-Backup erstellen und wieder einspielen (doppelte Zeilen werden übersprungen).

## Regeln, die beibehalten werden müssen

- **Zeitformat:** Anzeige und Eingabe als `m.ss,ttt`, z. B. `1.17,156` = 1 Minute 17,156 Sekunden. Intern ganze Millisekunden.
  - Die Android-Zahlentastatur hat keinen Doppelpunkt, nur Punkt und Komma. Deshalb dieses Format. **Keine automatische Umformatierung während des Tippens** (das hat den Cursor springen lassen).
  - Beim Einlesen zusätzlich akzeptieren: `17,156` (unter einer Minute) und `1:17.156`. Sekunden ab 60 sind ungültig.
  - Sektorzeiten werden mit Komma eingegeben, z. B. `28,456`.
- **Sektoren:** optional. Sind alle drei ausgefüllt, darf die Rundenzeit leer bleiben (Summe). Sind beide angegeben, müssen sie übereinstimmen, sonst Fehlermeldung. Sektoren zusammen dürfen nie länger sein als die Runde.
- **Ranglisten:** pro Fahrer und Strecke zählt nur die schnellste Zeit. Gleiche Zeit = gleicher Rang. Zeiten verschiedener Strecken werden nie verglichen.
- **Stationen:** `R21`, `R5` (Lenkrad am PC), `G29` (Logitech G29 an der PS5). Nur diese Namen, **kein** „Rig" davor. Später sollen Geräte frei anlegbar sein.
- **Strecken:** die 24 Strecken der F1-25-Saison (siehe `TR` im Prototyp), eigene Namen zusätzlich erlaubt. Gleiche Namen unabhängig von Groß/Klein zusammenführen.
- **Namen der Fahrer:** Groß/Klein ignorieren beim Zusammenführen; vorhandene Schreibweise übernehmen.
- **Design:** Helles Abrag-Design nach abrag.ch (`#F0F0F0` Hintergrund, `#FFFFFF` Karten, Text `#0B0B0B`) mit Gold/Silber/Bronze für die Plätze 1–3, Schrift Manrope, Akzent Abrag-Orange `#DC6E2D` (Text auf Orange dunkel, orange Schrift auf Weiss `#A9501C`). TV-Ansicht dunkel (Anthrazit `#141414`), damit der Fernseher nicht blendet. Name: „F1 25 – Zeitenliste Weihnachtsessen Abrag 2026“. Mobile First, bedienbar mit einer Hand, Touch-Ziele mindestens 44 px. Farben und Abstände stehen als CSS-Variablen am Anfang des Prototyps.

## Version 1 – bis 4. Dezember (die Hauptaufgabe)

Der Prototyp speichert nur auf einem Gerät. Für das Fest soll **alles in einer gemeinsamen Datenbank** liegen:

1. **Gäste tragen ohne Konto selbst ein.** Sie öffnen per QR-Code einen Link auf dem Handy (Android/iPhone) und können eintragen und alle Zeiten, Ranglisten und das Podium sehen. Keine Anmeldung, keine Installation.
2. **Nur der Admin darf löschen und ändern.** Der Admin (der Auftraggeber, am Mac-Laptop) meldet sich mit E-Mail und Passwort an. Erst dann erscheinen Löschen, Bearbeiten, Backup/Import. Gäste können weder löschen noch ändern, auch nicht ihre eigenen Einträge.
3. **Live:** neue Zeiten erscheinen ohne Neuladen auf allen Geräten, vor allem im **TV-Modus**, der auf dem Laptop läuft und auf den Fernseher gespiegelt wird.
4. **Der Admin trägt ebenfalls über dieselbe Oberfläche ein**, wenn er vor Ort ist. Es gibt keine zweite Datenquelle.
5. Prototyp-Daten (CSV aus „Mehr → Backup") müssen der Admin einspielen können.

### Technik (Vorschlag, gern mit Begründung ändern)

- **Backend:** Supabase (Postgres, Realtime, Auth). Tabelle `laps` mit: `id`, `name`, `strecke`, `station`, `auto`, `zeit_ms`, `s1_ms`, `s2_ms`, `s3_ms`, `created_at`.
- **Sicherheit auf Datenbankebene (Row Level Security), nicht nur in der Oberfläche:**
  - Anonyme Nutzer: `SELECT` und `INSERT` auf `laps`, **kein** `UPDATE` und **kein** `DELETE`.
  - Admin (festgelegte Benutzer-ID): alles.
  - Eingaben in der Datenbank prüfen: Station nur R21/R5/G29, `zeit_ms` zwischen 1 und 599 999, Namen und Strecken mit begrenzter Länge, Sektoren nicht länger als die Runde.
  - Missbrauch begrenzen (z. B. einfaches Limit pro Zeit oder ein Event-Code im Link/QR), ohne dass Gäste sich anmelden müssen.
  - Keine Schlüssel mit Schreibrechten im Frontend-Code. Der öffentliche `anon`-Schlüssel darf dort stehen, der `service_role`-Schlüssel nie.
- **Frontend:** weiter eine einfache Web-App (PWA, „Zum Startbildschirm hinzufügen"), z. B. Vite plus reines JavaScript oder React. Die vorhandene Logik und Oberfläche übernehmen, nicht neu erfinden.
- **Hosting:** statisch auf Cloudflare Pages, Netlify oder Vercel; mit Auftraggeber kurz klären, was er schon hat.
- **Offline:** Fällt das Netz kurz weg, soll die Eingabe nicht verloren gehen (zwischenspeichern und danach senden).

### Datenschutz (für die Feier)

- Es werden Namen und Zeiten von Kollegen gespeichert und sind für alle mit dem Link sichtbar. Hinweis dazu in der App („Zeiten und Namen sind für alle mit diesem Link sichtbar") und eine kurze Datenschutzseite.
- Nach dem Fest muss der Admin alle Daten exportieren und löschen können.
- Möglichst wenig Daten sammeln, kein Tracking, keine Weitergabe.

## Version 2 – später (nicht jetzt bauen)

Konten mit E-Mail und Benutzername, Freunde mit Bestätigung, Zeiten standardmäßig privat und nur für bestätigte Freunde sichtbar, mehrere Geräte pro Konto (Handy, PC, PS5), weitere Spiele, Android-APK (Capacitor) und später Stores. Datenmodell dafür offen halten: `laps` bekommt später `user_id` und eine Sichtbarkeit, `friendships` (von, an, Status), `profiles` (Benutzername). Sichtbarkeit wieder per Row Level Security erzwingen.

## Reihenfolge

1. Prototyp lesen, Projekt aufsetzen (Vite, Git), Oberfläche und Logik 1:1 übernehmen, noch ohne Backend lauffähig.
2. Supabase einrichten (Tabelle, Sicherheitsregeln, Admin-Benutzer), Daten statt `localStorage` aus der Datenbank lesen und schreiben, Live-Aktualisierung.
3. Admin-Login, Löschen und Bearbeiten nur für Admin, CSV-Import und -Export.
4. TV-Modus auf Live-Daten, QR-Code zum öffentlichen Link, Hinweise zum Datenschutz.
5. **Test mit mehreren Handys und dem Laptop**, dann Hosting auf einer festen Adresse. Spätestens eine Woche vor dem 4. Dezember fertig.

## Offene Fragen an den Auftraggeber (vor dem Start klären)

- Welcher Hosting-Anbieter soll genutzt werden, und gibt es schon Konten (Supabase, GitHub, Cloudflare/Netlify/Vercel)?
- Soll der Link mit einem Event-Code geschützt werden, damit nur Anwesende eintragen?
- Soll der App-Name „F1 Zeitenliste" bleiben?
