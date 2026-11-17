// Oberfläche der F1 Zeitenliste (aus dem Prototyp übernommen).
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./style.css";
import qrcode from "qrcode-generator";
import { STATIONEN as STS, STRECKEN as TR, AUTOS as CARS, fmt, fmtS, fd, gap, best, prevStats,
  vorhandeneSchreibweise, pruefeEintrag } from "./zeit.js";
import { csvText, parseCsv } from "./csv.js";
import * as store from "./store.js";

const LIM = 40; // erwartete Zahl der Gäste (Anzeige „Schon gefahren: x von 40“)

// Zustand der Oberfläche
let tab = "eintragen", sel = "R21", pend = null, ftrack = "*", wmode = "rig", wst = "R21";
const zsel = { R21: 1, R5: 1, G29: 0 };
let ctrack = "", ccar = "", fp = "", editId = null;

const E = () => store.entries();

function sbl(e, wt) { return [wt ? e.tr : "", e.car, e.st, fd(e.ts), secStr(e)].filter(x => x).join(" · "); }
function secStr(e) { return e.s ? e.s.map((x, i) => x ? "S" + (i + 1) + " " + fmtS(x) : "").filter(Boolean).join(" · ") : ""; }

function el(t, c, x) { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

function makeBanner(pv, ms, rank, st, tn) {
  const bn = el("div", "banner");
  let h, d;
  if (pv.pb === null) { h = "Erste Zeit auf " + tn; d = fmt(ms) + " · Platz " + rank + " an " + st; }
  else if (ms < pv.pb) { h = "🏆 Neue Bestzeit!"; d = "−" + gap(pv.pb - ms) + " zur alten Zeit (" + fmt(pv.pb) + ") · jetzt " + fmt(ms) + " · Platz " + rank + " an " + st; }
  else if (ms === pv.pb) { bn.className = "banner no"; h = "Gleich schnell wie die Bestzeit"; d = fmt(ms) + " · Platz " + rank + " an " + st; }
  else { bn.className = "banner no"; h = "Keine neue Bestzeit"; d = "+" + gap(ms - pv.pb) + " zur Bestzeit (" + fmt(pv.pb) + ") · Platz " + rank + " an " + st; }
  bn.appendChild(el("div", "bh", h)); bn.appendChild(el("div", "bd", d));
  if (pv.rec !== null && ms < pv.rec) bn.appendChild(el("div", "bd", "🥇 Neuer Rekord an " + st + " auf " + tn + " (−" + gap(pv.rec - ms) + ")"));
  return bn;
}

function names() {
  const s = {}, a = [];
  E().forEach(e => { const k = e.name.toLowerCase(); if (!s[k]) { s[k] = 1; a.push(e.name); } });
  return a.sort((x, y) => x.localeCompare(y, "de"));
}

function allTracks() {
  const s = [];
  E().forEach(e => { if (s.indexOf(e.tr) < 0) s.push(e.tr); });
  return s.sort((a, b) => a.localeCompare(b, "de"));
}

function rowEl(e, wt, rank) {
  const r = el("div", "row" + (rank && rank <= 3 ? " r" + rank : ""));
  if (rank) r.appendChild(el("div", "rk", rank));
  const n = el("div", "nm"); n.appendChild(el("div", null, e.name)); n.appendChild(el("div", "sb", sbl(e, wt))); r.appendChild(n);
  return r;
}

function board(list, V) {
  const b = best(list);
  if (!b.length) { V.appendChild(el("div", "empty", "Noch keine Zeiten.")); return; }
  b.forEach(x => {
    const r = rowEl(x, false, x.rank), t = el("div", "tm", fmt(x.ms));
    if (x.rank > 1) t.appendChild(el("span", "ds", "+" + gap(x.ms - b[0].ms)));
    r.appendChild(t); V.appendChild(r);
  });
}

function delBtn(e) {
  if (!store.isAdmin()) return document.createTextNode(""); // Gäste dürfen nicht löschen
  const x = el("button", "x", pend === e.id ? "Löschen?" : "✕");
  x.onclick = async () => {
    if (pend !== e.id) { pend = e.id; render(); return; }
    pend = null;
    try { await store.remove(e.id); } catch (err) { alert(err.message); }
    render();
  };
  return x;
}

function editBtn(e) {
  if (!store.isAdmin()) return document.createTextNode("");
  const x = el("button", "x", "✎"); x.setAttribute("aria-label", "Bearbeiten");
  x.onclick = () => { editId = e.id; pend = null; render(); };
  return x;
}

// Bearbeiten-Karte (nur Admin). Gleiche Prüfung wie beim Eintragen.
function editCard(e) {
  const c = el("div", "card edit");
  c.appendChild(el("h2", null, "Zeit bearbeiten"));
  const n = field(c, "Name", ""); n.value = e.name;
  const tr = field(c, "Strecke", "", "tl"); tr.value = e.tr; c.appendChild(opts("tl", allTracks().concat(TR)));
  const car = field(c, "Auto / Team (optional)", "", "cl"); car.value = e.car || ""; c.appendChild(opts("cl", E().map(x => x.car).concat(CARS)));
  c.appendChild(el("label", null, "Station"));
  let st = e.st;
  const sg = el("div", "seg");
  STS.forEach(x => {
    const b = el("button", st === x ? "on" : "", x);
    b.onclick = () => { st = x; Array.prototype.forEach.call(sg.children, y => { y.className = y.textContent === x ? "on" : ""; }); };
    sg.appendChild(b);
  });
  c.appendChild(sg);
  const t = field(c, "Rundenzeit", "1.17,156"); t.inputMode = "numeric"; t.value = fmt(e.ms);
  c.appendChild(el("label", null, "Sektorzeiten (optional)"));
  const sr = el("div", "secs"), sI = [];
  [0, 1, 2].forEach(i => {
    const x = el("input"); x.type = "text"; x.autocomplete = "off"; x.inputMode = "numeric"; x.placeholder = "Sektor " + (i + 1);
    x.value = e.s && e.s[i] ? fmtS(e.s[i]) : ""; sr.appendChild(x); sI.push(x);
  });
  c.appendChild(sr);
  const m = el("div", "msg");
  const ok = el("button", "btn", "Speichern");
  ok.onclick = async () => {
    const r = pruefeEintrag({ name: n.value, strecke: tr.value, zeit: t.value, sektoren: sI.map(i => i.value) });
    if (r.fehler) { m.textContent = r.fehler; return; }
    ok.disabled = true; m.textContent = "Wird gespeichert …";
    try {
      await store.update(e.id, { name: n.value.trim(), tr: tr.value.trim(), st, car: car.value.trim(), ms: r.ms, s: r.s });
      editId = null; render();
    } catch (err) { ok.disabled = false; m.textContent = err.message; }
  };
  const ab = el("button", "btn sec", "Abbrechen"); ab.onclick = () => { editId = null; render(); };
  c.appendChild(ok); c.appendChild(ab); c.appendChild(m);
  return c;
}

function selBox(V, label, opts, val, fn) {
  V.appendChild(el("label", null, label));
  const s = document.createElement("select");
  opts.forEach(o => { const p = el("option", null, o[1]); p.value = o[0]; s.appendChild(p); });
  s.value = val; s.onchange = () => { fn(s.value); render(); }; V.appendChild(s);
}

function trBar(V) {
  const T = allTracks();
  if (ftrack !== "*" && T.indexOf(ftrack) < 0) ftrack = "*";
  selBox(V, "Strecke", [["*", "Alle Strecken"]].concat(T.map(t => [t, t])), ftrack, v => { ftrack = v; });
}

function tabs() {
  const T = document.getElementById("tabs"); T.textContent = "";
  [["eintragen", "Eintragen"], ["zeiten", "Zeiten"], ["fahrer", "Fahrer"], ["R21", "R21"], ["R5", "R5"], ["G29", "G29"],
    ["wertung", "Wertung"], ["gefahren", "Gefahren"], ["tv", "TV"], ["mehr", "Mehr"]].forEach(t => {
    const b = el("button", tab === t[0] ? "on" : "", t[1]);
    b.onclick = () => { tab = t[0]; pend = null; editId = null; render(); };
    T.appendChild(b);
  });
}

function perTrack(V, fn) {
  const T = ftrack === "*" ? allTracks() : [ftrack];
  T.forEach(t => fn(t, E().filter(e => e.tr === t)));
}

function podiumBoard(list, V) {
  const b = best(list);
  if (!b.length) { V.appendChild(el("div", "empty", "Noch keine Zeiten.")); return; }
  const H = [150, 110, 80], C = ["var(--gold)", "var(--silv)", "var(--bron)"], pod = el("div", "pod");
  [1, 0, 2].forEach(i => {
    const x = b[i]; if (!x) return;
    const c = el("div", "col"); c.appendChild(el("div", "pn", x.name)); c.appendChild(el("div", "pt", fmt(x.ms)));
    const k = el("div", "blk", x.rank); k.style.height = H[i] + "px"; k.style.background = C[Math.min(x.rank, 3) - 1];
    c.appendChild(k); pod.appendChild(c);
  });
  V.appendChild(pod);
  b.slice(3).forEach(x => {
    const r = rowEl(x, false, x.rank), t = el("div", "tm", fmt(x.ms));
    t.appendChild(el("span", "ds", "+" + gap(x.ms - b[0].ms))); r.appendChild(t); V.appendChild(r);
  });
}

function chart(L) {
  const NS = "http://www.w3.org/2000/svg", n = L.length, mn = Math.min(...L.map(e => e.ms)), mx = Math.max(...L.map(e => e.ms)), sp = (mx - mn) || 1;
  const w = 340, h = 120, s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 " + w + " " + h); s.setAttribute("role", "img"); s.setAttribute("aria-label", "Verlauf der Rundenzeiten");
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const pts = L.map((e, i) => [16 + i * (w - 32) / (n - 1), 20 + (e.ms - mn) / sp * (h - 44)]);
  s.appendChild(mk("polyline", { points: pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "), fill: "none", stroke: "#AAB4CC", "stroke-width": 2 }));
  pts.forEach((p, i) => {
    const b = L[i].ms === mn;
    s.appendChild(mk("circle", { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: b ? 6 : 4, fill: b ? "#F2C94C" : "#1B2747", stroke: b ? "#F2C94C" : "#AAB4CC", "stroke-width": 2 }));
  });
  const t1 = mk("text", { x: 4, y: 11, fill: "#AAB4CC", "font-size": 11 }); t1.textContent = "schneller: " + fmt(mn); s.appendChild(t1);
  const t2 = mk("text", { x: 4, y: h - 3, fill: "#AAB4CC", "font-size": 11 }); t2.textContent = "langsamer: " + fmt(mx); s.appendChild(t2);
  const d = el("div", "chart"); d.appendChild(s); return d;
}

function qrBox(txt) {
  const box = el("div", "qr");
  try {
    const q = qrcode(0, "M"); q.addData(txt); q.make();
    const n = q.getModuleCount(), m = 4, NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg");
    let d = "";
    s.setAttribute("viewBox", "0 0 " + (n + 2 * m) + " " + (n + 2 * m)); s.setAttribute("shape-rendering", "crispEdges");
    s.setAttribute("role", "img"); s.setAttribute("aria-label", "QR-Code zur App");
    const bg = document.createElementNS(NS, "rect"); bg.setAttribute("width", n + 2 * m); bg.setAttribute("height", n + 2 * m); bg.setAttribute("fill", "#fff"); s.appendChild(bg);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + (c + m) + " " + (r + m) + "h1v1h-1z";
    const pa = document.createElementNS(NS, "path"); pa.setAttribute("d", d); pa.setAttribute("fill", "#000"); s.appendChild(pa); box.appendChild(s);
  } catch (e) { box.textContent = "QR-Code konnte nicht erstellt werden (Link zu lang?)."; }
  return box;
}

async function importCsv(txt) {
  const { neu, sk } = parseCsv(txt, E());
  try { if (neu.length) await store.addMany(neu); } catch (err) { return "Import fehlgeschlagen: " + err.message; }
  return neu.length + " Zeiten importiert, " + sk + " übersprungen.";
}

function adminCard(V) {
  const c = el("div", "card"); c.appendChild(el("h2", null, "Admin"));
  if (store.isAdmin()) {
    c.appendChild(el("div", "sub", "Angemeldet als " + store.adminMail() + ". Löschen, Bearbeiten und Backup sind freigeschaltet."));
    const b = el("button", "btn", "Abmelden"); b.onclick = async () => { await store.logout(); render(); }; c.appendChild(b);
    V.appendChild(c); return;
  }
  c.appendChild(el("div", "sub", "Nur für den Organisator. Gäste brauchen keine Anmeldung."));
  c.appendChild(el("label", null, "E-Mail"));
  const em = el("input"); em.type = "email"; em.autocomplete = "username"; c.appendChild(em);
  c.appendChild(el("label", null, "Passwort"));
  const pw = el("input"); pw.type = "password"; pw.autocomplete = "current-password"; c.appendChild(pw);
  const m = el("div", "msg");
  const b = el("button", "btn", "Anmelden");
  const go = async () => {
    if (!em.value.trim() || !pw.value) { m.textContent = "Bitte E-Mail und Passwort eingeben."; return; }
    b.disabled = true; m.textContent = "Anmelden …";
    try { await store.login(em.value, pw.value); render(); }
    catch (err) { b.disabled = false; m.textContent = err.message; }
  };
  b.onclick = go; pw.onkeydown = ev => { if (ev.key === "Enter") go(); };
  c.appendChild(b); c.appendChild(m); V.appendChild(c);
}

function allesLoeschen(V) {
  const c = el("div", "card"); c.appendChild(el("h2", null, "Alle Zeiten löschen"));
  c.appendChild(el("div", "sub", "Nach dem Fest: zuerst oben ein CSV-Backup erstellen und sichern. Löschen kann nicht rückgängig gemacht werden."));
  c.appendChild(el("label", null, "Zum Bestätigen LÖSCHEN eintippen"));
  const i = el("input"); i.type = "text"; i.autocomplete = "off"; c.appendChild(i);
  const m = el("div", "msg");
  const b = el("button", "btn danger", "Alle " + E().length + " Zeiten löschen");
  b.onclick = async () => {
    if (i.value.trim().toUpperCase() !== "LÖSCHEN") { m.textContent = "Bitte LÖSCHEN eintippen."; return; }
    b.disabled = true; m.textContent = "Wird gelöscht …";
    try { const n = await store.removeAll(); i.value = ""; m.textContent = n + " Zeiten gelöscht."; b.textContent = "Alle " + E().length + " Zeiten löschen"; }
    catch (err) { m.textContent = err.message; }
    b.disabled = false;
  };
  c.appendChild(b); c.appendChild(m); V.appendChild(c);
}

function mehr(V) {
  adminCard(V);
  const c1 = el("div", "card"); c1.appendChild(el("h2", null, "QR-Code zur App"));
  c1.appendChild(el("div", "sub", "Link der freigegebenen Seite einfügen, dann scannen die Gäste den Code."));
  const li = el("input"); li.type = "text"; li.autocomplete = "off"; li.placeholder = "https://…"; li.value = store.getLink(); c1.appendChild(li);
  const qb = el("div"); c1.appendChild(qb);
  const draw = () => { qb.textContent = ""; if (li.value.trim()) qb.appendChild(qrBox(li.value.trim())); };
  const b1 = el("button", "btn", "QR-Code erstellen"); b1.onclick = () => { store.setLink(li.value.trim()); draw(); }; c1.appendChild(b1); draw(); V.appendChild(c1);

  if (!store.isAdmin()) return; // Backup, Einspielen und Löschen nur für den Admin
  const c2 = el("div", "card"); c2.appendChild(el("h2", null, "Backup als CSV"));
  c2.appendChild(el("div", "sub", "Erstellt eine Liste aller Zeiten. Kopieren und z. B. in Excel oder eine Notiz einfügen."));
  const ta = el("textarea"); ta.readOnly = true; ta.placeholder = "Hier erscheint die CSV."; c2.appendChild(ta);
  const m2 = el("div", "msg");
  const b2 = el("button", "btn", "CSV erstellen"); b2.onclick = () => { ta.value = csvText(E()); m2.textContent = E().length + " Zeiten."; }; c2.appendChild(b2);
  const b3 = el("button", "btn", "Kopieren"); b3.style.marginLeft = "8px";
  b3.onclick = () => {
    if (!ta.value) ta.value = csvText(E());
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(ta.value); ok = true; } } catch (e) { /* kein Zugriff */ }
    if (!ok) { try { ta.select(); ok = document.execCommand("copy"); } catch (e) { /* kein Zugriff */ } }
    m2.textContent = ok ? "Kopiert." : "Kopieren nicht möglich – Text markieren und selbst kopieren.";
  };
  c2.appendChild(b3); c2.appendChild(m2); V.appendChild(c2);

  const c3 = el("div", "card"); c3.appendChild(el("h2", null, "Backup einspielen"));
  c3.appendChild(el("div", "sub", "CSV hier einfügen. Schon vorhandene Zeiten werden nicht doppelt angelegt."));
  const t3 = el("textarea"); t3.placeholder = "CSV einfügen"; c3.appendChild(t3);
  const m3 = el("div", "msg");
  const b4 = el("button", "btn", "Importieren"); b4.onclick = async () => { m3.textContent = "Wird importiert …"; m3.textContent = await importCsv(t3.value); t3.value = ""; }; c3.appendChild(b4); c3.appendChild(m3); V.appendChild(c3);
  allesLoeschen(V);
}

// ---------- TV-Modus ----------
// Alle 4 s neu einlesen, nach 3 Durchgängen (12 s) nächste Strecke, bei neuer Zeit sofort zu deren Strecke.
let tvI = 0, tvC = 0, tvN = -1, tvTimer = null, tvPause = false, tvScope = "all", tvBox = null;

function stopTv() { if (tvTimer) { clearInterval(tvTimer); tvTimer = null; } tvN = -1; if (document.body) document.body.className = ""; }

function tvDraw() {
  if (!tvBox) return;
  tvBox.textContent = "";
  const T = allTracks();
  if (!T.length) { tvBox.appendChild(el("div", "tvh", "Noch keine Zeiten – trag die erste ein!")); return; }
  const tn = T[tvI % T.length], L = E().filter(e => e.tr === tn && (tvScope === "all" || e.st === tvScope)), all = best(L), b = all.slice(0, 10);
  const h = el("div", "tvh", tn); h.appendChild(el("span", null, (tvScope === "all" ? "Alle Rigs" : "Rig " + tvScope) + " · " + all.length + " Fahrer")); tvBox.appendChild(h);
  if (!b.length) tvBox.appendChild(el("div", "empty", "Noch keine Zeiten."));
  b.forEach(x => {
    const r = el("div", "tvr" + (x.rank <= 3 ? " r" + x.rank : "")), n = el("div", "nm");
    r.appendChild(el("div", "rk", x.rank)); n.appendChild(el("div", null, x.name));
    n.appendChild(el("span", "sb", [x.car, tvScope === "all" ? x.st : "", fd(x.ts)].filter(Boolean).join(" · "))); r.appendChild(n);
    r.appendChild(el("div", "tm", fmt(x.ms))); r.appendChild(el("div", "gp", x.rank > 1 ? "+" + gap(x.ms - b[0].ms) : "")); tvBox.appendChild(r);
  });
}

// Neue Zeit? Dann sofort zu deren Strecke springen. Gibt true zurück, wenn gesprungen wurde.
function tvNeu() {
  const n = E().length, neu = tvN >= 0 && n > tvN;
  if (neu) {
    const last = E().reduce((a, e) => e.id > a.id ? e : a, E()[0]), T = allTracks();
    tvI = Math.max(0, T.indexOf(last.tr)); tvC = 0;
  }
  tvN = n;
  return neu;
}

function tvTick() {
  if (tab !== "tv") return;
  if (!tvNeu() && !tvPause && ++tvC >= 3) { tvC = 0; tvI++; }
  tvDraw();
}

// Live-Änderung aus der Datenbank
function tvLive() { tvNeu(); tvDraw(); }

function tvView(V) {
  if (document.body) document.body.className = "tv";
  const bar = el("div", "tvbar");
  [["all", "Alle Rigs"]].concat(STS.map(x => [x, x])).forEach(o => {
    const b = el("button", tvScope === o[0] ? "on" : "", o[1]); b.onclick = () => { tvScope = o[0]; render(); }; bar.appendChild(b);
  });
  const pb = el("button", tvPause ? "on" : "", tvPause ? "Weiter" : "Pause"); pb.onclick = () => { tvPause = !tvPause; render(); }; bar.appendChild(pb);
  const nb = el("button", null, "Nächste Strecke"); nb.onclick = () => { tvI++; tvC = 0; tvDraw(); }; bar.appendChild(nb);
  const fb = el("button", null, "Vollbild");
  fb.onclick = () => { try { const r = document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* nicht unterstützt */ } };
  bar.appendChild(fb);
  const xb = el("button", null, "Beenden"); xb.onclick = () => { tab = "wertung"; render(); }; bar.appendChild(xb);
  V.appendChild(bar); tvBox = el("div"); V.appendChild(tvBox);
  tvN = E().length; tvDraw();
  tvTimer = setInterval(tvTick, 4000);
}

// ---------- Hauptansicht ----------
function render() {
  if (tab !== "tv") stopTv();
  else if (tvTimer) { clearInterval(tvTimer); tvTimer = null; } // TV neu aufbauen ohne doppelten Timer
  tabs();
  const V = document.getElementById("view"); V.textContent = "";
  if (tab === "tv") return tvView(V);
  if (tab === "eintragen") return form(V);
  if (tab === "mehr") return mehr(V);
  if (!E().length) { V.appendChild(el("div", "empty", "Noch keine Zeiten eingetragen.")); return; }
  if (tab === "zeiten") return zeiten(V);
  if (tab === "fahrer") return fahrer(V);
  trBar(V);
  if (STS.indexOf(tab) > -1) {
    V.appendChild(el("h2", null, "Station " + tab));
    perTrack(V, (t, L) => {
      const SL = L.filter(e => e.st === tab); if (!SL.length) return;
      V.appendChild(el("h3", null, t + " · " + best(SL).length + " Fahrer")); board(SL, V);
    });
    return;
  }
  if (tab === "wertung") return wertung(V);
  gefahren(V);
}

function wertung(V) {
  V.appendChild(el("label", null, "Ansicht"));
  const wb = el("div", "seg");
  [["rig", "Pro Rig"], ["zus", "Zusammen"]].forEach(o => { const b = el("button", wmode === o[0] ? "on" : "", o[1]); b.onclick = () => { wmode = o[0]; render(); }; wb.appendChild(b); });
  V.appendChild(wb);
  if (wmode === "rig") {
    V.appendChild(el("label", null, "Rig")); const sb = el("div", "seg");
    STS.forEach(x => { const b = el("button", wst === x ? "on" : "", x); b.onclick = () => { wst = x; render(); }; sb.appendChild(b); });
    V.appendChild(sb);
  } else {
    V.appendChild(el("label", null, "Diese Rigs zusammenzählen (antippen zum An- und Abwählen)")); const zb = el("div", "seg");
    STS.forEach(x => { const b = el("button", zsel[x] ? "on" : "", x); b.onclick = () => { zsel[x] = zsel[x] ? 0 : 1; render(); }; zb.appendChild(b); });
    V.appendChild(zb);
  }
  perTrack(V, (t, L) => {
    V.appendChild(el("h2", null, t));
    if (wmode === "rig") {
      const S = L.filter(e => e.st === wst);
      if (S.length) podiumBoard(S, V); else V.appendChild(el("div", "empty", "Noch keine Zeiten an " + wst + "."));
      return;
    }
    const chosen = STS.filter(x => zsel[x]);
    if (!chosen.length) { V.appendChild(el("div", "empty", "Bitte mindestens ein Rig auswählen.")); return; }
    const Z = L.filter(e => zsel[e.st]);
    V.appendChild(el("h3", null, "Zusammen: " + chosen.join(" + ")));
    if (Z.length) podiumBoard(Z, V); else V.appendChild(el("div", "empty", "Noch keine Zeiten an diesen Rigs."));
  });
}

function gefahren(V) {
  const P = {};
  E().filter(e => ftrack === "*" || e.tr === ftrack).forEach(e => {
    const k = e.name.toLowerCase(); if (!P[k]) P[k] = { name: e.name, n: 0, t: {} }; P[k].n++; P[k].t[e.tr] = 1;
  });
  const p = Object.values(P).sort((a, b) => a.name.localeCompare(b.name, "de"));
  V.appendChild(el("h2", null, "Schon gefahren: " + p.length + " von " + LIM)); V.appendChild(el("div", "sub", "Name, Strecken und Runden"));
  p.forEach(x => {
    const n = Object.keys(x.t).length, r = el("div", "row"); r.appendChild(el("div", "nm", x.name));
    r.appendChild(el("div", "ds", n + (n === 1 ? " Strecke" : " Strecken") + " · " + x.n + (x.n === 1 ? " Zeit" : " Zeiten"))); V.appendChild(r);
  });
}

function zeiten(V) {
  const fn = fp === "*" || !fp ? "*" : fp;
  selBox(V, "Fahrer", [["*", "Alle Fahrer"]].concat(names().map(n => [n, n])), names().indexOf(fn) < 0 ? "*" : fn, v => { fp = v; });
  trBar(V);
  const L = E().filter(e => (fn === "*" || e.name === fn) && (ftrack === "*" || e.tr === ftrack));
  L.sort((a, b) => (b.ts - a.ts) || (b.id - a.id));
  V.appendChild(el("h2", null, L.length + (L.length === 1 ? " Zeit" : " Zeiten")));
  L.forEach(e => {
    if (editId === e.id) { V.appendChild(editCard(e)); return; }
    const r = el("div", "row"), n = el("div", "nm"); n.appendChild(el("div", null, e.name)); n.appendChild(el("div", "sb", sbl(e, true)));
    r.appendChild(n); r.appendChild(el("div", "tm", fmt(e.ms))); r.appendChild(editBtn(e)); r.appendChild(delBtn(e)); V.appendChild(r);
  });
}

function fahrer(V) {
  const N = names();
  if (N.indexOf(fp) < 0) fp = E()[E().length - 1].name;
  selBox(V, "Fahrer", N.map(n => [n, n]), fp, v => { fp = v; });
  const M = E().filter(e => e.name === fp).sort((a, b) => (a.ts - b.ts) || (a.id - b.id));
  const T = []; M.forEach(e => { if (T.indexOf(e.tr) < 0) T.push(e.tr); });
  V.appendChild(el("h2", null, fp));
  V.appendChild(el("div", "sub", M.length + (M.length === 1 ? " Zeit" : " Zeiten") + " auf " + T.length + (T.length === 1 ? " Strecke" : " Strecken")));
  T.forEach(t => {
    const L = M.filter(e => e.tr === t), bm = Math.min(...L.map(e => e.ms));
    V.appendChild(el("h3", null, t + " · Bestzeit " + fmt(bm)));
    const bs = [0, 1, 2].map(i => { const v = L.map(e => e.s && e.s[i] ? e.s[i] : 0).filter(Boolean); return v.length ? Math.min(...v) : 0; });
    if (bs[0] && bs[1] && bs[2]) V.appendChild(el("div", "sub", "Ideale Runde (beste Sektoren): " + fmt(bs[0] + bs[1] + bs[2]) + " · S1 " + fmtS(bs[0]) + " · S2 " + fmtS(bs[1]) + " · S3 " + fmtS(bs[2])));
    if (L.length > 1) V.appendChild(chart(L));
    L.forEach((e, i) => {
      const r = el("div", "row" + (e.ms === bm ? " r1" : "")), n = el("div", "nm");
      n.appendChild(el("div", null, fd(e.ts) || "ohne Datum")); n.appendChild(el("div", "sb", [e.car, e.st, secStr(e)].filter(x => x).join(" · ")));
      r.appendChild(n);
      const tm = el("div", "tm", fmt(e.ms));
      if (i > 0) { const d = e.ms - L[i - 1].ms; tm.appendChild(el("span", "ds " + (d < 0 ? "up" : d > 0 ? "dn" : ""), (d < 0 ? "−" : "+") + gap(Math.abs(d)))); }
      r.appendChild(tm); V.appendChild(r);
    });
  });
}

// ---------- Eintragen ----------
function opts(id, arr) {
  const dl = el("datalist"); dl.id = id; const s = {};
  arr.forEach(t => { if (t && !s[t.toLowerCase()]) { s[t.toLowerCase()] = 1; const o = el("option"); o.value = t; dl.appendChild(o); } });
  return dl;
}

function field(c, label, ph, list) {
  c.appendChild(el("label", null, label));
  const i = el("input"); i.type = "text"; i.autocomplete = "off"; i.placeholder = ph; if (list) i.setAttribute("list", list); c.appendChild(i);
  return i;
}

function form(V) {
  const c = el("div", "card");
  const n = field(c, "Name", "Name eingeben", "nl"); c.appendChild(opts("nl", names()));
  const tr = field(c, "Strecke", "z. B. Monza", "tl"); tr.value = ctrack; c.appendChild(opts("tl", allTracks().concat(TR)));
  const car = field(c, "Auto / Team (optional)", "z. B. Ferrari", "cl"); car.value = ccar; c.appendChild(opts("cl", E().map(e => e.car).concat(CARS)));
  c.appendChild(el("label", null, "Station"));
  const sg = el("div", "seg");
  STS.forEach(s => {
    const b = el("button", sel === s ? "on" : "", s);
    b.onclick = () => { sel = s; Array.prototype.forEach.call(sg.children, x => { x.className = x.textContent === s ? "on" : ""; }); };
    sg.appendChild(b);
  });
  c.appendChild(sg);
  // Keine Umformatierung beim Tippen (Cursor springt sonst). inputMode wie im Prototyp (numeric).
  const t = field(c, "Rundenzeit (z. B. 1.17,156)", "1.17,156"); t.inputMode = "numeric";
  c.appendChild(el("div", "sub", "Punkt nach der Minute, Komma vor den Tausendsteln: 1.17,156 = 1 Min 17,156 Sek."));
  c.appendChild(el("label", null, "Sektorzeiten (optional, mit Komma, z. B. 28,456)"));
  const sr = el("div", "secs"), sI = [];
  ["Sektor 1", "Sektor 2", "Sektor 3"].forEach(ph => {
    const i = el("input"); i.type = "text"; i.autocomplete = "off"; i.inputMode = "numeric"; i.placeholder = ph; sr.appendChild(i); sI.push(i);
  });
  c.appendChild(sr);
  c.appendChild(el("div", "sub", "Sind alle drei Sektoren ausgefüllt, kann die Rundenzeit leer bleiben: sie wird zusammengerechnet."));
  c.appendChild(el("div", "sub", "Datum und Uhrzeit werden automatisch gespeichert."));
  const m = el("div", "msg");
  const g = el("button", "go", "Zeit speichern");
  g.onclick = () => {
    if (!store.darfEintragen()) { m.textContent = "Kein Event-Code. Bitte den QR-Code vor Ort scannen."; return; }
    const r = pruefeEintrag({ name: n.value, strecke: tr.value, zeit: t.value, sektoren: sI.map(i => i.value) });
    if (r.fehler) { m.textContent = r.fehler; return; }
    const tn = vorhandeneSchreibweise(tr.value.trim(), allTracks());
    const nm = vorhandeneSchreibweise(n.value.trim(), names());
    const cr = car.value.trim();
    const pv = prevStats(E(), nm, tn, sel);
    const en = { name: nm, st: sel, tr: tn, car: cr, ts: Date.now(), ms: r.ms };
    if (r.s) en.s = r.s;
    store.add(en); ctrack = tn; ccar = cr;
    const me = best(E().filter(e => e.st === sel && e.tr === tn)).filter(x => x.name === nm)[0];
    render();
    const mm = document.querySelector(".msg");
    if (mm) { mm.textContent = ""; mm.appendChild(makeBanner(pv, r.ms, me.rank, sel, tn)); }
  };
  c.appendChild(g); c.appendChild(m);
  c.appendChild(el("div", "sub", "Zeiten und Namen sind für alle mit diesem Link sichtbar."));
  V.appendChild(c);
  V.appendChild(el("h2", null, "Letzte Einträge"));
  lastBox = el("div"); V.appendChild(lastBox); drawLast();
}

// Nur die Liste „Letzte Einträge“ neu zeichnen (das Formular bleibt beim Live-Update unangetastet).
let lastBox = null;
function drawLast() {
  if (!lastBox) return;
  lastBox.textContent = "";
  const last = E().slice().sort((a, b) => (a.ts - b.ts) || (a.id - b.id)).slice(-8).reverse();
  if (!last.length) lastBox.appendChild(el("div", "empty", "Noch nichts eingetragen."));
  last.forEach(e => { const r = rowEl(e, true, 0); r.appendChild(el("div", "tm", fmt(e.ms))); r.appendChild(delBtn(e)); lastBox.appendChild(r); });
}

// ---------- Statuszeile (Verbindung, wartende Zeiten, Fehler) ----------
function drawStatus(s) {
  const S = document.getElementById("status"); if (!S) return;
  S.textContent = ""; S.className = "status";
  let t = "", warn = false;
  if (!s.konfiguriert) { t = s.fehler; warn = true; }
  else if (!s.hatCode) { t = "Kein Event-Code – bitte den QR-Code vor Ort scannen."; warn = true; }
  else if (s.codeFalsch) { t = "Event-Code ungültig – bitte den QR-Code neu scannen."; warn = true; }
  else if (!s.online) { t = "Offline" + (s.wartend ? " – " + s.wartend + (s.wartend === 1 ? " Zeit wartet" : " Zeiten warten") + " auf Versand" : " – zeige zuletzt geladene Zeiten"); warn = true; }
  else if (s.wartend) { t = s.wartend + (s.wartend === 1 ? " Zeit wird" : " Zeiten werden") + " gesendet …"; }
  else if (!s.geladen) { t = "Lade Zeiten …"; }
  if (s.fehler && s.konfiguriert) {
    const f = el("div", "status warn", s.fehler + " ");
    const x = el("button", "x", "✕"); x.onclick = () => store.fehlerWeg(); f.appendChild(x); S.appendChild(f);
  }
  if (!t && s.admin) t = "Admin-Modus";
  else if (t && s.admin && !warn) t = "Admin-Modus · " + t;
  if (t) S.appendChild(el("div", "status" + (warn ? " warn" : ""), t));
}

store.onStatus(drawStatus);
store.onAdmin(() => { editId = null; pend = null; render(); });
store.onChange(() => {
  if (tab === "tv") return tvLive();
  if (tab === "eintragen") return drawLast();
  if (tab === "mehr" || editId !== null) return; // Eingabefelder nicht zurücksetzen
  render();
});
store.load();
drawStatus(store.status());
render();
