import { describe, expect, it } from "vitest";
import { calendarOf } from "./generate";
import type { Assets } from "./assets";
import type { Language } from "./language";
import { calendarAssets } from "../scripts/assets.mjs";

/**
 * The calendar is generated from the assets it is given: the build gives it
 * the ones it bundles, a test its own. Nothing is read from anywhere else.
 */
describe("a calendar generated from the assets it is given", () => {
  const source: Assets = calendarAssets("assets", { days: false });
  const day = { title: "S. Agnetis", oratio: "deus-qui-1" };
  const withDays = (dataVersion?: string): Assets => ({
    files: { ...source.files, "mass-propers/Sancti/agnetis-virginis-et-martyris.yml": day },
    ...(dataVersion === undefined ? {} : { dataVersion }),
  });
  const latin = (dataVersion?: string): Language => ({
    code: "la",
    ...(dataVersion === undefined ? {} : { dataVersion }),
    assets: { masspropers: { oratio: { "deus-qui-1": { text: "Omnípotens", closure: "Per Dominum" } } } },
  });
  const agnes = (calendar: ReturnType<ReturnType<typeof calendarOf>>) => calendar[1]![21]!;

  it("places the days without any language", () => {
    expect(agnes(calendarOf(source)({ year: 2026 })).id).toBe("agnetis-virginis-et-martyris");
  });

  it("reads the Mass of a day from its own days, in a language keyed to them", () => {
    const calendar = calendarOf(withDays("aaaa"))({ year: 2026, languages: [latin("aaaa")] });
    expect(agnes(calendar).mass?.oratio).toEqual({ text: "Omnípotens", closure: "Per Dominum" });
  });

  it("refuses a language whose stores are keyed to other days", () => {
    const generate = calendarOf(withDays("aaaa"));
    expect(() => generate({ year: 2026, languages: [latin("bbbb")] })).toThrow(/"la".*bbbb.*aaaa/s);
    expect(() => generate({ year: 2026, languages: [latin()] })).toThrow(/"la"/);
  });

  it("refuses a fallback keyed to other days too", () => {
    const generate = calendarOf(withDays("aaaa"));
    const dutch: Language = { code: "nl", dataVersion: "aaaa", assets: { masspropers: {} } };
    expect(() => generate({ year: 2026, languages: [dutch, latin("bbbb")] })).toThrow(/"la"/);
  });

  it("keeps two sets of assets apart", () => {
    const bare = calendarOf(source);
    const full = calendarOf(withDays());
    expect(agnes(full({ year: 2026, languages: [latin()] })).mass).toBeDefined();
    expect(agnes(bare({ year: 2026, languages: [latin()] })).mass).toBeUndefined();
  });

  it("says what is missing where it is given no calendar", () => {
    expect(() => calendarOf({ files: {} })({ year: 2026 })).toThrow(/calendar1962\.yml/);
  });
});
