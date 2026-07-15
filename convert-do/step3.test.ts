import { describe, expect, it } from "vitest";
import {
  isStep3SkippedForPath,
  parseConditionalLine,
  processConditionalLines,
  processConditionalLinesForRubric,
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

/** Rubric tokens that match `rubrica 1960` / `1960` predicate (via condition.ts). */
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

describe("processConditionalLinesForRubric (single rubric)", () => {
  it("passes plain lines through for default rubric", () => {
    expect(processConditionalLinesForRubric(["a", "b"], [])).toEqual([
      "a",
      "b",
    ]);
  });

  it("strips escape tilde", () => {
    expect(processConditionalLinesForRubric(["~literal"], [])).toEqual([
      "literal",
    ]);
  });

  describe("scope-line back-scope (sed)", () => {
    it("removes the preceding line when the rubric matches and forward scope closes after one line", () => {
      expect(
        processConditionalLinesForRubric(
          ["before", "(sed rubrica 1960)", "after"],
          RUBRIC_1962
        )
      ).toEqual(["after"]);
    });

    it("does not push a conditional-only line when rest is empty", () => {
      expect(
        processConditionalLinesForRubric(["(sed rubrica 1960)"], RUBRIC_1962)
      ).toEqual([]);
    });
  });

  describe("si + rubric mismatch (not-yet affirmative)", () => {
    it("suppresses lines until the next line ends scope-line forward scope", () => {
      expect(
        processConditionalLinesForRubric(
          ["(si innovata)", "suppressed", "allowed"],
          []
        )
      ).toEqual(["allowed"]);
    });

    it("suppresses same-line rest after the conditional when rubric does not match", () => {
      expect(
        processConditionalLinesForRubric(["(si innovata) same-line"], [])
      ).toEqual([]);
    });
  });

  describe("si + rubric match", () => {
    it("keeps same-line rest when the rubric satisfies the condition", () => {
      expect(
        processConditionalLinesForRubric(["(si innovata) kept"], RUBRIC_2020)
      ).toEqual(["kept"]);
    });

    it("keeps following lines when the rubric matches", () => {
      expect(
        processConditionalLinesForRubric(
          ["(si innovata)", "a", "b"],
          RUBRIC_2020
        )
      ).toEqual(["a", "b"]);
    });
  });

  describe("scope-chunk back-scope (hi versus)", () => {
    it("removes the preceding consecutive non-blank block when rubric matches", () => {
      expect(
        processConditionalLinesForRubric(
          ["line1", "line2", "(si rubrica tridentina hi versus) tail"],
          RUBRIC_1570
        )
      ).toEqual(["tail"]);
    });

    it("removes only the last non-blank run; trailing blanks after that run are also popped", () => {
      expect(
        processConditionalLinesForRubric(
          ["keep", "", "drop1", "drop2", "(si rubrica tridentina hi versus)"],
          RUBRIC_1570
        )
      ).toEqual(["keep"]);
    });
  });

  describe("forward scope-chunk (falls off on blank line)", () => {
    it("emits the blank that closes chunk scope, then continues after the scope ends", () => {
      expect(
        processConditionalLinesForRubric(
          ["(si rubrica tridentina hi versus)", "row1", "row2", "", "after"],
          RUBRIC_1570
        )
      ).toEqual(["row1", "row2", "", "after"]);
    });
  });

  describe("blank line handling", () => {
    it("treats whitespace-only lines as blank for chunk back-scope (removes them with the chunk tail)", () => {
      expect(
        processConditionalLinesForRubric(
          ["a", "   ", "b", "(si rubrica tridentina hi versus)"] as string[],
          RUBRIC_1570
        )
      ).toEqual(["a"]);
    });
  });

  describe("scope-nest back-scope (loco horum versuum)", () => {
    it("truncates all prior output to the fence when rubric matches", () => {
      expect(
        processConditionalLinesForRubric(
          ["x", "y", "(deinde missa tridentina loco horum versuum) tail"],
          RUBRIC_1570
        )
      ).toEqual(["tail"]);
    });
  });

  describe("higher stopword strength (attamen)", () => {
    it("accepts attamen conditionals without throwing (strength 3)", () => {
      expect(
        processConditionalLinesForRubric(
          ["(attamen rubrica tridentina)", "line"],
          RUBRIC_1570
        )
      ).toEqual(["line"]);
    });
  });
});

describe("processConditionalLines (variants)", () => {
  it("returns both default and matching rubric variants for (si ...)", () => {
    const variants: { value: string[]; condition: string[] }[] = [];
    processConditionalLines(["(si innovata) kept"], [], variants);

    const def = variants.find((v) => v.condition.length === 0);
    const match = variants.find((v) => v.condition.includes("2020"));

    expect(def?.value).toEqual([]);
    expect(match?.value).toEqual(["kept"]);
  });

  it("returns a combined condition variant when multiple inline conditionals exist", () => {
    const variants: { value: string[]; condition: string[] }[] = [];
    processConditionalLines(
      ["(si innovata) line1", "(si rubrica tridentina) line2"],
      [],
      variants
    );

    const both = variants.find(
      (v) => v.condition.includes("2020") && v.condition.includes("1570")
    );
    expect(both?.value).toEqual(["line1", "line2"]);
  });

  it("deduplicates identical full-rubric results when baseRubric already matches", () => {
    const variants: { value: string[]; condition: string[] }[] = [];
    processConditionalLines(["(si innovata) kept"], RUBRIC_2020, variants);
    expect(variants).toHaveLength(1);
    expect(variants[0]!.condition).toEqual(["2020"]);
    expect(variants[0]!.value).toEqual(["kept"]);
  });

  it("merges into the passed section result", () => {
    const sectionResult: { value: string[]; condition: string[] }[] = [];
    processConditionalLines(
      ["before", "(si innovata) after"],
      [],
      sectionResult
    );
    expect(sectionResult).toHaveLength(2);
    const matchSection = sectionResult.find((v) =>
      v.condition.includes("2020")
    );
    expect(matchSection?.value).toEqual(["before", "after"]);
  });
});

describe("transformSection", () => {
  it("transforms a section", () => {
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
    const result = transformSection(section);
    expect(result).toEqual([
      { value: [";;Simplex;;1.4;;vide Sancti/12-26"], condition: [] },
      {
        value: [";;Duplex;;3.1;;ex Sancti/12-26"],
        condition: ["1570"],
      },
    ]);
  });
});
