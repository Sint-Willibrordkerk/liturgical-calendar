import { describe, expect, it } from "vitest";
import { applyCondition, applyIncludes, parseConditional } from "./condition";

describe("applyIncludes", () => {
  it("adds default replacement and exclusion fallbacks when only excludes are present", () => {
    const result = applyIncludes(
      [],
      ["monastica", "2020"],
      ["replacement"],
      [{ value: ["default"], condition: [] }]
    );

    // pushResult merges []: first default row is replaced by replacement for [].
    expect(result).toEqual([
      { value: ["replacement"], condition: [] },
      { value: ["default"], condition: ["monastica"] },
      { value: ["default"], condition: ["2020"] },
    ]);
  });

  it("adds include condition and include+exclude rollback to default", () => {
    const result = applyIncludes(
      ["2020", "feria"],
      ["monastica"],
      ["special"],
      [{ value: ["base"], condition: [] }]
    );

    expect(result).toEqual([
      { value: ["base"], condition: [] },
      { value: ["special"], condition: ["2020", "feria"] },
      { value: ["base"], condition: ["2020", "feria", "monastica"] },
    ]);
  });
});

describe("applyCondition", () => {
  it("adds unconditional value when condition is null", () => {
    const result = applyCondition(null, ["value"], []);

    expect(result).toEqual([{ value: ["value"], condition: [] }]);
  });

  it("parses aut/et/nisi into include and exclude condition sets", () => {
    const result = applyCondition(
      "tempore post septuagesimam aut innovata et feriali nisi monastica",
      ["special"],
      [{ value: ["base"], condition: [] }]
    );

    expect(result).toEqual([
      { value: ["base"], condition: [] },
      { value: ["special"], condition: ["post"] },
      { value: ["special"], condition: ["2020", "feria"] },
      { value: ["base"], condition: ["2020", "feria", "monastica"] },
    ]);
  });
});

describe("parseConditional", () => {
  it("extracts stopword and scope from condition", () => {
    const parsed = parseConditional("si rubrica tridentina hi versus");

    expect(parsed).toEqual({
      stopword: "si",
      condition: "rubrica tridentina",
      scope: "hi versus",
      instruction: undefined,
      semper: false,
      strength: 0,
      backScope: "scope-chunk",
      forwardScope: "scope-chunk",
    });
  });

  it("separates an omittitur instruction from the condition", () => {
    const parsed = parseConditional(
      "rubrica 1955 aut rubrica 1960 aut rubrica Newcal omittitur"
    );

    expect(parsed).toEqual({
      stopword: undefined,
      condition: "rubrica 1955 aut rubrica 1960 aut rubrica Newcal",
      scope: undefined,
      instruction: "omittitur",
      semper: false,
      strength: 0,
      backScope: "scope-chunk",
      forwardScope: "scope-null",
    });
  });

  it("gives omittuntur the nesting as its back-scope", () => {
    const parsed = parseConditional("sed rubrica 1960 omittuntur");

    expect(parsed).toMatchObject({
      stopword: "sed",
      condition: "rubrica 1960",
      instruction: "omittuntur",
      backScope: "scope-nest",
      forwardScope: "scope-null",
    });
  });

  it("reads a scope phrase before the instruction", () => {
    const parsed = parseConditional(
      "sed rubrica 1955 aut rubrica 1960 hæc versus omittuntur"
    );

    expect(parsed).toMatchObject({
      condition: "rubrica 1955 aut rubrica 1960",
      scope: "hæc versus",
      instruction: "omittuntur",
      backScope: "scope-nest",
      forwardScope: "scope-null",
    });
  });

  it("separates a dicitur instruction from the condition", () => {
    const parsed = parseConditional("rubrica 1960 aut rubrica Newcal dicitur");

    expect(parsed).toEqual({
      stopword: undefined,
      condition: "rubrica 1960 aut rubrica Newcal",
      scope: undefined,
      instruction: "dicitur",
      semper: false,
      strength: 0,
      backScope: "scope-null",
      forwardScope: "scope-line",
    });
  });

  it("gives dicuntur the nesting as its forward scope", () => {
    const parsed = parseConditional("deinde dicuntur semper");

    expect(parsed).toMatchObject({
      stopword: "deinde",
      condition: "",
      instruction: "dicuntur",
      semper: true,
      backScope: "scope-null",
      forwardScope: "scope-nest",
    });
  });

  it("uses backscoped stopword strength and resets scope for semper", () => {
    const parsed = parseConditional("sed innovata semper");

    expect(parsed).toEqual({
      stopword: "sed",
      condition: "innovata",
      scope: undefined,
      instruction: undefined,
      semper: true,
      strength: 1,
      backScope: "scope-null",
      forwardScope: "scope-line",
    });
  });

  it("promotes versuum scope to nested backScope", () => {
    const parsed = parseConditional(
      "deinde missa tridentina loco horum versuum"
    );

    expect(parsed).toEqual({
      stopword: "deinde",
      condition: "missa tridentina",
      scope: "loco horum versuum",
      instruction: undefined,
      semper: false,
      strength: 1,
      backScope: "scope-nest",
      forwardScope: "scope-chunk",
    });
  });
});
