import { describe, expect, it } from "vitest";
import { transform, getOutputFile,
  isCommemorationFile,
} from "./step6";

describe("step6 transform", () => {
  it("turns a filename rubric suffix into a condition", () => {
    // `01-01t` — the `t` suffix maps to the 1570 rubric.
    expect(
      transform(
        { oratio: [{ value: ["x"], condition: [] }] },
        "Sancti\\01-01t.json"
      )
    ).toEqual({ oratio: [{ condition: ["1570"], value: ["x"] }] });
  });

  it("adds a directory-variant condition", () => {
    // `SanctiCist` — the Cist directory maps to cisterciensis.
    expect(
      transform(
        { name: [{ value: ["Foo"], condition: [] }] },
        "SanctiCist\\01-01.json"
      )
    ).toEqual({ name: [{ condition: ["cisterciensis"], value: ["Foo"] }] });
  });

  it("extends an existing variant condition instead of replacing it", () => {
    // A step-1 header condition (1570) is kept, with the directory token added.
    expect(
      transform(
        { oratio: [{ value: ["x"], condition: ["1570"] }] },
        "SanctiCist\\01-01.json"
      )
    ).toEqual({ oratio: [{ condition: ["1570", "cisterciensis"], value: ["x"] }] });
  });

  it("derives the same conditions from a POSIX input path", () => {
    expect(
      transform({ oratio: [{ value: ["x"], condition: [] }] }, "Sancti/01-01t.json")
    ).toEqual({ oratio: [{ condition: ["1570"], value: ["x"] }] });
    expect(
      transform(
        { name: [{ value: ["Foo"], condition: [] }] },
        "SanctiCist/01-01.json"
      )
    ).toEqual({ name: [{ condition: ["cisterciensis"], value: ["Foo"] }] });
  });
});

describe("step6 getOutputFile", () => {
  it("folds a variant directory into its base", () => {
    expect(getOutputFile("root\\SanctiCist\\01-01.json")).toBe(
      "root\\Sancti\\01-01.json"
    );
  });

  it("strips a filename rubric suffix", () => {
    expect(getOutputFile("root\\Sancti\\01-01t.json")).toBe(
      "root\\Sancti\\01-01.json"
    );
  });

  it("folds and strips on POSIX paths", () => {
    expect(getOutputFile("root/SanctiCist/01-01.json")).toBe(
      "root/Sancti/01-01.json"
    );
    expect(getOutputFile("root/Sancti/01-01t.json")).toBe(
      "root/Sancti/01-01.json"
    );
  });
});

describe("step6 commemorations stand alone", () => {
  it("keeps a commemoration on its own path", () => {
    expect(getOutputFile("root/Sancti/09-08cc.json")).toBe(
      "root/Sancti/09-08cc.json"
    );
    expect(getOutputFile("root/Sancti/01-05octt.json")).toBe(
      "root/Sancti/01-05octt.json"
    );
  });

  it("still folds the day itself onto its base", () => {
    expect(getOutputFile("root/Sancti/09-08t.json")).toBe(
      "root/Sancti/09-08.json"
    );
  });

  it("does not condition a standalone commemoration on `commemoratio`", () => {
    const out = transform(
      { oratio: [{ value: ["Adrian"], condition: [] }] } as never,
      "root/Sancti/09-08cc.json"
    );
    expect(out.oratio).toEqual([{ value: ["Adrian"], condition: [] }]);
  });

  it("recognises a commemoration filename", () => {
    expect(isCommemorationFile("09-08cc")).toBe(true);
    expect(isCommemorationFile("01-05octt")).toBe(true);
    expect(isCommemorationFile("09-08")).toBe(false);
    expect(isCommemorationFile("09-08t")).toBe(false);
  });
});
