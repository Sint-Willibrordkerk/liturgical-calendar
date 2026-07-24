import { describe, expect, it } from "vitest";
import {
  transform,
  getAllDisplayNames,
  toKebabFileName,
  resolveCollisions,
  collectNames,
} from "./step7";

const v = <T>(value: T, condition: string[] = []) => ({ value, condition });

describe("step7 name/filename", () => {
  it("drops rank/officium/name and designates the file it is written for", () => {
    const out = transform(
      { rank: [v(["Ss. Nominis Iesu;;3;;something"])], lectio1: [v(["x"])] },
      { title: "Ss. Nominis Iesu", name: "Nominis Iesu" }
    );
    expect(out).toEqual({
      lectio1: [v(["x"])],
      title: "Ss. Nominis Iesu",
      name: "Nominis Iesu",
    });
  });

  it("emits only the designation the source gave", () => {
    expect(transform({ lectio1: [v(["x"])] }, { title: "A Title" })).toEqual({
      lectio1: [v(["x"])],
      title: "A Title",
    });
    expect(transform({ lectio1: [v(["x"])] }, { name: "A Name" })).toEqual({
      lectio1: [v(["x"])],
      name: "A Name",
    });
    expect(transform({ lectio1: [v(["x"])] })).toEqual({ lectio1: [v(["x"])] });
  });

  it("pairs the officium and name of one rubric into a single file", () => {
    // St Adrian, kept twice over: the Roman use and the Cistercian, each with
    // its own officium and its own short name.
    const doc = {
      officium: [
        v(["S. Hadriani Martyris"]),
        v(["S. Adriani, Martyris"], ["cisterciensis"]),
      ],
      name: [v(["Hadriáni"]), v(["Adriáni"], ["cisterciensis"])],
    };
    expect(collectNames(doc, "09-08cc")).toEqual([
      {
        key: "hadriani-martyris",
        title: "S. Hadriani Martyris",
        name: "Hadriáni",
      },
      {
        key: "adriani-martyris",
        title: "S. Adriani, Martyris",
        name: "Adriáni",
      },
    ]);
  });

  it("lets the officium outrank the name for the filename", () => {
    const keys = getAllDisplayNames(
      {
        officium: [v(["S. Hadriani Martyris"])],
        name: [v(["Hadriáni"])],
      },
      "09-08cc"
    );
    expect(keys).toEqual(["hadriani-martyris"]);
  });

  it("lets the name file on its own where there is no officium", () => {
    expect(
      collectNames({ name: [v(["Hadriáni"])] }, "09-08cc")
    ).toEqual([{ key: "hadriani", title: null, name: "Hadriáni" }]);
  });

  it("still files under the rank, which often names the feast the officium generalises", () => {
    const names = collectNames(
      {
        officium: [v(["In Festis Beatae Mariae Virginis"])],
        rank: [v(["In Nativitate Beatæ Mariæ Virginis;;Duplex II classis;;5"])],
      },
      "09-08"
    );
    // Each file is titled by the designation it is filed under.
    expect(names).toEqual([
      {
        key: "in-festis-beatae-mariae-virginis",
        title: "In Festis Beatae Mariae Virginis",
        name: null,
      },
      {
        key: "in-nativitate-beatæ-mariæ-virginis",
        title: "In Nativitate Beatæ Mariæ Virginis",
        name: null,
      },
    ]);
  });

  it("titles a rank-only document by its rank", () => {
    expect(
      collectNames({ rank: [v(["In Circumcisione Domini;;6;;x"])] }, "01-01")
    ).toEqual([
      {
        key: "in-circumcisione-domini",
        title: "In Circumcisione Domini",
        name: null,
      },
    ]);
  });

  it("designates nothing when nothing is derivable", () => {
    expect(collectNames({ lectio1: [v(["x"])] }, "12-25")).toEqual([
      { key: "12-25", title: null, name: null },
    ]);
  });
});

describe("step7 name/filename (continued)", () => {
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
    expect(toKebabFileName("Joannis: Ante Portam")).toBe(
      "joannis-ante-portam"
    );
  });

  it("drops dots and commas rather than hyphenating them", () => {
    expect(toKebabFileName("Adriani, Martyris")).toBe("adriani-martyris");
    expect(toKebabFileName("Nominis Iesu")).toBe("nominis-iesu");
  });

  it("folds accents", () => {
    expect(toKebabFileName("Adriáni")).toBe("adriani");
    expect(toKebabFileName("Sanctæ Familiæ")).toBe("sanctæ-familiæ");
  });

  it("drops a leading honorific, singular or plural", () => {
    expect(toKebabFileName("S. Adriani, Martyris")).toBe("adriani-martyris");
    expect(toKebabFileName("B. Mariae Virginis")).toBe("mariae-virginis");
    expect(toKebabFileName("Ss. Fabiani et Sebastiani")).toBe(
      "fabiani-et-sebastiani"
    );
    expect(toKebabFileName("Bb. Martyrum Ugandensium")).toBe(
      "martyrum-ugandensium"
    );
  });

  it("keeps a word that merely starts with those letters", () => {
    expect(toKebabFileName("Sanctæ Familiæ")).toBe("sanctæ-familiæ");
    expect(toKebabFileName("Beatae Mariae Virginis")).toBe(
      "beatae-mariae-virginis"
    );
  });

  it("disambiguates same-name different-content by original stem", () => {
    const resolved = resolveCollisions([
      { targetBasename: "maria", originalStem: "01-01", relPath: "la/01-01.json", content: "a" },
      { targetBasename: "maria", originalStem: "02-02", relPath: "la/02-02.json", content: "b" },
    ]);
    expect(resolved.map((r) => r.finalBasename).sort()).toEqual([
      "maria-01-01",
      "maria-02-02",
    ]);
  });

  it("collapses same-name same-content into one file", () => {
    const resolved = resolveCollisions([
      { targetBasename: "maria", originalStem: "01-01", relPath: "la/01-01.json", content: "same" },
      { targetBasename: "maria", originalStem: "02-02", relPath: "la/02-02.json", content: "same" },
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.finalBasename).toBe("maria");
  });
});
