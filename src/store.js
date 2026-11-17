// Datenspeicher (Schritt 2): gemeinsame Datenbank bei Supabase.
// Die Oberfläche nutzt nur die exportierten Funktionen.
//
// - Lesen und Eintragen brauchen den Event-Code aus dem Link (?code=…); er wird auf dem Gerät gemerkt.
// - Neue Zeiten erscheinen sofort lokal und landen in einer Warteschlange (localStorage).
//   Fällt das Netz weg, wird später automatisch nachgesendet. Doppelte Sendungen erkennt die
//   Datenbank an der client_id.
// - Live: die Datenbank schickt bei jeder Änderung ein Signal über Realtime, dann wird neu geladen.
//   Zusätzlich alle 30 s und wenn die App wieder sichtbar oder online wird.

import { createClient } from "@supabase/supabase-js";
import { SPALTEN, rowToEntry, entryToRow, merge, fehlerArt, neueId, codeAusLink } from "./laps.js";

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;
const K_CODE = "f1xmas_code", K_CACHE = "f1xmas_cache", K_QUEUE = "f1xmas_queue", K_LINK = "f1xmas_link";

let sb = null, code = "", server = [], queue = [], liste = [];
let zustand = { konfiguriert: false, online: navigator.onLine, geladen: false, codeFalsch: false, fehler: "" };
const hoerer = [], statusHoerer = [];
let sendet = false, ladeTimer = null, sendeTimer = null;

// ---------- lokal merken ----------
function lies(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function schreib(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* voll oder gesperrt */ } }

function aktualisieren() {
  const alt = signatur(liste);
  liste = merge(server, queue);
  if (signatur(liste) !== alt) hoerer.forEach(f => f());
  statusMelden();
}
function signatur(l) { return l.length + ":" + l.map(e => e.id + "/" + e.ms + "/" + e.name + "/" + e.tr + "/" + e.st).join(","); }
function statusMelden() { statusHoerer.forEach(f => f(status())); }

// ---------- öffentliche Funktionen ----------
export function load() {
  const ausLink = codeAusLink(location.search);
  if (ausLink) schreib(K_CODE, ausLink);
  code = ausLink || lies(K_CODE, "");
  server = lies(K_CACHE, []);
  queue = lies(K_QUEUE, []);
  liste = merge(server, queue);
  if (!URL_ || !KEY_) { zustand.fehler = "Supabase ist nicht eingerichtet (.env fehlt)."; return; }
  zustand.konfiguriert = true;
  verbinden();
}

export function entries() { return liste; }
export function hatCode() { return !!code; }
export function isAdmin() { return false; } // Schritt 3: Admin-Login

export function onChange(f) { hoerer.push(f); }
export function onStatus(f) { statusHoerer.push(f); }

export function fehlerWeg() { zustand.fehler = ""; statusMelden(); }

export function status() {
  return { ...zustand, hatCode: !!code, wartend: queue.length };
}

// Neuer Eintrag: sofort sichtbar, dann senden.
export function add(en) {
  en.cid = neueId();
  en.id = 1e13 + Date.now() + queue.length; // vorläufig, größer als alle Server-IDs (neueste zuletzt)
  queue.push(en); schreib(K_QUEUE, queue);
  aktualisieren();
  senden();
  return en;
}

// Admin-Import (Schritt 3). Zeitstempel aus der CSV bleiben erhalten.
export async function addMany(list) {
  const rows = list.map(en => entryToRow({ ...en, cid: neueId() }, true));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("laps").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  await laden();
}

// Löschen (Schritt 3, nur Admin – die Datenbank lehnt es für Gäste ab).
export async function remove(id) {
  const { data, error } = await sb.from("laps").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw new Error("Nur der Admin darf löschen.");
  await laden();
}


export function getLink() { return lies(K_LINK, ""); }
export function setLink(v) { schreib(K_LINK, v); }

// ---------- Verbindung ----------
function verbinden() {
  sb = createClient(URL_, KEY_, {
    global: { headers: code ? { "x-event-code": code } : {} },
    auth: { persistSession: true, autoRefreshToken: true },
  });

  sb.channel("laps", { config: { private: false } })
    .on("broadcast", { event: "geaendert" }, () => spaeterLaden(300))
    .subscribe(s => { if (s === "SUBSCRIBED") spaeterLaden(0); });

  window.addEventListener("online", () => { zustand.online = true; statusMelden(); laden(); senden(); });
  window.addEventListener("offline", () => { zustand.online = false; statusMelden(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { laden(); senden(); } });
  setInterval(() => { laden(); senden(); }, 30000);

  laden();
  senden();
}

function spaeterLaden(ms) {
  clearTimeout(ladeTimer);
  ladeTimer = setTimeout(laden, ms);
}

let laedt = false, nochmal = false;
async function laden() {
  if (!sb) return;
  if (laedt) { nochmal = true; return; }
  laedt = true;
  try {
    const alle = [];
    for (let von = 0; ; von += 1000) {
      const { data, error, status: st } = await sb.from("laps").select(SPALTEN).order("id").range(von, von + 999);
      if (error) { zustand.online = fehlerArt(error, st) !== "netz"; if (zustand.online) zustand.fehler = error.message; statusMelden(); return; }
      alle.push(...data);
      if (data.length < 1000) break;
    }
    zustand.online = true; zustand.geladen = true;
    server = alle.map(rowToEntry);
    // Bestätigte Einträge aus der Warteschlange entfernen
    const da = new Set(server.map(e => e.cid));
    const vorher = queue.length;
    queue = queue.filter(e => !da.has(e.cid));
    if (queue.length !== vorher) schreib(K_QUEUE, queue);
    schreib(K_CACHE, server);
    aktualisieren();
  } catch (e) {
    zustand.online = false; statusMelden();
  } finally {
    laedt = false;
    if (nochmal) { nochmal = false; laden(); }
  }
}

async function senden() {
  if (!sb || sendet || !queue.length) return;
  if (!code) { statusMelden(); return; }
  sendet = true;
  let erneut = false;
  try {
    while (queue.length) {
      const en = queue[0];
      const { error, status: st } = await sb.from("laps").insert(entryToRow(en, false));
      const art = fehlerArt(error, st);
      if (!art || error.code === "23505") { // gespeichert (oder schon vorhanden)
        zustand.codeFalsch = false; zustand.online = true;
        // bleibt in der Liste stehen, bis das Neuladen die Server-Zeile bringt
        server = server.concat([{ ...en }]).filter((x, i, a) => a.findIndex(y => y.cid === x.cid) === i);
        queue.shift(); schreib(K_QUEUE, queue);
        continue;
      }
      if (art === "netz") { zustand.online = false; erneut = true; break; }
      if (art === "warten") { erneut = true; break; }
      if (art === "code") { zustand.codeFalsch = true; break; }
      // ungültig: verwerfen, damit die Warteschlange nicht hängen bleibt
      zustand.fehler = "Zeit von " + en.name + " wurde nicht gespeichert: " + error.message;
      queue.shift(); schreib(K_QUEUE, queue);
    }
  } finally {
    sendet = false;
    aktualisieren();
    if (erneut) { clearTimeout(sendeTimer); sendeTimer = setTimeout(senden, 10000); }
    else spaeterLaden(0);
  }
}
