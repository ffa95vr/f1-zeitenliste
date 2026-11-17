// Reine Hilfsfunktionen für Zeiten und Ranglisten (aus dem Prototyp übernommen).
// Zeiten sind intern immer ganze Millisekunden.

export const STATIONEN = ["R21", "R5", "G29"];

export const STRECKEN = ["Melbourne", "Shanghai", "Suzuka", "Bahrain", "Jeddah", "Miami", "Imola", "Monaco",
  "Barcelona", "Montreal", "Spielberg", "Silverstone", "Spa", "Hungaroring", "Zandvoort", "Monza", "Baku",
  "Singapur", "Austin", "Mexiko-Stadt", "Interlagos", "Las Vegas", "Lusail", "Abu Dhabi"];

export const AUTOS = ["Red Bull", "Ferrari", "Mercedes", "McLaren", "Aston Martin", "Alpine", "Williams",
  "Racing Bulls", "Haas", "Kick Sauber"];

// 77156 -> "1.17,156"
export function fmt(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), t = ms % 1000;
  return m + "." + (s < 10 ? "0" : "") + s + "," + ("00" + t).slice(-3);
}

// Sektorzeiten: unter einer Minute ohne Minuten, z. B. "28,456"
export function fmtS(ms) {
  return ms < 60000 ? Math.floor(ms / 1000) + "," + ("00" + ms % 1000).slice(-3) : fmt(ms);
}

export function p2(n) { return (n < 10 ? "0" : "") + n; }

// Zeitstempel -> "16.11.26 18:05"
export function fd(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return p2(d.getDate()) + "." + p2(d.getMonth() + 1) + "." + String(d.getFullYear()).slice(2) + " " +
    p2(d.getHours()) + ":" + p2(d.getMinutes());
}

// Abstand in Sekunden mit Komma: 1234 -> "1,234"
export function gap(d) { return (d / 1000).toFixed(3).replace(".", ","); }

// Liest "1.17,156", "17,156" und "1:17.156". Gibt Millisekunden oder null zurück.
export function parse(v) {
  v = String(v).trim().replace(":", ".");
  if (!v) return null;
  let m = 0, s = 0, fr = "0", p;
  const c = v.indexOf(",");
  if (c > -1) { fr = v.slice(c + 1); p = v.slice(0, c).split("."); }
  else { p = v.split("."); if (p.length === 3) fr = p.pop(); }
  if (p.length > 2) return null;
  if (p.length === 2) { m = parseInt(p[0], 10); s = parseInt(p[1], 10); }
  else { s = parseInt(p[0], 10); }
  if (!/^\d*$/.test(fr) || isNaN(m) || isNaN(s) || s < 0 || m < 0 || (p.length === 2 && s >= 60)) return null;
  const ms = Math.round((m * 60 + s) * 1000 + parseFloat("0." + (fr || "0")) * 1000);
  return ms > 0 && ms < 600000 ? ms : null;
}

// Beste Zeit pro Fahrer (Groß/Klein egal), sortiert, gleiche Zeit = gleicher Rang.
// Setzt .rank an den zurückgegebenen Einträgen.
export function best(list) {
  const map = {};
  list.forEach(e => { const k = e.name.toLowerCase(); if (!map[k] || e.ms < map[k].ms) map[k] = e; });
  const a = Object.values(map).sort((x, y) => x.ms - y.ms);
  let r = 0;
  a.forEach((x, i) => { r = (i > 0 && x.ms === a[i - 1].ms) ? r : i + 1; x.rank = r; });
  return a;
}

// Bisherige Bestzeit des Fahrers und Rekord an der Station, jeweils auf dieser Strecke.
export function prevStats(entries, nm, tn, st) {
  const mine = entries.filter(e => e.name === nm && e.tr === tn);
  const sl = entries.filter(e => e.st === st && e.tr === tn);
  const mn = a => a.length ? Math.min(...a.map(e => e.ms)) : null;
  return { pb: mn(mine), rec: mn(sl) };
}

// Vorhandene Schreibweise übernehmen (Groß/Klein egal).
export function vorhandeneSchreibweise(wert, liste) {
  const k = wert.toLowerCase();
  let r = wert;
  liste.forEach(x => { if (x.toLowerCase() === k) r = x; });
  return r;
}

// Prüft die Eingaben aus dem Formular.
// Rückgabe: { fehler: "…" } oder { ms, s } (s = [s1,s2,s3] oder null).
export function pruefeEintrag({ name, strecke, zeit, sektoren }) {
  const zeitText = String(zeit || "").trim();
  let ms = zeitText ? parse(zeitText) : 0;
  const sec = [];
  let bad = false;
  (sektoren || ["", "", ""]).forEach(v => {
    v = String(v || "").trim();
    if (!v) { sec.push(0); return; }
    const x = parse(v);
    if (x === null) bad = true;
    sec.push(x || 0);
  });
  const sum = sec[0] + sec[1] + sec[2], all3 = sec[0] && sec[1] && sec[2];
  if (!String(name || "").trim()) return { fehler: "Bitte einen Namen eingeben." };
  if (!String(strecke || "").trim()) return { fehler: "Bitte eine Strecke eingeben." };
  if (bad) return { fehler: "Sektorzeit nicht lesbar. Beispiel: 28,456" };
  // Abweichung zum Prototyp: eine unlesbare Rundenzeit wird nicht still durch die Sektorsumme ersetzt.
  if (zeitText && ms === null) return { fehler: "Zeit nicht lesbar. Beispiel: 1.17,156" };
  if (!ms && all3) ms = sum;
  if (!ms) return { fehler: "Bitte eine Rundenzeit eingeben (oder alle drei Sektoren)." };
  if (all3 && sum !== ms) return { fehler: "Die drei Sektoren ergeben " + fmt(sum) + ", die Rundenzeit ist " + fmt(ms) + ". Bitte prüfen." };
  if (sum > ms) return { fehler: "Die Sektoren sind zusammen länger als die Runde (" + fmt(sum) + "). Bitte prüfen." };
  return { ms, s: sum ? sec : null };
}
