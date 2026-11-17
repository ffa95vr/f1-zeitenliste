// Datenspeicher. Schritt 1: nur localStorage (wie im Prototyp, gleicher Schlüssel).
// In Schritt 2 wird dieser Teil gegen Supabase getauscht; die Oberfläche nutzt nur diese Funktionen.

const KEY = "f1xmas_v1";
let data = { entries: [] };
let nextId = 1;

function normalize(d) {
  if (!d || !d.entries) d = { ...(d || {}), entries: [] };
  d.entries.forEach(e => {
    e.tr = e.tr || "Ohne Strecke"; e.car = e.car || ""; e.ts = e.ts || 0;
    if (e.id >= nextId) nextId = e.id + 1;
  });
  return d;
}

function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* voll oder gesperrt */ } }

export function load() {
  try { const s = localStorage.getItem(KEY); if (s) data = JSON.parse(s); } catch (e) { /* ungültig */ }
  data = normalize(data);
}

// Neu einlesen (z. B. Eintrag aus einem anderen Tab). Wird im TV-Modus genutzt.
export function reload() {
  try {
    const q = localStorage.getItem(KEY);
    if (q) { const d = JSON.parse(q); if (d && d.entries) data = normalize(d); }
  } catch (e) { /* ungültig */ }
}

export function entries() { return data.entries; }

export function add(en) { en.id = nextId++; data.entries.push(en); save(); return en; }

export function addMany(list) { list.forEach(en => { en.id = nextId++; data.entries.push(en); }); save(); }

export function remove(id) { data.entries = data.entries.filter(e => e.id !== id); save(); }

export function getLink() { return data.link || ""; }

export function setLink(v) { data.link = v; save(); }
