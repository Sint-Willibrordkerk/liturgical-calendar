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
});
