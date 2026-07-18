import { describe, expect, it } from "vitest";
import {
  transform,
  getAllDisplayNames,
  toKebabFileName,
  resolveCollisions,
} from "./step7";

const v = (value: string[], condition: string[] = []) => ({ value, condition });

describe("step7 name/filename", () => {
  it("folds rank into a name variant using the first ;;-part", () => {
    const out = transform({
      rank: [v(["Ss. Nominis Iesu;;3;;something"])],
      lectio1: [v(["x"])],
    });
    expect(out).toEqual({
      lectio1: [v(["x"])],
      name: [v(["Ss. Nominis Iesu"])],
    });
  });

  it("folds officium into name and drops the officium key", () => {
    expect(transform({ officium: [v(["De Sancta Maria"])] })).toEqual({
      name: [v(["De Sancta Maria"])],
    });
  });

  it("keeps the rubric condition on the derived name", () => {
    expect(transform({ rank: [v(["Old Rite;;2"], ["1570"])] })).toEqual({
      name: [v(["Old Rite"], ["1570"])],
    });
  });

  it("lets an explicit name override a rank-derived one per condition", () => {
    const out = transform({
      rank: [v(["From Rank;;2"])],
      name: [v(["Explicit Name"])],
    });
    expect(out).toEqual({ name: [v(["Explicit Name"])] });
  });

  it("collects distinct kebab display names across name variants", () => {
    const names = getAllDisplayNames(
      { name: [v(["Sanctae Mariae"]), v(["Beatae Mariae Virginis"], ["1570"])] },
      "01-01"
    );
    expect(names.sort()).toEqual(
      ["beatae-mariae-virginis", "sanctae-mariae"].sort()
    );
  });

  it("falls back to the original stem when there is no name", () => {
    expect(getAllDisplayNames({ lectio1: [v(["x"])] }, "12-25")).toEqual([
      "12-25",
    ]);
  });

  it("kebab-cases and strips invalid filename characters", () => {
    expect(toKebabFileName("S. Joannis: Ante Portam")).toBe(
      "s.-joannis-ante-portam"
    );
  });

  it("disambiguates same-name different-content by original stem", () => {
    const resolved = resolveCollisions([
      { targetBasename: "maria", originalStem: "01-01", relPath: "la/01-01.yml", content: "a" },
      { targetBasename: "maria", originalStem: "02-02", relPath: "la/02-02.yml", content: "b" },
    ]);
    expect(resolved.map((r) => r.finalBasename).sort()).toEqual([
      "maria-01-01",
      "maria-02-02",
    ]);
  });

  it("collapses same-name same-content into one file", () => {
    const resolved = resolveCollisions([
      { targetBasename: "maria", originalStem: "01-01", relPath: "la/01-01.yml", content: "same" },
      { targetBasename: "maria", originalStem: "02-02", relPath: "la/02-02.yml", content: "same" },
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.finalBasename).toBe("maria");
  });
});
