import { describe, expect, it } from "vitest";
import {
  hasMassContent,
  keepMassSections,
  usedReadingKeys,
  storeSubset,
  keepPublishedRubric,
  compactSections,
  sortSections,
  isPublishedTree,
} from "./step11";
import { isOtherRubricSystem } from "./lib/rubrics";

const v = <T>(value: T, condition: string[] = []) => ({ value, condition });

describe("step11 — kept sections", () => {
  it("keeps the mass sections and drops the office", () => {
    expect(
      keepMassSections({
        introitus: [v({ antiphon: "a" })],
        oratio: [v({ text: "b", closure: "c" })],
        lectio: [v("rom-1-1")],
        lectio1: [v("isa-1-1")],
        "lectio7-in-2-loco": [v("matt-5-1")],
        "ant-vespera": [v(["x"])],
        "hymnus-matutinum": [v(["y"])],
      })
    ).toEqual({
      introitus: [v({ antiphon: "a" })],
      oratio: [v({ text: "b", closure: "c" })],
      lectio: [v("rom-1-1")],
    });
  });

  it("keeps name and prefatio alongside", () => {
    const obj = {
      name: [v("Sanctæ Familiæ")],
      prefatio: [v("trinitate")],
      communio: [v("x")],
    };
    expect(keepMassSections(obj)).toEqual(obj);
  });

  it("drops rule, which describes the office and has served its purpose", () => {
    expect(
      keepMassSections({ rule: [v(["12 lectiones"])], communio: [v("x")] })
    ).toEqual({ communio: [v("x")] });
  });
});

describe("step11 — which trees are published", () => {
  it("publishes the day trees", () => {
    expect(isPublishedTree("la/Sancti/agnetis.json")).toBe(true);
    expect(isPublishedTree("la/Tempora/dominica-ii.json")).toBe(true);
  });

  it("publishes the kept local calendar, in some places", () => {
    expect(isPublishedTree("la/Sancti/aliquibus locis/pauli.json")).toBe(true);
  });

  it("does not publish a regional local calendar", () => {
    expect(isPublishedTree("la/Sancti/Urbis/martinae.json")).toBe(false);
    expect(isPublishedTree("la/Sancti/Bavaria/Monacensis/x.json")).toBe(false);
    expect(isPublishedTree("la/Tempora/Brasilia/x.json")).toBe(false);
  });

  it("does not publish the commons, which are a base rather than a day", () => {
    expect(isPublishedTree("la/Commune/C1.json")).toBe(false);
  });

  it("does not publish the office trees", () => {
    expect(isPublishedTree("la/Ordo/Prayers.json")).toBe(false);
    expect(isPublishedTree("la/Psalterium/Comment.json")).toBe(false);
    expect(isPublishedTree("la/Martyrologium/01-01.json")).toBe(false);
  });

  it("reads the tree through the separator either way round", () => {
    expect(isPublishedTree("la\\Sancti\\agnetis.json")).toBe(true);
    expect(isPublishedTree("la\\Commune\\C1.json")).toBe(false);
  });
});

describe("step11 — which documents are written", () => {
  it("counts a document with a mass section as having content", () => {
    expect(hasMassContent({ introitus: [v({ antiphon: "a" })] })).toBe(true);
    expect(hasMassContent({ evangelium: [v("matt-5-1")] })).toBe(true);
  });

  it("does not count name or prefatio on their own", () => {
    expect(
      hasMassContent({
        name: [v("Feria quarta")],
        prefatio: [v("trinitate")],
      })
    ).toBe(false);
  });

  it("does not count an office-only document", () => {
    expect(hasMassContent({ lectio1: [v("isa-1-1")], "ant-laudes": [v(["x"])] })).toBe(
      false
    );
  });

  it("does not count an empty document", () => {
    expect(hasMassContent({})).toBe(false);
  });
});

describe("step11 — rubric systems not published", () => {
  it("knows the editions, orders and local usages", () => {
    for (const token of ["1570", "1888", "monastica", "cisterciensis", "praedicatorum", "divino"]) {
      expect(isOtherRubricSystem(token, "1962")).toBe(true);
    }
    expect(isOtherRubricSystem("dioecesis Monacensis", "1962")).toBe(true);
    expect(isOtherRubricSystem("civitate Monacensis", "1962")).toBe(true);
  });

  it("does not treat the system in force as another", () => {
    expect(isOtherRubricSystem("1962", "1962")).toBe(false);
  });

  it("leaves alone the tokens saying when a text applies", () => {
    for (const token of [
      "octava",
      "commemoratio",
      "adventus",
      "paschali",
      "quadragesimae",
      "feria-2",
      "feria-7",
      "defunctorum",
      "septem-dolorum",
      "transfer",
      "special-b",
    ]) {
      expect(isOtherRubricSystem(token, "1962")).toBe(false);
    }
  });

  it("ignores how a token was capitalised", () => {
    expect(isOtherRubricSystem("Monastica", "1962")).toBe(true);
    expect(isOtherRubricSystem("Cisterciensis", "1962")).toBe(true);
    expect(isOtherRubricSystem("Summorum", "1962")).toBe(true);
  });

  it("drops variants requiring another system and keeps the rest", () => {
    expect(
      keepPublishedRubric(
        {
          oratio: [
            v("default"),
            v("proper", ["1962"]),
            v("monastic", ["monastica"]),
            v("during the octave", ["octava"]),
            v("old", ["1570"]),
          ],
        },
        "1962"
      )
    ).toEqual({
      oratio: [v("default"), v("proper", ["1962"]), v("during the octave", ["octava"])],
    });
  });

  it("drops a variant needing another system alongside a kept token", () => {
    expect(
      keepPublishedRubric(
        { oratio: [v("a"), v("b", ["octava", "monastica"])] },
        "1962"
      )
    ).toEqual({ oratio: [v("a")] });
  });

  it("drops a section left with no variants", () => {
    expect(
      keepPublishedRubric(
        { oratio: [v("keep")], tractus: [v("x", ["monastica"])] },
        "1962"
      )
    ).toEqual({ oratio: [v("keep")] });
  });

  it("leaves a section that is not a variant list alone", () => {
    expect(keepPublishedRubric({ prefatio: "trinitate" }, "1962")).toEqual({
      prefatio: "trinitate",
    });
  });
});

