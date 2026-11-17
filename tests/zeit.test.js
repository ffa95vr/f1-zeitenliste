import { describe, it, expect } from "vitest";
import { parse, fmt, fmtS, best, pruefeEintrag, vorhandeneSchreibweise, prevStats } from "../src/zeit.js";
import { csvText, parseCsv } from "../src/csv.js";

describe("Zeitformat", () => {
  it("liest m.ss,ttt", () => expect(parse("1.17,156")).toBe(77156));
  it("liest unter einer Minute", () => expect(parse("17,156")).toBe(17156));
  it("liest 1:17.156", () => expect(parse("1:17.156")).toBe(77156));
  it("liest Sektor 28,456", () => expect(parse("28,456")).toBe(28456));
  it("kürzere Tausendstel", () => expect(parse("1.17,1")).toBe(77100));
  it("Sekunden ab 60 ungültig", () => expect(parse("1.60,000")).toBeNull());
  it("Unsinn ungültig", () => { expect(parse("abc")).toBeNull(); expect(parse("1.2.3.4")).toBeNull(); });
  it("10 Minuten und mehr ungültig", () => expect(parse("10.00,000")).toBeNull());
  it("formatiert", () => { expect(fmt(77156)).toBe("1.17,156"); expect(fmt(65004)).toBe("1.05,004"); });
  it("formatiert Sektoren", () => expect(fmtS(28456)).toBe("28,456"));
  it("Hin und zurück", () => { for (const ms of [1, 999, 59999, 60000, 77156, 599999]) expect(parse(fmt(ms))).toBe(ms); });
});

describe("Rangliste", () => {
  const L = [
    { name: "Anna", ms: 80000 }, { name: "anna", ms: 78000 }, { name: "Ben", ms: 79000 },
    { name: "Cem", ms: 79000 }, { name: "Dora", ms: 81000 },
  ];
  const b = best(L);
  it("nur beste Zeit pro Fahrer, Groß/Klein egal", () => expect(b.length).toBe(4));
  it("gleiche Zeit = gleicher Rang", () => expect(b.map(x => x.rank)).toEqual([1, 2, 2, 4]));
});

describe("Eingabe prüfen", () => {
  const ok = { name: "Anna", strecke: "Monza", zeit: "1.17,156", sektoren: ["", "", ""] };
  it("normale Zeit", () => expect(pruefeEintrag(ok)).toEqual({ ms: 77156, s: null }));
  it("Name fehlt", () => expect(pruefeEintrag({ ...ok, name: " " }).fehler).toMatch(/Namen/));
  it("Strecke fehlt", () => expect(pruefeEintrag({ ...ok, strecke: "" }).fehler).toMatch(/Strecke/));
  it("Summe der Sektoren", () =>
    expect(pruefeEintrag({ ...ok, zeit: "", sektoren: ["25,000", "26,000", "26,156"] })).toEqual({ ms: 77156, s: [25000, 26000, 26156] }));
  it("Sektoren passen nicht", () =>
    expect(pruefeEintrag({ ...ok, sektoren: ["25,000", "26,000", "26,000"] }).fehler).toMatch(/ergeben/));
  it("Sektoren länger als Runde", () =>
    expect(pruefeEintrag({ ...ok, zeit: "50,000", sektoren: ["30,000", "30,000", ""] }).fehler).toMatch(/länger/));
  it("Sektor unlesbar", () => expect(pruefeEintrag({ ...ok, sektoren: ["x", "", ""] }).fehler).toMatch(/Sektorzeit/));
  it("Rundenzeit unlesbar, auch wenn Sektoren da sind", () =>
    expect(pruefeEintrag({ ...ok, zeit: "1.99,000", sektoren: ["25,000", "26,000", "26,156"] }).fehler).toMatch(/nicht lesbar/));
  it("gar keine Zeit", () => expect(pruefeEintrag({ ...ok, zeit: "" }).fehler).toMatch(/Rundenzeit/));
});

describe("Zusammenführen und Vergleich", () => {
  it("vorhandene Schreibweise", () => expect(vorhandeneSchreibweise("monza", ["Monza", "Spa"])).toBe("Monza"));
  it("Bestzeit und Rekord", () => {
    const E = [{ name: "A", tr: "Spa", st: "R21", ms: 100 }, { name: "B", tr: "Spa", st: "R21", ms: 90 }, { name: "A", tr: "Spa", st: "G29", ms: 80 }];
    expect(prevStats(E, "A", "Spa", "R21")).toEqual({ pb: 80, rec: 90 });
  });
});

describe("CSV", () => {
  const E = [{ id: 1, name: "Anna", tr: "Monza", st: "R21", car: "Ferrari", ts: Date.parse("2026-12-04T18:00:00Z"), ms: 77156, s: [25000, 26000, 26156] }];
  it("Export und Import ergeben dieselben Daten", () => {
    const { neu, sk } = parseCsv(csvText(E), []);
    expect(sk).toBe(0);
    expect(neu).toEqual([{ name: "Anna", tr: "Monza", st: "R21", car: "Ferrari", ts: E[0].ts, ms: 77156, s: [25000, 26000, 26156] }]);
  });
  it("Doppelte werden übersprungen", () => expect(parseCsv(csvText(E), E)).toEqual({ neu: [], sk: 1 }));
  it("Ungültige Station wird übersprungen", () => expect(parseCsv("x;A;Monza;Rig 1;;1.00,000;60000;;;", []).sk).toBe(1));
});
