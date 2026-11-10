import { describe, expect, it } from "vitest";
import { asLanguages, NO_LANGUAGE, type Language } from "./language";

const nl: Language = { code: "nl", assets: {} };
const la: Language = { code: "la", assets: {} };

describe("asLanguages", () => {
  it("keeps the languages in the order given, the first being the one asked for", () => {
    expect(asLanguages([nl])).toEqual([nl]);
    expect(asLanguages([nl, la])).toEqual([nl, la]);
  });

  it("has no language with an empty list", () => {
    expect(asLanguages([])).toEqual([NO_LANGUAGE]);
  });
});
