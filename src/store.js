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
import { SPALTEN, rowToEntry, entryToRow, aenderungToRow, merge, fehlerArt, neueId, codeAusLink, normCode } from "./laps.js";

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;
const K_CODE = "f1xmas_code", K_CACHE = "f1xmas_cache", K_QUEUE = "f1xmas_queue", K_LINK = "f1xmas_link";

let sb = null, code = "", server = [], queue = [], liste = [];
let zustand = { konfiguriert: false, online: navigator.onLine, geladen: false, codeFalsch: false, fehler: "" };
const hoerer = [], statusHoerer = [], adminHoerer = [];
let admin = false, adminEmail = "";
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
function signatur(l) { return l.length + ":" + l.map(e => [e.id, e.ms, e.name, e.tr, e.st, e.car, e.ts, e.s ? e.s.join("+") : ""].join("/")).join(","); }
function statusMelden() { statusHoerer.forEach(f => f(status())); }

// ---------- öffentliche Funktionen ----------
export function load() {
  const ausLink = codeAusLink(location.search);
  if (ausLink) schreib(K_CODE, ausLink);
  code = ausLink || normCode(lies(K_CODE, ""));
  server = lies(K_CACHE, []);
  queue = lies(K_QUEUE, []);
  liste = merge(server, queue);
  if (!URL_ || !KEY_) { zustand.fehler = "Supabase ist nicht eingerichtet (.env fehlt)."; return; }
  zustand.konfiguriert = true;
  verbinden();
}

export function entries() { return liste; }
export function hatCode() { return !!code; }
export function getCode() { return code; }
export function isAdmin() { return admin; }
export function darfEintragen() { return !!code || admin; }
export function adminMail() { return adminEmail; }
export function onAdmin(f) { adminHoerer.push(f); }

// ---------- Admin ----------
export async function login(email, passwort) {
  if (!sb) throw new Error("Keine Verbindung zur Datenbank.");
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: passwort });
  if (error) throw new Error(/invalid/i.test(error.message) ? "E-Mail oder Passwort falsch." : error.message);
  await adminPruefen();
  if (!admin) { await sb.auth.signOut(); throw new Error("Dieses Konto ist kein Admin."); }
}

export async function logout() {
  if (sb) await sb.auth.signOut();
  await adminPruefen();
}

// Fragt die Datenbank, ob der angemeldete Benutzer Admin ist (dieselbe Regel wie in der Row Level Security).
async function adminPruefen() {
  const { data: { session } } = await sb.auth.getSession();
  let neu = false;
  if (session) {
    const { data, error } = await sb.rpc("ist_admin");
    neu = !error && data === true;
  }
  adminEmail = neu ? session.user.email : "";
  if (neu !== admin) {
    admin = neu;
    adminHoerer.forEach(f => f());
    laden(); senden();
  }
  statusMelden();
}

export function onChange(f) { hoerer.push(f); }
export function onStatus(f) { statusHoerer.push(f); }

export function fehlerWeg() { zustand.fehler = ""; statusMelden(); }

export function status() {
  return { ...zustand, hatCode: !!code || admin, admin, wartend: queue.length };
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

// Admin-Import. Zeitstempel aus der CSV bleiben erhalten.
export async function addMany(list) {
  const rows = list.map(en => entryToRow({ ...en, cid: neueId() }, true));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("laps").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  await laden();
}

// Löschen (nur Admin – die Datenbank lehnt es für alle anderen ab).
export async function remove(id) {
  const { data, error } = await sb.from("laps").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw new Error("Nicht gelöscht. Nur der Admin darf löschen.");
  await laden();
}

// Ändern (nur Admin). en: { name, tr, st, car, ms, s }
export async function update(id, en) {
  const { data, error } = await sb.from("laps").update(aenderungToRow(en)).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw new Error("Nicht geändert. Nur der Admin darf ändern.");
  await laden();
}

// Alle Zeiten löschen (nur Admin, z. B. nach dem Fest). Gibt die Anzahl zurück.
export async function removeAll() {
  const { data, error } = await sb.from("laps").delete().gt("id", 0).select("id");
  if (error) throw new Error(error.message);
  await laden();
  return data ? data.length : 0;
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

  sb.auth.onAuthStateChange(ev => {
    // Ausserhalb des Auth-Callbacks prüfen (sonst blockiert supabase-js)
    if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "INITIAL_SESSION") setTimeout(adminPruefen, 0);
  });

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
      if (error) {
        zustand.ladeFehler = "HTTP " + (st || 0) + ": " + (error.message || error.code || "unbekannt");
        zustand.online = fehlerArt(error, st) !== "netz"; if (zustand.online) zustand.fehler = error.message; statusMelden(); return;
      }
      alle.push(...data);
      if (data.length < 1000) break;
    }
    zustand.online = true; zustand.geladen = true; zustand.stand = Date.now(); zustand.ladeFehler = "";
    codePruefen();
    server = alle.map(rowToEntry);
    // Bestätigte Einträge aus der Warteschlange entfernen
    const da = new Set(server.map(e => e.cid));
    const vorher = queue.length;
    queue = queue.filter(e => !da.has(e.cid));
    if (queue.length !== vorher) schreib(K_QUEUE, queue);
    schreib(K_CACHE, server);
    aktualisieren();
  } catch (e) {
    zustand.ladeFehler = (e && (e.name + ": " + e.message)) || String(e);
    zustand.online = false; statusMelden();
  } finally {
    laedt = false;
    if (nochmal) { nochmal = false; laden(); }
  }
}

// Falscher Code liefert beim Lesen keine Fehlermeldung, sondern eine leere Liste.
// Deshalb einmal pro Code bei der Datenbank nachfragen (dieselbe Funktion wie in der Row Level Security).
let geprueft = "";
async function codePruefen() {
  if (!code || admin || geprueft === code) return;
  const { data, error } = await sb.rpc("event_code_ok");
  if (error) return; // später nochmal versuchen
  geprueft = code;
  const falsch = data !== true;
  if (falsch !== zustand.codeFalsch) { zustand.codeFalsch = falsch; statusMelden(); }
}

async function senden() {
  if (!sb || sendet || !queue.length) return;
  if (!code && !admin) { statusMelden(); return; }
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
