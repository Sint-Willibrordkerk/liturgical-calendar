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

  it("truncates preamble lines at the first ;;", () => {
    expect(transform(["Name;;extra;;more", "[Lectio1]", "x"])).toEqual({
      __preamble: [{ value: ["Name"], condition: [] }],
      lectio1: [{ value: ["x"], condition: [] }],
    });
  });

  it("drops sections that end up empty", () => {
    expect(transform(["[Empty]", "[Lectio1]", "x"])).toEqual({
      lectio1: [{ value: ["x"], condition: [] }],
    });
  });
});
