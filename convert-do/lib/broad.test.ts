import { describe, expect, it } from "vitest";
import {
  KEYED_RULES,
  LINE_RULES,
  createBroadResolver,
  createSourcedResolver,
  extractExVideReferences,
  importReferences,
  referencedPaths,
  type Doc,
} from "./broad";

/** A rubric variant; `condition` defaults to the unconditional one. */
const v = (value: unknown, condition: string[] = []) => ({ value, condition });

/** A loader over an in-memory tree, keyed by path below the language root. */
const loaderOf = (docs: Record<string, Doc>) => (path: string) => docs[path];

describe("extractExVideReferences", () => {
  it("collects @ preamble refs and ex/vide refs from rank", () => {
    const { ex, vide } = extractExVideReferences(
      {
        __preamble: [v(["@Sancti/12-26:Lectio1"])],
        rank: [
          v([";;Duplex;;3;;ex Commune/C1"]),
          v([";;Simplex;;1;;vide Sancti/12-26"], ["1570"]),
        ],
      },
      "Sancti/12-25"
    );
    expect(ex.map((r) => r.path).sort()).toEqual(["Commune/C1", "Sancti/12-26"]);
    expect(vide.map((r) => r.path)).toEqual(["Sancti/12-26"]);
    expect(vide[0]!.condition).toEqual(["1570"]);
  });

  it("treats a bare rank reference (no ex/vide keyword) as a vide commune pointer", () => {
    // `C5c` only gains the `Commune/` prefix: it is a file of its own.
    const { ex, vide } = extractExVideReferences(
      { rank: [v([";;Duplex;;3;;C5c"])] },
      "Sancti/Urbis/11-29"
    );
    expect(vide.map((r) => r.path)).toEqual(["Commune/C5c"]);
    expect(vide[0]!.condition).toEqual([]);
    expect(ex).toEqual([]);
  });

  it("reads ex/vide lines from the rule", () => {
    const { ex, vide } = extractExVideReferences(
      { rule: [v(["ex C4a", "vide C2", "9 lectiones"])] },
      "Sancti/01-01"
    );
    expect(ex.map((r) => r.path)).toEqual(["Commune/C4a"]);
    expect(vide.map((r) => r.path)).toEqual(["Commune/C2"]);
  });

  it("resolves a variant-directory reference as written, without folding it", () => {
    const { ex } = extractExVideReferences(
      { __preamble: [v(["@SanctiM/11-14M"])] },
      "SanctiOP/11-14M"
    );
    expect(ex.map((r) => r.path)).toEqual(["SanctiM/11-14M"]);
  });

  it("drops a reference to the file itself, but not to a same-named file elsewhere", () => {
    const { ex } = extractExVideReferences(
      { __preamble: [v(["@Sancti/11-14M"]), v(["@SanctiM/11-14M"])] },
      "Sancti/11-14M"
    );
    expect(ex.map((r) => r.path)).toEqual(["SanctiM/11-14M"]);
  });

  it("turns a Feria marker into a condition", () => {
    const { vide } = extractExVideReferences(
      { rank: [v([";;Feria;;1;;vide Tempora/Pasc1Feria"])] },
      "Tempora/Pasc1-2"
    );
    expect(vide).toEqual([{ path: "Tempora/Pasc1", condition: ["feria-2"] }]);
  });

  it("does not write the Feria condition back into the rank it was read from", () => {
    const rank = [v([";;Feria;;1;;vide Tempora/Pasc1Feria"])];
    extractExVideReferences({ rank }, "Tempora/Pasc1-2");
    extractExVideReferences({ rank }, "Tempora/Pasc1-2");
    expect(rank[0]!.condition).toEqual([]);
  });
});

describe("referencedPaths", () => {
  it("returns the set of referenced file paths", () => {
    expect([
      ...referencedPaths({ rank: [v([";;Duplex;;3;;ex Commune/C1"])] }, "Sancti/12-25"),
    ]).toEqual(["Commune/C1"]);
  });
});