describe("step11 — compaction", () => {
  it("omits an empty condition", () => {
    expect(compactSections({ graduale: [v("ps-44-2"), v("ps-88-21", ["octava"])] })).toEqual({
      graduale: [{ value: "ps-44-2" }, { value: "ps-88-21", condition: ["octava"] }],
    });
  });

  it("unwraps a section holding only the default variant", () => {
    expect(compactSections({ oratio: [v("concede-nos-4b1e")] })).toEqual({
      oratio: "concede-nos-4b1e",
    });
  });

  it("unwraps an object value as readily as a string", () => {
    const inline = { ref: "Eccli 44:1", text: "Beátus vir" };
    expect(compactSections({ lectio: [v(inline)] })).toEqual({ lectio: inline });
  });

  it("keeps the wrapper when the only value is an array", () => {
    // A bare array would read as a variant list; the wrapper keeps it honest.
    const lines = ["!Eccli 44:1", "Beátus vir…", "!Eccli 45:2", "Diléctus…"];
    expect(compactSections({ lectio: [v(lines)] })).toEqual({
      lectio: [{ value: lines }],
    });
  });

  it("keeps the wrapper when the section genuinely varies", () => {
    expect(
      compactSections({ oratio: [v("a"), v("b", ["octava"])] })
    ).toEqual({ oratio: [{ value: "a" }, { value: "b", condition: ["octava"] }] });
  });

  it("keeps the wrapper when the only variant carries a condition", () => {
    expect(compactSections({ tractus: [v("x", ["octava"])] })).toEqual({
      tractus: [{ value: "x", condition: ["octava"] }],
    });
  });

  it("leaves a section that is not a variant list alone", () => {
    expect(compactSections({ prefatio: "trinitate" })).toEqual({
      prefatio: "trinitate",
    });
  });
});

describe("step11 — section order", () => {
  it("writes the sections in the order of the mass", () => {
    expect(
      Object.keys(
        sortSections({
          postcommunio: "d",
          introitus: "b",
          name: "a",
          communio: "c",
          oratio: "x",
          evangelium: "y",
        })
      )
    ).toEqual([
      "name",
      "introitus",
      "oratio",
      "evangelium",
      "communio",
      "postcommunio",
    ]);
  });

  it("orders every section it knows", () => {
    const shuffled = {
      "ultima-evangelium": 1, prefatio: 1, tractus: 1, secreta: 1,
      alleluiap: 1, offertorium: 1, graduale: 1, lectio: 1, alleluia: 1,
      postcommunio: 1, communio: 1, evangelium: 1, oratio: 1,
      introitus: 1, name: 1,
    };
    expect(Object.keys(sortSections(shuffled))).toEqual([
      "name", "introitus", "oratio", "lectio", "graduale", "alleluia",
      "alleluiap", "tractus", "evangelium", "offertorium", "secreta",
      "prefatio", "communio", "postcommunio", "ultima-evangelium",
    ]);
  });

  it("keeps an unknown section, after the rest and alphabetically", () => {
    expect(
      Object.keys(sortSections({ zeta: 1, communio: 1, alpha: 1, name: 1 }))
    ).toEqual(["name", "communio", "alpha", "zeta"]);
  });

  it("changes nothing but the order", () => {
    const obj = { communio: "c", name: "a" };
    expect(sortSections(obj)).toEqual(obj);
  });
});

describe("step11 — the store subset", () => {
  it("collects the keys the kept readings hold", () => {
    expect(
      usedReadingKeys({
        lectio: [v("rom-1-1"), v("rom-1-2", ["1570"])],
        evangelium: [v("matt-5-1")],
        "ultima-evangelium": [v("joann-1-1")],
      })
    ).toEqual(new Set(["rom-1-1", "rom-1-2", "matt-5-1", "joann-1-1"]));
  });

  it("ignores a reading left inline, which is content rather than a key", () => {
    expect(
      usedReadingKeys({ lectio: [v({ ref: "Rom 1:1", verses: ["Paulus"] })] })
    ).toEqual(new Set());
  });

  it("ignores keys held by sections that are not readings", () => {
    expect(usedReadingKeys({ prefatio: [v("trinitate")] })).toEqual(new Set());
  });

  it("carries over only the entries named", () => {
    const store = {
      "rom-1-1": { ref: "Rom 1:1", verses: ["Paulus"] },
      "matt-5-1": { ref: "Matt 5:1", verses: ["In illo témpore"] },
      "isa-1-1": { ref: "Isa 1:1", verses: ["Vísio"] },
    };
    expect(storeSubset(store, new Set(["rom-1-1", "matt-5-1"]))).toEqual({
      "rom-1-1": { ref: "Rom 1:1", verses: ["Paulus"] },
      "matt-5-1": { ref: "Matt 5:1", verses: ["In illo témpore"] },
    });
  });

  it("skips a key the store does not hold rather than emitting a hole", () => {
    expect(storeSubset({ "rom-1-1": { text: "x" } }, new Set(["nope"]))).toEqual({});
  });
});
