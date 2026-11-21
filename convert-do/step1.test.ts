import { describe, expect, it } from "vitest";
import { transform } from "./step1";

describe("step1 transform", () => {
  it("groups lines into kebab-cased section keys with a preamble", () => {
    expect(
      transform(["pre1", "[Lectio1]", "text1", "[Oratio]", "text2"])
    ).toEqual({
      __preamble: [{ value: ["pre1"], condition: [] }],
      lectio1: [{ value: ["text1"], condition: [] }],
      oratio: [{ value: ["text2"], condition: [] }],
    });
  });

  it("turns a section-header condition into a rubric variant", () => {
    // `(rubrica tridentina)` maps to the 1570 rubric token via condition.ts.
    expect(transform(["[Oratio] (rubrica tridentina)", "text"])).toEqual({
      oratio: [{ value: ["text"], condition: ["1570"] }],
    });
  });

  it("drops sections that end up empty", () => {
    expect(transform(["[Empty]", "[Lectio1]", "x"])).toEqual({
      lectio1: [{ value: ["x"], condition: [] }],
    });
  });
});

describe("step1 file-specific corrections", () => {
  const PREAMBLE_REF = "horas/Latin/SanctiOP/11-14M.txt";
  const RANK_TYPO = "missa/Nederlands/Sancti/09-02.txt";

  it("truncates the `@`-include preamble line only for SanctiOP/11-14M", () => {
    const lines = ["@SanctiM/11-14M;;Simplex;;1.1;;vide", "[Rank]", "x"];
    expect(transform(lines, PREAMBLE_REF)).toEqual({
      __preamble: [{ value: ["@SanctiM/11-14M"], condition: [] }],
      rank: [{ value: ["x"], condition: [] }],
    });
  });

  it("leaves preamble `;;` lines intact for any other file", () => {
    const lines = ["@SanctiM/11-14M;;Simplex;;1.1;;vide", "[Rank]", "x"];
    expect(transform(lines, "horas/Latin/Sancti/01-01.txt")).toEqual({
      __preamble: [{ value: ["@SanctiM/11-14M;;Simplex;;1.1;;vide"], condition: [] }],
      rank: [{ value: ["x"], condition: [] }],
    });
  });

  it("rewrites `d[Rank]` to `[Rank]` only for Nederlands Sancti/09-02", () => {
    const lines = ["d[Rank]", "Name;;Semiduplex;;2.2;;vide C5"];
    expect(transform(lines, RANK_TYPO)).toEqual({
      rank: [{ value: ["Name;;Semiduplex;;2.2;;vide C5"], condition: [] }],
    });
  });

  it("leaves `d[Rank]` as ordinary preamble text for any other file", () => {
    const lines = ["d[Rank]", "Name"];
    expect(transform(lines, "missa/Nederlands/Sancti/01-01.txt")).toEqual({
      __preamble: [{ value: ["d[Rank]", "Name"], condition: [] }],
    });
  });

  // The English movable announcements keep a stray Latin `[Pasc5-3]`, then the
  // English one under a header with a tab after it.
  const LATIN_PASC53 = [
    "[Pasc5-3]",
    "Romæ Litaníæ minóres ad sanctum Petrum.",
    " ",
    "[Pasc5-3]\t",
    "The Vigil of the Ascension of our Lord Jesus Christ.",
    "[Pasc5-4]",
    "The Ascension.",
  ];

  it("reads the English Mobile's second `[Pasc5-3]` in place of the stray Latin one", () => {
    expect(transform(LATIN_PASC53, "horas/English/Martyrologium/Mobile.txt")).toEqual({
      "pasc5-3": [{ value: ["The Vigil of the Ascension of our Lord Jesus Christ."], condition: [] }],
      "pasc5-4": [{ value: ["The Ascension."], condition: [] }],
    });
  });

  it("leaves a header with whitespace after it as text for any other file", () => {
    expect(transform(LATIN_PASC53, "horas/Latin/Martyrologium/Mobile.txt")["pasc5-3"]).toEqual([
      {
        value: [
          "Romæ Litaníæ minóres ad sanctum Petrum.",
          " ",
          "[Pasc5-3]\t",
          "The Vigil of the Ascension of our Lord Jesus Christ.",
        ],
        condition: [],
      },
    ]);
  });
});