describe("importReferences — include and borrow", () => {
  it("imports every section of an `ex` reference and keeps the preamble", () => {
    const out = importReferences(
      {
        __preamble: [v(["ignored"])],
        rank: [v([";;Duplex;;3;;ex Commune/C1"])],
      },
      "Sancti/12-25",
      loaderOf({ "Commune/C1": { lectio1: [v("in-illo-tempore-1a2b")] } }),
      KEYED_RULES
    );
    expect(out.lectio1).toEqual([v("in-illo-tempore-1a2b")]);
    expect(out.__preamble).toEqual([v(["ignored"])]);
  });

  it("copies whatever the borrowed section holds — a key as readily as lines", () => {
    const out = importReferences(
      { rank: [v([";;Simplex;;1.1;;vide Commune/C2a"])] },
      "Sancti/09-08cc",
      loaderOf({
        "Commune/C2a": {
          introitus: [v("statuit-ei-dominus-9f00")],
          "ant-laudes": [v(["Ecce sacérdos magnus", "Non est invéntus"])],
        },
      }),
      KEYED_RULES
    );
    expect(out.introitus).toEqual([v("statuit-ei-dominus-9f00")]);
    expect(out["ant-laudes"]).toEqual([v(["Ecce sacérdos magnus", "Non est invéntus"])]);
  });

  it("borrows the common's mass where the day resolves none of its own", () => {
    const out = importReferences(
      { rank: [v([";;Simplex;;1.1;;vide Commune/C2a"])] },
      "Sancti/09-08cc",
      loaderOf({
        "Commune/C2a": {
          oratio: [v("common-collect")],
          introitus: [v("common-introit")],
          secreta: [v("common-secret")],
        },
      }),
      KEYED_RULES
    );
    expect(out.oratio).toEqual([v("common-collect")]);
    expect(out.introitus).toEqual([v("common-introit")]);
    expect(out.secreta).toEqual([v("common-secret")]);
  });

  it("leaves a mass the day already resolved alone", () => {
    const out = importReferences(
      {
        rank: [v([";;Simplex;;1.1;;vide Commune/C2a"])],
        introitus: [v("its-own-introit")],
      },
      "Sancti/09-08cc",
      loaderOf({ "Commune/C2a": { introitus: [v("common-introit")] } }),
      KEYED_RULES
    );
    expect(out.introitus).toEqual([v("its-own-introit")]);
  });

  it("does not borrow the rest of the office", () => {
    const out = importReferences(
      { rank: [v([";;Simplex;;1.1;;vide Commune/C2a"])] },
      "Sancti/09-08cc",
      loaderOf({
        "Commune/C2a": {
          "hymnus-laudes": [v(["a hymn"])],
          responsory1: [v(["a responsory"])],
        },
      }),
      KEYED_RULES
    );
    expect(out["hymnus-laudes"]).toBeUndefined();
    expect(out.responsory1).toBeUndefined();
  });

  it("prepends the reference's condition to the borrowed variants", () => {
    const out = importReferences(
      { rank: [v([";;Simplex;;1;;vide Commune/C2"], ["1570"])] },
      "Sancti/01-01",
      loaderOf({ "Commune/C2": { oratio: [v("collect", ["monastica"])] } }),
      KEYED_RULES
    );
    expect(out.oratio).toEqual([v("collect", ["1570", "monastica"])]);
  });

  it("borrows the gradual's paschal form under its structured name", () => {
    // Before structuring the paschal Alleluia is `gradualep`; after, `alleluiap`.
    const common = { gradualep: [v(["lines"])], alleluiap: [v("alleluia-key")] };
    const day = { rank: [v([";;Simplex;;1.1;;vide Commune/C2a"])] };
    const load = loaderOf({ "Commune/C2a": common });

    expect(importReferences(day, "Sancti/x", load, LINE_RULES).gradualep).toEqual([
      v(["lines"]),
    ]);
    expect(importReferences(day, "Sancti/x", load, KEYED_RULES).alleluiap).toEqual([
      v("alleluia-key"),
    ]);
  });
});

describe("importReferences — the day's own text takes precedence", () => {
  it("does not let an include under a rubric override the day's own section", () => {
    // The Assumption gives its own Introit unconditionally, and its 1962 rank
    // line includes a common. Imported at `1962` the common would out-rank the
    // day's own whenever that rubric is in force.
    const out = importReferences(
      {
        rank: [v([";;Duplex I classis;;6.5;;ex Commune/C11"], ["1962"])],
        introitus: [v("signum-magnum")],
      },
      "Sancti/08-15",
      loaderOf({ "Commune/C11": { introitus: [v("salve-sancta-parens")] } }),
      KEYED_RULES
    );
    expect(out.introitus).toEqual([v("signum-magnum")]);
  });

  it("still imports a section the day does not give at all", () => {
    const out = importReferences(
      { rank: [v([";;Duplex;;3;;ex Commune/C11"], ["1962"])] },
      "Sancti/08-15",
      loaderOf({ "Commune/C11": { introitus: [v("from-the-common")] } }),
      KEYED_RULES
    );
    expect(out.introitus).toEqual([v("from-the-common", ["1962"])]);
  });

  it("still imports where the day covers only another rubric", () => {
    const out = importReferences(
      {
        rank: [v([";;Duplex;;3;;ex Commune/C11"])],
        introitus: [v("cistercian-only", ["cisterciensis"])],
      },
      "Sancti/08-15",
      loaderOf({ "Commune/C11": { introitus: [v("from-the-common")] } }),
      KEYED_RULES
    );
    expect(out.introitus).toEqual([
      v("cistercian-only", ["cisterciensis"]),
      v("from-the-common"),
    ]);
  });
});

