import { describe, expect, it } from "vitest";
import { transform, getOutputFile } from "./step2";

describe("step2 transform", () => {
  it("turns a filename rubric suffix into a condition", () => {
    // `01-01t` — the `t` suffix maps to the 1570 rubric.
    expect(
      transform(
        { oratio: [{ value: ["x"], condition: [] }] },
        "missa\\Sancti\\01-01t.txt"
      )
    ).toEqual({ oratio: [{ condition: ["1570"], value: ["x"] }] });
  });

  it("adds a directory-variant condition", () => {
    // `SanctiCist` — the Cist directory maps to cisterciensis.
    expect(
      transform(
        { name: [{ value: ["Foo"], condition: [] }] },
        "missa\\SanctiCist\\01-01.txt"
      )
    ).toEqual({ name: [{ condition: ["cisterciensis"], value: ["Foo"] }] });
  });
});

describe("step2 getOutputFile", () => {
  it("strips \\missa\\ and folds a variant directory into its base", () => {
    expect(getOutputFile("root\\missa\\SanctiCist\\01-01.yml")).toBe(
      "root\\Sancti\\01-01.yml"
    );
  });

  it("strips \\horas\\ so horas and missa collapse onto one path", () => {
    expect(getOutputFile("root\\horas\\Sancti\\01-01.yml")).toBe(
      "root\\Sancti\\01-01.yml"
    );
  });
});
