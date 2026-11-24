import { describe, expect, it } from "vitest";
import { languageProblems, type Language } from "./language";

/**
 * The days hold keys and a language's stores say what the keys mean, so the two
 * are only right for each other when they were generated together. Each
 * carries the version of the days it was generated with.
 */
describe("a language read against the calendar's days", () => {
  const stores = { oratio: { "deus-qui-1": { text: "Deus, qui" } } };
  const language = (fields: Partial<Language> & { masspropers?: Record<string, unknown> }): Language => {
    const { masspropers, ...rest } = fields;
    return { code: "nl", assets: masspropers ? { masspropers } : {}, ...rest };
  };

  it("is taken where its stores are keyed to these days", () => {
    expect(languageProblems([language({ masspropers: stores, dataVersion: "aaaa" })], "aaaa")).toEqual([]);
  });

  it("is refused where its stores are keyed to other days, naming both and what to install", () => {
    const problems = languageProblems([language({ masspropers: stores, dataVersion: "bbbb" })], "aaaa");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"nl"');
    expect(problems[0]).toContain("bbbb");
    expect(problems[0]).toContain("aaaa");
    expect(problems[0]).toContain("@sint-willibrordkerk/liturgical-calendar-nl");
  });

  it("is refused where its stores say nothing of the days they are keyed to", () => {
    const problems = languageProblems([language({ masspropers: stores })], "aaaa");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("@sint-willibrordkerk/liturgical-calendar-nl");
  });

  it("is taken whatever the days where it carries no stores", () => {
    expect(languageProblems([language({})], "aaaa")).toEqual([]);
    expect(languageProblems([{ code: "nl", assets: { translations: { seasons: { adventus: "Advent" } } } }], "aaaa")).toEqual([]);
  });

  it("is taken as it is where the days carry no version, as a test's own do", () => {
    expect(languageProblems([language({ masspropers: stores, dataVersion: "bbbb" })], undefined)).toEqual([]);
  });

  it("is checked each on its own, the fallbacks too", () => {
    const problems = languageProblems(
      [
        language({ masspropers: stores, dataVersion: "aaaa" }),
        language({ code: "la", masspropers: stores, dataVersion: "bbbb" }),
      ],
      "aaaa"
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"la"');
  });
});