describe("importReferences — a lifted section goes with the one it was lifted from", () => {
  const common = {
    graduale: [v("common-gradual")],
    alleluia: [v("common-alleluia")],
    rule: [v(["9 lectiones"])],
    prefatio: [v("apostolis")],
  };

  it("does not take the common's Alleluia where the day sings its own Gradual", () => {
    // A Lenten day's own Gradual carries a Tract and no Alleluia.
    const out = importReferences(
      {
        rank: [v([";;Simplex;;1.1;;vide Commune/C2a"])],
        graduale: [v("its-own-gradual")],
        tractus: [v("its-own-tract")],
      },
      "Sancti/x",
      loaderOf({ "Commune/C2a": common }),
      KEYED_RULES
    );
    expect(out.graduale).toEqual([v("its-own-gradual")]);
    expect(out.alleluia).toBeUndefined();
  });

  it("takes the Alleluia with the Gradual where the day has neither", () => {
    const out = importReferences(
      { rank: [v([";;Simplex;;1.1;;vide Commune/C2a"])] },
      "Sancti/x",
      loaderOf({ "Commune/C2a": common }),
      KEYED_RULES
    );
    expect(out.graduale).toEqual([v("common-gradual")]);
    expect(out.alleluia).toEqual([v("common-alleluia")]);
  });

  it("judges the Alleluia of an include by the day's Gradual, condition by condition", () => {
    const out = importReferences(
      {
        rank: [v([";;Duplex;;3;;ex Commune/C2a"])],
        graduale: [v("cistercian-gradual", ["cisterciensis"])],
      },
      "Sancti/x",
      loaderOf({ "Commune/C2a": common }),
      KEYED_RULES
    );
    // The day's own covers only `cisterciensis`; the unconditional case is a gap.
    expect(out.alleluia).toEqual([v("common-alleluia")]);
  });

  it("does not take the Preface of an include where the day's own rule stands", () => {
    const out = importReferences(
      {
        rank: [v([";;Duplex;;3;;ex Commune/C2a"])],
        rule: [v(["3 lectiones"])],
      },
      "Sancti/x",
      loaderOf({ "Commune/C2a": common }),
      KEYED_RULES
    );
    expect(out.rule).toEqual([v(["3 lectiones"])]);
    expect(out.prefatio).toBeUndefined();
  });

  it("takes the Preface with the rule where the day has no rule", () => {
    const out = importReferences(
      { rank: [v([";;Duplex;;3;;ex Commune/C2a"])] },
      "Sancti/x",
      loaderOf({ "Commune/C2a": common }),
      KEYED_RULES
    );
    expect(out.prefatio).toEqual([v("apostolis")]);
  });
});

describe("createBroadResolver", () => {
  it("borrows what the target itself borrowed", () => {
    const docs: Record<string, Doc> = {
      "Sancti/x": { rank: [v([";;Simplex;;1.1;;vide Commune/C1"])] },
      "Commune/C1": { rank: [v([";;;;;;ex Commune/C2"])] },
      "Commune/C2": { introitus: [v("from-c2")] },
    };
    const { resolve } = createBroadResolver(loaderOf(docs), KEYED_RULES);
    expect(resolve("Sancti/x")!.introitus).toEqual([v("from-c2")]);
  });

  it("removes the preamble once the references are resolved", () => {
    const docs: Record<string, Doc> = {
      "Sancti/x": { __preamble: [v(["@Commune/C1"])] },
      "Commune/C1": { oratio: [v("collect")] },
    };
    const out = createBroadResolver(loaderOf(docs), KEYED_RULES).resolve("Sancti/x")!;
    expect(out.__preamble).toBeUndefined();
    expect(out.oratio).toEqual([v("collect")]);
  });

  it("keeps a file whose reference the sources do not carry", () => {
    const docs: Record<string, Doc> = {
      "Sancti/x": {
        rank: [v([";;Simplex;;1.1;;vide Commune/C99"])],
        oratio: [v("own")],
      },
    };
    const out = createBroadResolver(loaderOf(docs), KEYED_RULES).resolve("Sancti/x");
    expect(out).toEqual({ rank: [v([";;Simplex;;1.1;;vide Commune/C99"])], oratio: [v("own")] });
  });

  it("returns nothing for a file the sources do not carry", () => {
    expect(createBroadResolver(loaderOf({}), KEYED_RULES).resolve("Sancti/x")).toBeUndefined();
  });

  it("resolves a cycle: the side reached second borrows nothing from the other", () => {
    const docs: Record<string, Doc> = {
      "Tempora/Pent01-6": {
        __preamble: [v(["@Tempora/Pent01-6r"])],
        oratio: [v("vigil-collect")],
      },
      "Tempora/Pent01-6r": {
        __preamble: [v(["@Tempora/Pent01-6"])],
        introitus: [v("vigil-introit")],
      },
    };
    const { resolve } = createBroadResolver(loaderOf(docs), KEYED_RULES);
    const first = resolve("Tempora/Pent01-6")!;
    const second = resolve("Tempora/Pent01-6r")!;

    expect(first.introitus).toEqual([v("vigil-introit")]);
    expect(second.oratio).toBeUndefined();
    expect(second.introitus).toEqual([v("vigil-introit")]);
  });

  it("loads and resolves each file once", () => {
    const docs: Record<string, Doc> = {
      "Sancti/a": { rank: [v([";;;;;;vide Commune/C1"])] },
      "Sancti/b": { rank: [v([";;;;;;vide Commune/C1"])] },
      "Commune/C1": { oratio: [v("collect")] },
    };
    const loads: string[] = [];
    const { resolve } = createBroadResolver((path) => {
      loads.push(path);
      return docs[path];
    }, KEYED_RULES);
    resolve("Sancti/a");
    resolve("Sancti/b");
    resolve("Sancti/a");
    expect(loads.sort()).toEqual(["Commune/C1", "Sancti/a", "Sancti/b"]);
  });
});

