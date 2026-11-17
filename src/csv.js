// CSV-Backup im Format des Prototyps (Semikolon getrennt).
import { STATIONEN, fmt } from "./zeit.js";

const KOPF = "Zeitstempel;Name;Strecke;Station;Auto;Zeit;Millisekunden;S1_ms;S2_ms;S3_ms";

export function csvText(entries) {
  const rows = [KOPF];
  entries.slice().sort((a, b) => (a.ts - b.ts) || (a.id - b.id)).forEach(e => {
    rows.push([e.ts ? new Date(e.ts).toISOString() : "", e.name, e.tr, e.st, e.car, fmt(e.ms), e.ms,
      e.s ? e.s[0] : "", e.s ? e.s[1] : "", e.s ? e.s[2] : ""]
      .map(x => String(x).replace(/[;\r\n]/g, " ")).join(";"));
  });
  return rows.join("\n");
}

// Liest eine CSV. Gibt neue Einträge (ohne id) und die Zahl übersprungener Zeilen zurück.
// Zeilen, die es schon gibt (gleicher Name, Strecke, Station, Zeit und Zeitstempel), werden übersprungen.
export function parseCsv(txt, vorhanden) {
  const neu = [];
  let sk = 0;
  const gleich = (e, x) => e.name === x.name && e.tr === x.tr && e.st === x.st && e.ms === x.ms && e.ts === x.ts;
  txt.split(/\r?\n/).forEach(l => {
    l = l.trim();
    if (!l || l.indexOf("Zeitstempel") === 0) return;
    const f = l.split(";"), ms = parseInt(f[6], 10), ts = Date.parse(f[0]) || 0;
    if (f.length < 7 || !f[1] || !f[2] || STATIONEN.indexOf(f[3]) < 0 || isNaN(ms) || ms <= 0 || ms >= 600000) { sk++; return; }
    const en = { name: f[1], st: f[3], tr: f[2], car: f[4], ts, ms };
    if (vorhanden.some(e => gleich(e, en)) || neu.some(e => gleich(e, en))) { sk++; return; }
    const sv = [7, 8, 9].map(i => { const x = parseInt(f[i], 10); return x > 0 && x < ms ? x : 0; });
    if (sv[0] + sv[1] + sv[2]) en.s = sv;
    neu.push(en);
  });
  return { neu, sk };
}
