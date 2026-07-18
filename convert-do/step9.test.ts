import { describe, expect, it } from "vitest";
import {
  transform,
  linesToVerse,
  linesToPrayer,
  linesToAntiphonal,
  linesToGraduale,
  transformRule,
  getSectionType,
} from "./step9";

const v = (value: unknown, condition: string[] = []) => ({ value, condition });

describe("step9 missa structuring", () => {
  it("maps section keys to their type", () => {
    expect(getSectionType("lectio")).toBe("verse");
    expect(getSectionType("oratio")).toBe("prayer");
    expect(getSectionType("graduale")).toBe("antiphonal");
    expect(getSectionType("preamble")).toBeNull();
  });

  it("verse: pulls !ref, drops $-lines and leading v.", () => {
    expect(linesToVerse(["!Io 1:1", "v. In principio", "erat Verbum"])).toEqual({
      ref: "Io 1:1",
      text: "In principio\nerat Verbum",
    });
  });

  it("prayer: separates $-closure from the body", () => {
    expect(linesToPrayer(["Oremus.", "Deus qui", "$Per Dominum"])).toEqual({
      text: "Oremus.\nDeus qui",
      closure: "Per Dominum",
    });
  });

  it("antiphonal: splits antiphon and verse by ref, dropping a repeated antiphon tail", () => {
    const out = linesToAntiphonal([
      "!Ps 42:1",
      "Introduce me",
      "!Ps 42:2",
      "Emitte lucem",
      "v. Introduce me",
    ]);
    expect(out.antiphon).toEqual({ ref: "Ps 42:1", text: "Introduce me" });
    expect(out.verse).toEqual({ ref: "Ps 42:2", text: "Emitte lucem" });
  });

  it("graduale: parses antiphon/verse and alleluia blocks", () => {
    const out = linesToGraduale([
      "!Ps 1:1",
      "Beatus vir",
      "v. qui timet",
      "!Alleluia",
      "Alleluia text",
    ]);
    expect(out.antiphon.text).toBe("Beatus vir");
    expect(out.verse.text).toBe("qui timet");
    expect(out.alleluia).toEqual({ ref: "Alleluia", text: "Alleluia text" });
  });

  it("graduale: a !Tractus second block yields no alleluia", () => {
    const out = linesToGraduale(["!Ps 1:1", "Beatus vir", "!Tractus", "tract text"]);
    expect(out.alleluia).toEqual({ ref: "", text: "" });
  });

  it("rule: drops Gloria/Credo and lifts Prefatio", () => {
    expect(transformRule(["Gloria", "Credo", "Prefatio=De Trinitate", "keep"])).toEqual(
      { rule: ["keep"], prefatio: "de trinitate" }
    );
  });

  it("transform structures each variant and emits prefatio alongside rule", () => {
    const out = transform({
      oratio: [v(["Deus", "$Per Dominum"])],
      rule: [v(["Gloria", "Prefatio=Communis"])],
      name: [v(["Something"])],
    });
    expect(out.oratio).toEqual([v({ text: "Deus", closure: "Per Dominum" })]);
    expect(out.rule).toEqual([v([])]);
    expect(out.prefatio).toEqual([v("communis")]);
    expect(out.name).toEqual([v(["Something"])]);
  });

  it("structures each rubric variant of a section independently", () => {
    const out = transform({
      oratio: [v(["A", "$Per Dominum"]), v(["B", "$Per Christum"], ["1570"])],
    });
    expect(out.oratio).toEqual([
      v({ text: "A", closure: "Per Dominum" }),
      v({ text: "B", closure: "Per Christum" }, ["1570"]),
    ]);
  });
});
