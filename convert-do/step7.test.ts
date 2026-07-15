import { describe, expect, it } from "vitest";
import {
  transform,
  getAllDisplayNames,
  toKebabFileName,
  resolveCollisions,
} from "./step7";

describe("step7 name/filename", () => {
  it("folds rank into name using the first ;;-part", () => {
    const out = transform({
      rank: ["Ss. Nominis Iesu;;3;;something"],
      lectio1: ["x"],
    });
    expect(out).toEqual({ name: "Ss. Nominis Iesu", lectio1: ["x"] });
  });

  it("folds officium into name and drops the officium key", () => {
    const out = transform({ officium: ["De Sancta Maria"] });
    expect(out).toEqual({ name: "De Sancta Maria" });
  });

  it("maps rubric-suffixed rank/officium to matching name suffix", () => {
    const out = transform({ "rank/1570": ["Old Rite;;2"] });
    expect(out).toEqual({ "name/1570": "Old Rite" });
  });

  it("keeps an explicit name and normalizes to a string", () => {
    const out = transform({ name: ["Explicit Name"] });
    expect(out).toEqual({ name: "Explicit Name" });
  });

  it("collects distinct kebab display names across variants", () => {
    const names = getAllDisplayNames(
      { name: "Sanctae Mariae", "name/1570": "Beatae Mariae Virginis" },
      "01-01"
    );
    expect(names.sort()).toEqual(
      ["beatae-mariae-virginis", "sanctae-mariae"].sort()
    );
  });

  it("falls back to the original stem when there is no name", () => {
    expect(getAllDisplayNames({ lectio1: ["x"] }, "12-25")).toEqual(["12-25"]);
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
    const names = resolved.map((r) => r.finalBasename).sort();
    expect(names).toEqual(["maria-01-01", "maria-02-02"]);
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
