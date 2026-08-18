import { describe, expect, it } from "vitest";
import {
  transform,
  getAllDisplayNames,
  toKebabFileName,
  resolveCollisions,
  collectNames,
  preferCurrentEdition,
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
        current: true,
      },
      {
        key: "adriani-martyris",
        title: "S. Adriani, Martyris",
        name: "Adriáni",
        current: true,
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
    ).toEqual([
      { key: "hadriani", title: null, name: "Hadriáni", current: true },
    ]);
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
        current: true,
      },
      {
        key: "in-nativitate-beatæ-mariæ-virginis",
        title: "In Nativitate Beatæ Mariæ Virginis",
        name: null,
        current: true,
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
        current: true,
      },
    ]);
  });

  it("marks a name held only by a superseded edition", () => {
    // On an octave day only the old 1888 books still called it the feast.
    const octaveDay = {
      officium: [
        v(["Ss. Proti et Hyacinthi Martyrum"]),
        v(["In Festis Beatae Mariae Virginis"], ["1888"]),
      ],
      rank: [
        v(["In Nativitate Beatæ Mariæ Virginis;;x"], ["1962", "1888"]),
      ],
    };
    const byKey = new Map(
      collectNames(octaveDay, "09-11").map((n) => [n.key, n.current])
    );
    expect(byKey.get("proti-et-hyacinthi-martyrum")).toBe(true);
    expect(byKey.get("in-nativitate-beatæ-mariæ-virginis")).toBe(false);
    expect(byKey.get("in-festis-beatae-mariae-virginis")).toBe(false);
  });

  it("counts a use as current, since it runs in parallel", () => {
    const names = collectNames(
      {
        officium: [
          v(["S. Hadriani Martyris"], ["commemoratio"]),
          v(["S. Adriani, Martyris"], ["cisterciensis", "commemoratio"]),
        ],
      },
      "09-08cc"
    );
    expect(names.map((n) => n.key)).toEqual([
      "hadriani-martyris",
      "adriani-martyris",
    ]);
    expect(names.every((n) => n.current)).toBe(true);
  });

  it("designates nothing when nothing is derivable", () => {
    expect(collectNames({ lectio1: [v(["x"])] }, "12-25")).toEqual([
      { key: "12-25", title: null, name: null, current: true },
    ]);
  });
});

describe("step7 name/filename (continued)", () => {
  it("collects distinct kebab display names across name variants", () => {
    // Both under the published edition — a use, and unconditional — so both file.
    const names = getAllDisplayNames(
      {
        name: [
          v(["Sanctae Mariae"]),
          v(["Beatae Mariae Virginis"], ["cisterciensis"]),
        ],
      },
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
      { targetBasename: "maria", originalStem: "01-01", relPath: "la/01-01.json", content: "a", current: true },
      { targetBasename: "maria", originalStem: "02-02", relPath: "la/02-02.json", content: "b", current: true },
    ]);
    expect(resolved.map((r) => r.finalBasename).sort()).toEqual([
      "maria-01-01",
      "maria-02-02",
    ]);
  });

  it("collapses same-name same-content into one file", () => {
    const resolved = resolveCollisions([
      { targetBasename: "maria", originalStem: "01-01", relPath: "la/01-01.json", content: "same", current: true },
      { targetBasename: "maria", originalStem: "02-02", relPath: "la/02-02.json", content: "same", current: true },
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.finalBasename).toBe("maria");
  });
});

describe("step7 preferCurrentEdition", () => {
  const e = (
    targetBasename: string,
    originalStem: string,
    current: boolean
  ) => ({
    targetBasename,
    originalStem,
    relPath: `la/${originalStem}.json`,
    content: originalStem,
    current,
  });

  it("keeps only the current claim where a name is contested", () => {
    // The feast holds the name; its octave days held it only in the old books.
    const kept = preferCurrentEdition([
      e("in-nativitate-bmv", "09-08", true),
      e("in-nativitate-bmv", "09-09", false),
      e("in-nativitate-bmv", "09-11", false),
    ]);
    expect(kept.map((k) => k.originalStem)).toEqual(["09-08"]);
  });

  it("leaves a name no current designation claims", () => {
    // St Emerentiana is named only by the old books; the published calendar
    // keeps her as a commemoration, and this is all she can be found by.
    const kept = preferCurrentEdition([e("emerentianæ", "01-23", false)]);
    expect(kept.map((k) => k.originalStem)).toEqual(["01-23"]);
  });

  it("keeps every claim when they are all current", () => {
    const kept = preferCurrentEdition([
      e("maria", "01-01", true),
      e("maria", "02-02", true),
    ]);
    expect(kept).toHaveLength(2);
  });

  it("judges each name on its own", () => {
    const kept = preferCurrentEdition([
      e("a", "01-01", true),
      e("a", "01-02", false),
      e("b", "02-01", false),
    ]);
    expect(kept.map((k) => k.originalStem).sort()).toEqual(["01-01", "02-01"]);
  });
});
