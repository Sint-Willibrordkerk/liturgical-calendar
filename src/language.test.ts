import { describe, expect, it } from "vitest";
import { asLanguages, NO_LANGUAGE, type Language } from "./language";

const nl: Language = { code: "nl", assets: {} };
const la: Language = { code: "la", assets: {} };

describe("asLanguages", () => {
  it("takes one language as a list of one", () => {
    expect(asLanguages(nl)).toEqual([nl]);
  });

  it("keeps several in the order given, the first being the one asked for", () => {
    expect(asLanguages([nl, la])).toEqual([nl, la]);
  });

  it("has no language without one, or with an empty list", () => {
    expect(asLanguages(undefined)).toEqual([NO_LANGUAGE]);
    expect(asLanguages([])).toEqual([NO_LANGUAGE]);
  });

  it("refuses a code, alone or in a list, with the reason", () => {
    expect(() => asLanguages("nl")).toThrow(/language package, not the code "nl"/);
    expect(() => asLanguages([nl, "la" as unknown as Language])).toThrow(/"la"/);
  });
});
