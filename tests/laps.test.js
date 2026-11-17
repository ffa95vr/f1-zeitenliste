import { describe, it, expect } from "vitest";
import { rowToEntry, entryToRow, merge, fehlerArt, neueId, codeAusLink } from "../src/laps.js";

const ROW = { id: 7, client_id: "c1", name: "Anna", strecke: "Monza", station: "R21", auto: "Ferrari", zeit_ms: 77156,
  s1_ms: 25000, s2_ms: 26000, s3_ms: 26156, created_at: "2026-12-04T18:00:00+00:00" };

describe("Datenbankzeilen", () => {
  it("Zeile → Eintrag", () => expect(rowToEntry(ROW)).toEqual({ id: 7, cid: "c1", name: "Anna", st: "R21", tr: "Monza",
    car: "Ferrari", ts: Date.parse("2026-12-04T18:00:00Z"), ms: 77156, s: [25000, 26000, 26156] }));
  it("ohne Sektoren kein s", () => expect(rowToEntry({ ...ROW, s1_ms: null, s2_ms: null, s3_ms: null }).s).toBeUndefined());
  it("Eintrag → Zeile ohne Zeitstempel (Gast)", () => {
    const r = entryToRow(rowToEntry(ROW), false);
    expect(r).toEqual({ client_id: "c1", name: "Anna", strecke: "Monza", station: "R21", auto: "Ferrari", zeit_ms: 77156,
      s1_ms: 25000, s2_ms: 26000, s3_ms: 26156 });
  });
  it("Admin-Import mit Zeitstempel", () => expect(entryToRow(rowToEntry(ROW), true).created_at).toBe("2026-12-04T18:00:00.000Z"));
  it("Import ohne Zeitstempel lässt ihn weg", () => expect(entryToRow({ name: "A", tr: "Spa", st: "G29", ms: 1, ts: 0 }, true).created_at).toBeUndefined());
  it("fehlende Sektoren als null", () => expect(entryToRow({ name: "A", tr: "Spa", st: "G29", ms: 9, s: [1, 0, 2] }, false))
    .toMatchObject({ s1_ms: 1, s2_ms: null, s3_ms: 2 }));
});

describe("Warteschlange", () => {
  it("bestätigte Einträge nicht doppelt", () => {
    const s = [{ id: 1, cid: "a" }], q = [{ id: 1e13, cid: "a" }, { id: 1e13 + 1, cid: "b" }];
    expect(merge(s, q).map(e => e.cid)).toEqual(["a", "b"]);
  });
});

describe("Fehler einordnen", () => {
  it("kein Fehler", () => expect(fehlerArt(null, 201)).toBeNull());
  it("kein Netz", () => expect(fehlerArt({ message: "TypeError: Failed to fetch", code: "" }, 0)).toBe("netz"));
  it("Server down", () => expect(fehlerArt({ message: "x", code: "PGRST" }, 503)).toBe("netz"));
  it("Code falsch (RLS)", () => expect(fehlerArt({ message: "new row violates row-level security policy", code: "42501" }, 401)).toBe("code"));
  it("Limit", () => expect(fehlerArt({ message: "Bitte kurz warten, bevor …", code: "P0001" }, 400)).toBe("warten"));
  it("ungültig", () => expect(fehlerArt({ message: "violates check constraint", code: "23514" }, 400)).toBe("fehler"));
});

describe("Hilfen", () => {
  it("UUID v4", () => expect(neueId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  it("Code aus Link", () => {
    expect(codeAusLink("?code=3mdfrdzw")).toBe("3mdfrdzw");
    expect(codeAusLink("?x=1")).toBe("");
    expect(codeAusLink("?code=<script>")).toBe("");
  });
});
