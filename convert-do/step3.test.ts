import { describe, expect, it } from "vitest";
import {
  isStep3SkippedForPath,
  parseConditionalLine,
  processConditionalLines,
  transformSection,
} from "./step3";

describe("isStep3SkippedForPath", () => {
  it("is true when any path segment is Ordo", () => {
    expect(isStep3SkippedForPath("nl/Ordo/Ordo.yml")).toBe(true);
    expect(isStep3SkippedForPath("nl\\Ordo\\Communio.yml")).toBe(true);
  });

  it("is false for other folders", () => {
    expect(isStep3SkippedForPath("nl/Sancti/01-01.yml")).toBe(false);
  });
});

/** Rubric tokens that satisfy the corresponding predicate (via condition.ts). */
const RUBRIC_1962 = ["1962"];
const RUBRIC_1570 = ["1570"];
const RUBRIC_2020 = ["2020"];

describe("parseConditionalLine", () => {
  it("parses leading conditional and rest", () => {
    expect(parseConditionalLine("  (sed rubrica 1960) more text")).toEqual({
      conditional: "sed rubrica 1960",
      rest: "more text",
    });
  });

  it("returns null when no opening paren at line start (after trim)", () => {
    expect(parseConditionalLine("x (foo)")).toBeNull();
  });

  it("returns null when closing paren is missing", () => {
    expect(parseConditionalLine("(only open")).toBeNull();
  });
});

/**
 * `processConditionalLines` returns every rubric variant at once as
 * `{ value, condition }[]`. This helper recovers the lines that survive for one
 * concrete rubric — the empty-condition (default) variant when no rubric is
 * given, otherwise the variant whose condition the rubric satisfies.
 */
function linesForRubric(lines: string[], rubric: string[]): string[] {
  const variants = processConditionalLines(lines, []);
  const match = variants.find(
    (v) => v.condition.length > 0 && v.condition.every((c) => rubric.includes(c))
  );
  const def = variants.find((v) => v.condition.length === 0);
  return (rubric.length && match ? match : def)?.value ?? [];
}

describe("processConditionalLines (per-rubric surviving lines)", () => {
  it("passes plain lines through for the default rubric", () => {
    expect(linesForRubric(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("strips the escape tilde", () => {
    expect(linesForRubric(["~literal"], [])).toEqual(["literal"]);
  });

  describe("scope-line back-scope (sed)", () => {
    it("removes the preceding line when the rubric matches", () => {
      expect(
        linesForRubric(["before", "(sed rubrica 1960)", "after"], RUBRIC_1962)
      ).toEqual(["after"]);
    });

    it("does not push a conditional-only line when rest is empty", () => {
      expect(linesForRubric(["(sed rubrica 1960)"], RUBRIC_1962)).toEqual([]);
    });
  });

  describe("si + rubric mismatch (default variant)", () => {
    it("suppresses lines until scope-line forward scope ends", () => {
      expect(
        linesForRubric(["(si innovata)", "suppressed", "allowed"], [])
      ).toEqual(["allowed"]);
    });

    it("suppresses the same-line rest after the conditional", () => {
      expect(linesForRubric(["(si innovata) same-line"], [])).toEqual([]);
    });
  });

  describe("si + rubric match", () => {
    it("keeps the same-line rest when the rubric satisfies the condition", () => {
      expect(linesForRubric(["(si innovata) kept"], RUBRIC_2020)).toEqual([
        "kept",
      ]);
    });

    it("keeps the following lines when the rubric matches", () => {
      expect(linesForRubric(["(si innovata)", "a", "b"], RUBRIC_2020)).toEqual([
        "a",
        "b",
      ]);
    });
  });

  describe("scope-chunk back-scope (hi versus)", () => {
    it("removes the preceding consecutive non-blank block when rubric matches", () => {
      expect(
        linesForRubric(
          ["line1", "line2", "(si rubrica tridentina hi versus) tail"],
          RUBRIC_1570
        )
      ).toEqual(["tail"]);
    });

    it("removes only the last non-blank run; trailing blanks are also popped", () => {
      expect(
        linesForRubric(
          ["keep", "", "drop1", "drop2", "(si rubrica tridentina hi versus)"],
          RUBRIC_1570
        )
      ).toEqual(["keep"]);
    });

    it("treats whitespace-only lines as blank for chunk back-scope", () => {
      expect(
        linesForRubric(
          ["a", "   ", "b", "(si rubrica tridentina hi versus)"],
          RUBRIC_1570
        )
      ).toEqual(["a"]);
    });
  });

  describe("forward scope-chunk (falls off on blank line)", () => {
    it("emits the blank that closes chunk scope, then continues", () => {
      expect(
        linesForRubric(
          ["(si rubrica tridentina hi versus)", "row1", "row2", "", "after"],
          RUBRIC_1570
        )
      ).toEqual(["row1", "row2", "", "after"]);
    });
  });

  describe("scope-nest back-scope (loco horum versuum)", () => {
    it("truncates all prior output to the fence when rubric matches", () => {
      expect(
        linesForRubric(
          ["x", "y", "(deinde missa tridentina loco horum versuum) tail"],
          RUBRIC_1570
        )
      ).toEqual(["tail"]);
    });
  });

  describe("higher stopword strength (attamen)", () => {
    it("accepts attamen conditionals without throwing (strength 3)", () => {
      expect(
        linesForRubric(["(attamen rubrica tridentina)", "line"], RUBRIC_1570)
      ).toEqual(["line"]);
    });
  });
});

describe("processConditionalLines (variant structure)", () => {
  it("returns both default and matching rubric variants for (si ...)", () => {
    const variants = processConditionalLines(["(si innovata) kept"], []);
    const def = variants.find((v) => v.condition.length === 0);
    const match = variants.find((v) => v.condition.includes("2020"));
    expect(def?.value).toEqual([]);
    expect(match?.value).toEqual(["kept"]);
  });

  it("produces a separate variant per matched rubric across multiple inline conditionals", () => {
    const variants = processConditionalLines(
      ["(si innovata) line1", "(si rubrica tridentina) line2"],
      []
    );
    expect(variants.find((v) => v.condition.includes("2020"))?.value).toEqual([
      "line1",
    ]);
    expect(
      variants.find((v) => v.condition.includes("1570"))?.value
    ).toEqual(["line1", "line2"]);
  });

  it("deduplicates when the passed base condition already matches", () => {
    const variants = processConditionalLines(["(si innovata) kept"], RUBRIC_2020);
    expect(variants).toHaveLength(1);
    expect(variants[0]!.condition).toEqual(["2020"]);
    expect(variants[0]!.value).toEqual(["kept"]);
  });

  it("carries earlier unconditional lines into the matching variant", () => {
    const variants = processConditionalLines(["before", "(si innovata) after"], []);
    expect(variants).toHaveLength(2);
    expect(
      variants.find((v) => v.condition.includes("2020"))?.value
    ).toEqual(["before", "after"]);
  });
});

describe("transformSection", () => {
  it("splits a section into rubric variants", () => {
    const section = [
      {
        value: [
          ";;Simplex;;1.4;;vide Sancti/12-26",
          "(sed rubrica tridentina)",
          ";;Duplex;;3.1;;ex Sancti/12-26",
        ],
        condition: [],
      },
    ];
    expect(transformSection(section)).toEqual([
      { value: [";;Simplex;;1.4;;vide Sancti/12-26"], condition: [] },
      { value: [";;Duplex;;3.1;;ex Sancti/12-26"], condition: ["1570"] },
    ]);
  });
});
