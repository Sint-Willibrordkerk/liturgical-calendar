import { describe, expect, it } from "vitest";
import { transform, getOutputFile } from "./step6";

describe("step6 transform", () => {
  it("turns a filename rubric suffix into a condition", () => {
    // `01-01t` — the `t` suffix maps to the 1570 rubric.
    expect(
      transform(
        { oratio: [{ value: ["x"], condition: [] }] },
        "Sancti\\01-01t.yml"
      )
    ).toEqual({ oratio: [{ condition: ["1570"], value: ["x"] }] });
  });

  it("adds a directory-variant condition", () => {
    // `SanctiCist` — the Cist directory maps to cisterciensis.
    expect(
      transform(
        { name: [{ value: ["Foo"], condition: [] }] },
        "SanctiCist\\01-01.yml"
      )
    ).toEqual({ name: [{ condition: ["cisterciensis"], value: ["Foo"] }] });
  });

  it("extends an existing variant condition instead of replacing it", () => {
    // A step-1 header condition (1570) is kept, with the directory token added.
    expect(
      transform(
        { oratio: [{ value: ["x"], condition: ["1570"] }] },
        "SanctiCist\\01-01.yml"
      )
    ).toEqual({ oratio: [{ condition: ["1570", "cisterciensis"], value: ["x"] }] });
  });

  it("derives the same conditions from a POSIX input path", () => {
    expect(
      transform({ oratio: [{ value: ["x"], condition: [] }] }, "Sancti/01-01t.yml")
    ).toEqual({ oratio: [{ condition: ["1570"], value: ["x"] }] });
    expect(
      transform(
        { name: [{ value: ["Foo"], condition: [] }] },
        "SanctiCist/01-01.yml"
      )
    ).toEqual({ name: [{ condition: ["cisterciensis"], value: ["Foo"] }] });
  });
});

describe("step6 getOutputFile", () => {
  it("folds a variant directory into its base", () => {
    expect(getOutputFile("root\\SanctiCist\\01-01.yml")).toBe(
      "root\\Sancti\\01-01.yml"
    );
  });

  it("strips a filename rubric suffix", () => {
    expect(getOutputFile("root\\Sancti\\01-01t.yml")).toBe(
      "root\\Sancti\\01-01.yml"
    );
  });

  it("folds and strips on POSIX paths", () => {
    expect(getOutputFile("root/SanctiCist/01-01.yml")).toBe(
      "root/Sancti/01-01.yml"
    );
    expect(getOutputFile("root/Sancti/01-01t.yml")).toBe(
      "root/Sancti/01-01.yml"
    );
  });
});
