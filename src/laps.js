// Umwandlung zwischen Datenbankzeilen (Tabelle laps) und den Einträgen der Oberfläche.
// Ohne Netz und ohne Oberfläche, daher getestet (tests/laps.test.js).
//
// Eintrag in der Oberfläche: { id, cid, name, st, tr, car, ts, ms, s? }
// Zeile in der Datenbank:    { id, client_id, name, station, strecke, auto, zeit_ms, s1_ms, s2_ms, s3_ms, created_at }

export const SPALTEN = "id,client_id,name,strecke,station,auto,zeit_ms,s1_ms,s2_ms,s3_ms,created_at";

export function rowToEntry(r) {
  const en = {
    id: Number(r.id), cid: r.client_id || "", name: r.name, st: r.station, tr: r.strecke || "Ohne Strecke",
    car: r.auto || "", ts: Date.parse(r.created_at) || 0, ms: r.zeit_ms,
  };
  const s = [r.s1_ms || 0, r.s2_ms || 0, r.s3_ms || 0];
  if (s[0] + s[1] + s[2]) en.s = s;
  return en;
}

// mitZeit: Zeitstempel mitsenden (nur Admin-Import; bei Gästen setzt ihn immer der Server).
export function entryToRow(en, mitZeit) {
  const s = en.s || [0, 0, 0];
  const row = {
    client_id: en.cid, name: en.name, strecke: en.tr, station: en.st, auto: en.car || "",
    zeit_ms: en.ms, s1_ms: s[0] || null, s2_ms: s[1] || null, s3_ms: s[2] || null,
  };
  if (mitZeit && en.ts) row.created_at = new Date(en.ts).toISOString();
  return row;
}

// Felder für eine Änderung durch den Admin (client_id und Zeitstempel bleiben unverändert).
export function aenderungToRow(en) {
  const r = entryToRow({ ...en, cid: null }, false);
  delete r.client_id;
  return r;
}

// Server-Einträge plus noch nicht bestätigte eigene Einträge (gleiche client_id = schon angekommen).
export function merge(server, warteschlange) {
  const da = new Set(server.map(e => e.cid).filter(Boolean));
  return server.concat(warteschlange.filter(e => !da.has(e.cid)));
}

// Ordnet einen Fehler von Supabase ein:
//   "netz"   – kein Netz / Server nicht erreichbar → später nochmal senden
//   "warten" – Limit erreicht → später nochmal senden
//   "code"   – Event-Code fehlt oder ist falsch → behalten, bis ein gültiger Code da ist
//   "fehler" – Eintrag ungültig → verwerfen und Meldung zeigen
export function fehlerArt(error, status) {
  if (!error) return null;
  const msg = String(error.message || "");
  if (!status || status >= 500 || status === 429 || !error.code || /fetch|network|netz/i.test(msg)) return "netz";
  if (error.code === "42501") return "code";
  if (/warten|zu viele/i.test(msg)) return "warten";
  return "fehler";
}

// Zufällige UUID (v4). crypto.randomUUID gibt es nur auf https; getRandomValues auch im WLAN-Test über http.
export function neueId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}

// Event-Code aus dem Link (?code=…). Nur Buchstaben und Ziffern.
export function codeAusLink(search) {
  const c = new URLSearchParams(search || "").get("code");
  return c && /^[A-Za-z0-9_-]{4,64}$/.test(c) ? c : "";
}