describe("createSourcedResolver — the Mass and the Office of a day", () => {
  const SOURCES = ["horas", "missa"] as const;
  const loaderOver =
    (docs: Record<string, Record<string, Doc>>) => (source: string, path: string) =>
      docs[source]?.[path];

  it("borrows a Mass proper where the Mass has none, whatever the Office holds", () => {
    // St Anthony of Padua: the Office carries a Dominican Matins Gospel, the
    // Mass none of its own; the Mass still takes the common's Gospel.
    const { resolve } = createSourcedResolver(
      loaderOver({
        missa: {
          "Sancti/06-13": { rank: [v([";;Duplex;;3;;vide C5"])] },
          "Commune/C5": { evangelium: [v("luc-12-35-40")] },
        },
        horas: {
          "Sancti/06-13": {
            rank: [v([";;Duplex;;3;;vide C5"])],
            evangelium: [v(["Secúndum Matthæum"], ["praedicatorum"])],
          },
        },
      }),
      SOURCES,
      KEYED_RULES
    );
    expect(resolve("missa", "Sancti/06-13")!.evangelium).toEqual([v("luc-12-35-40")]);
    expect(resolve("horas", "Sancti/06-13")!.evangelium).toEqual([
      v(["Secúndum Matthæum"], ["praedicatorum"]),
    ]);
  });

  it("reads a target as its Mass and Office together, the Mass winning a collision", () => {
    const { resolve, view } = createSourcedResolver(
      loaderOver({
        missa: {
          "Sancti/x": { rank: [v([";;;;;;ex C1"])] },
          "Commune/C1": { oratio: [v("mass-collect")] },
        },
        horas: {
          "Commune/C1": { oratio: [v("office-collect"), v("cistercian", ["cisterciensis"])] },
        },
      }),
      SOURCES,
      KEYED_RULES
    );
    expect(view("Commune/C1")!.oratio).toEqual(
      expect.arrayContaining([v("mass-collect"), v("cistercian", ["cisterciensis"])])
    );
    expect(resolve("missa", "Sancti/x")!.oratio).toHaveLength(2);
  });

  it("finds a target that only one of the two carries", () => {
    const { resolve } = createSourcedResolver(
      loaderOver({
        missa: { "Sancti/x": { rank: [v([";;;;;;vide C2a"])] } },
        horas: { "Commune/C2a": { "ant-laudes": [v(["Ecce sacérdos"])] } },
      }),
      SOURCES,
      KEYED_RULES
    );
    expect(resolve("missa", "Sancti/x")!["ant-laudes"]).toEqual([v(["Ecce sacérdos"])]);
  });

  it("borrows nothing from a target still being resolved, and does not keep that half view", () => {
    const docs = {
      missa: {
        "Tempora/a": { __preamble: [v(["@Tempora/b"])], oratio: [v("a-collect")] },
        "Tempora/b": { __preamble: [v(["@Tempora/a"])], introitus: [v("b-introit")] },
      },
    };
    const { resolve, view } = createSourcedResolver(loaderOver(docs), SOURCES, KEYED_RULES);
    expect(resolve("missa", "Tempora/a")!.introitus).toEqual([v("b-introit")]);
    expect(resolve("missa", "Tempora/b")!.oratio).toBeUndefined();
    // Once `a` is done, it can be read in full.
    expect(view("Tempora/a")!.oratio).toEqual([v("a-collect")]);
  });
});
