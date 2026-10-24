import { describe, expect, it } from "vitest";
import {
  hasPropers,
  keepPropers,
  usedReadingKeys,
  storeSubset,
  keepPublishedRubric,
  compactSections,
  sortSections,
  isPublishedTree,
  keepSeason,
  seasonalPublications,
  martyrologyDate,
  martyrologyDay,
  martyrologyMobile,
  martyrologyConclusion,
  fileInline,
  fileName,
  renderingsOf,
  chooseRenderings,
} from "./step12";
import { isOtherRubricSystem } from "./lib/rubrics";

const v = <T>(value: T, condition: string[] = []) => ({ value, condition });

describe("step12 — kept sections", () => {
  it("keeps the sections of the Mass and of the Office", () => {
    const propers = {
      introitus: [v({ antiphon: "a" })],
      oratio: [v({ text: "b", closure: "c" })],
      lectio: [v("rom-1-1")],
      lectio1: [v("isa-1-1")],
      lectio94: [v("ex-libro-1")],
      "ant-vespera": [v("haec-est-virgo")],
      "hymnus-matutinum": [v("jesu-corona")],
      "responsory-breve-nona": [v("gloria-et-honore")],
      "nocturn-3-versum": [v("diffusa-est")],
    };
    expect(keepPropers(propers)).toEqual(propers);
  });

  it("drops the lessons of other rubrics, the uses' sections and the small Hours' antiphons", () => {
    expect(
      keepPropers({
        "lectio7-in-2-loco": [v("matt-5-1")],
        lectio93: [v("sermo-2")],
        "hymnusm-laudes": [v(["y"])],
        "mm-capitulum": [v(["z"])],
        "ant-tertia": [v(["x"])],
        "versum-0": [v(["V. Ora pro nobis."])],
        communio: [v("x")],
      })
    ).toEqual({ communio: [v("x")] });
  });

  it("keeps name and prefatio alongside", () => {
    const obj = {
      name: [v("Sanctæ Familiæ")],
      prefatio: [v("trinitate")],
      communio: [v("x")],
    };
    expect(keepPropers(obj)).toEqual(obj);
  });

  it("drops rule, which describes the office and has served its purpose", () => {
    expect(
      keepPropers({ rule: [v(["12 lectiones"])], communio: [v("x")] })
    ).toEqual({ communio: [v("x")] });
  });
});

describe("step12 — which trees are published", () => {
  it("publishes the day trees", () => {
    expect(isPublishedTree("la/Sancti/agnetis.json")).toBe(true);
    expect(isPublishedTree("la/Tempora/dominica-ii.json")).toBe(true);
  });

  it("publishes the kept local calendar, in some places", () => {
    expect(isPublishedTree("la/Sancti/aliquibus locis/pauli.json")).toBe(true);
  });

  it("publishes the local calendars the Utrecht proper reads", () => {
    expect(isPublishedTree("la/Sancti/Neerlandia/gertrudis-virginis.json")).toBe(true);
    expect(
      isPublishedTree("la/Sancti/Neerlandia/Ultrajectum/lebuini-confessoris.json")
    ).toBe(true);
  });

  it("keeps a local calendar by its whole path, not the calendars nested in it", () => {
    expect(isPublishedTree("la/Sancti/Neerlandia/Groningen/liduinae-virginis.json")).toBe(
      false
    );
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

describe("step12 — which documents are written", () => {
  it("counts a document with a mass section as having content", () => {
    expect(hasPropers({ introitus: [v({ antiphon: "a" })] })).toBe(true);
    expect(hasPropers({ evangelium: [v("matt-5-1")] })).toBe(true);
  });

  it("does not count name or prefatio on their own", () => {
    expect(
      hasPropers({
        name: [v("Feria quarta")],
        prefatio: [v("trinitate")],
      })
    ).toBe(false);
  });

  it("counts a document with only the Office as having content", () => {
    expect(hasPropers({ lectio1: [v("isa-1-1")], "ant-laudes": [v("x")] })).toBe(true);
  });

  it("does not count an empty document", () => {
    expect(hasPropers({})).toBe(false);
  });
});

describe("step12 — rubric systems not published", () => {
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

describe("step12 — compaction", () => {
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

describe("step12 — section order", () => {
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

  it("writes the Office after the Mass, in the order of the Hours", () => {
    const shuffled = {
      "ant-3": 1, "versum-3": 1, "ant-vespera": 1, "versum-nona": 1,
      "capitulum-sexta": 1, "lectio-prima": 1, "ant-2": 1, "capitulum-laudes": 1,
      responsory1: 1, lectio1: 1, "nocturn-1-versum": 1, "ant-matutinum": 1,
      invit: 1, "versum-1": 1, "ant-1": 1, communio: 1,
    };
    expect(Object.keys(sortSections(shuffled))).toEqual([
      "communio", "ant-1", "versum-1", "invit", "ant-matutinum",
      "nocturn-1-versum", "lectio1", "responsory1", "capitulum-laudes", "ant-2",
      "lectio-prima", "capitulum-sexta", "versum-nona", "ant-vespera",
      "versum-3", "ant-3",
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

describe("step12 — the store subset", () => {
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

describe("step12 — every text is a key", () => {
  const empty = () => ({
    lectio: {}, oratio: {}, antiphona: {},
    hymnus: {}, capitulum: {}, responsorium: {}, versus: {},
  });

  it("files a value left inline that carries words", () => {
    const passio = ["Pássio Dómini nostri Jesu Christi.", "!Matt 26:1-75; 27:1-66.", "In illo témpore"];
    const stores = empty();
    const out = fileInline({ evangelium: [v(passio)] }, stores);
    const key = (out.evangelium as { value: string }[])[0]!.value;
    expect(key).toMatch(/^passio-domini-nostri-jesu-[0-9a-f]{8}$/);
    expect(stores.lectio).toEqual({ [key]: passio });
  });

  it("files a chant whose words all stand in its verse", () => {
    const chant = {
      antiphon: { ref: "Ps 131:16-17", text: "" },
      verse: { ref: "", text: "Sacerdótes ejus índuam salutári" },
    };
    const stores = empty();
    const out = fileInline({ graduale: [v(chant)] }, stores);
    const key = (out.graduale as { value: string }[])[0]!.value;
    expect(key).toMatch(/^sacerdotes-ejus-induam-salutari-[0-9a-f]{8}$/);
    expect(stores.antiphona).toEqual({ [key]: chant });
  });

  it("files a text of the Office left as lines into the store its section draws on", () => {
    const lines = ["R. Sancta Dei Génetrix,", "V. Intercéde pro nobis."];
    const stores = empty();
    const out = fileInline({ responsory2: [v(lines)] }, stores);
    const key = (out.responsory2 as { value: string }[])[0]!.value;
    expect(key).toMatch(/^r-sancta-dei-genetrix-[0-9a-f]{8}$/);
    expect(stores.responsorium).toEqual({ [key]: lines });
  });

  it("leaves a value that carries no words as it is", () => {
    const stores = empty();
    const doc = {
      oratio: [v({ text: "", closure: "" })],
      secreta: [v({ text: "@Commune/Propaganda:Secreta", closure: "" })],
    };
    expect(fileInline(doc, stores)).toEqual(doc);
    expect(stores).toEqual(empty());
  });

  it("files the same value once, under one key", () => {
    const stores = empty();
    const lines = ["Pássio Dómini nostri Jesu Christi."];
    const a = fileInline({ evangelium: [v(lines)] }, stores);
    const b = fileInline({ evangelium: [v([...lines])] }, stores);
    expect(b).toEqual(a);
    expect(Object.keys(stores.lectio)).toHaveLength(1);
  });

  it("leaves a key alone, and a section that draws on no store", () => {
    const stores = empty();
    const doc = { lectio: [v("rom-1-1")], prefatio: [v("trinitate")], title: "S. X" };
    expect(fileInline(doc, stores)).toEqual(doc);
  });

  it("files the name, keyed in the form of a reference", () => {
    const names = {};
    expect(fileName({ title: "S. Adriani, Martyris", name: "Adriáni" }, names)).toEqual({
      title: "S. Adriani, Martyris",
      name: "adriani",
    });
    expect(names).toEqual({ adriani: "Adriáni" });
  });

  it("gives a name filed again the key it was given", () => {
    const names = {};
    fileName({ name: "Adriáni" }, names);
    expect(fileName({ name: "Adriáni" }, names)).toEqual({ name: "adriani" });
    expect(names).toEqual({ adriani: "Adriáni" });
  });

  it("never gives a key twice, when two names fold alike", () => {
    const names = {};
    fileName({ name: "Adriáni" }, names);
    expect(fileName({ name: "Adriani" }, names)).toEqual({ name: "adriani-2" });
    expect(names).toEqual({ adriani: "Adriáni", "adriani-2": "Adriani" });
  });

  it("leaves a day without a name alone", () => {
    expect(fileName({ title: "Dominica I Adventus" }, {})).toEqual({
      title: "Dominica I Adventus",
    });
  });
});

describe("step12 — a translation's renderings", () => {
  const stores = {
    lectio: { "sap-10-10-14": { ref: "Sap 10:10-14", verses: ["De rechtvaardige"] } },
    oratio: {
      "wil-ons-heer-1": { text: "Wil ons, Heer", closure: "Door onze Heer" },
      "god-die-ons-2": { text: "God, die ons", closure: "Door onze Heer" },
    },
    antiphona: {},
  };

  it("renders the Office's texts as it renders the Mass's", () => {
    const hymn = { strophae: [["Jezus, kroon der maagden,"]] };
    expect(
      renderingsOf(
        { "hymnus-laudes": [v("jesu-corona-virginum-1a2b3c4d")] },
        { "hymnus-laudes": [v("jezus-kroon-der-maagden-5e6f")] },
        { ...stores, hymnus: { "jezus-kroon-der-maagden-5e6f": hymn } }
      )
    ).toEqual([{ store: "hymnus", key: "jesu-corona-virginum-1a2b3c4d", rendering: hymn }]);
  });

  it("pairs each base key with what the translation says in its place", () => {
    expect(
      renderingsOf(
        { lectio: [v("sap-10-10-14")], oratio: [v("deus-qui-a"), v("fac-nos-b", ["octava"])] },
        { lectio: [v("sap-10-10-14")], oratio: [v("wil-ons-heer-1"), v("god-die-ons-2", ["octava"])] },
        stores
      )
    ).toEqual([
      { store: "lectio", key: "sap-10-10-14", rendering: stores.lectio["sap-10-10-14"] },
      { store: "oratio", key: "deus-qui-a", rendering: stores.oratio["wil-ons-heer-1"] },
      { store: "oratio", key: "fac-nos-b", rendering: stores.oratio["god-die-ons-2"] },
    ]);
  });

  it("renders nothing where the translation lacks the variant the base language has", () => {
    expect(
      renderingsOf(
        { oratio: [v("adjuvet-a"), v("sumptis-b", ["octava"])] },
        { oratio: [v("wil-ons-heer-1")] },
        stores
      ).map(({ key, rendering }) => [key, rendering])
    ).toEqual([["adjuvet-a", stores.oratio["wil-ons-heer-1"]]]);
  });

  it("matches a condition however its tokens are ordered", () => {
    expect(
      renderingsOf(
        { oratio: [v("fac-nos-b", ["octava", "1962"])] },
        { oratio: [v("god-die-ons-2", ["1962", "octava"])] },
        stores
      ).map(({ key }) => key)
    ).toEqual(["fac-nos-b"]);
  });

  it("pairs the default with the default, not with the variant for the rubric in force", () => {
    expect(
      renderingsOf(
        { lectio: [v("phil-2-5-11"), v("sap-3-1-8", ["1962"])] },
        { lectio: [v("sap-10-10-14"), v("other", ["1962"])] },
        stores
      ).map(({ key, rendering }) => [key, rendering])
    ).toEqual([["phil-2-5-11", stores.lectio["sap-10-10-14"]]]);
  });

  it("renders nothing where the translation lacks the section or the key", () => {
    expect(
      renderingsOf(
        { lectio: [v("sap-10-10-14")], oratio: [v("deus-qui-a")] },
        { oratio: [v("not-in-the-store")] },
        stores
      )
    ).toEqual([]);
  });

  it("renders a value the translation left inline as itself, if it carries words", () => {
    const passie = ["Het lijden van onze Heer"];
    expect(
      renderingsOf(
        { evangelium: [v("passio-domini-1")], secreta: [v("suscipe-2")] },
        { evangelium: [v(passie)], secreta: [v({ text: "", closure: "" })] },
        stores
      )
    ).toEqual([{ store: "lectio", key: "passio-domini-1", rendering: passie }]);
  });

  it("renders the name from the translation's name of the same day", () => {
    expect(renderingsOf({ name: "adriani" }, { name: "Hadrianus" }, stores)).toEqual([
      { store: "nomen", key: "adriani", rendering: "Hadrianus" },
    ]);
  });

  it("keeps the rendering found on most days", () => {
    const a = { text: "Wil ons, Heer" };
    const b = { text: "Heer, wil ons" };
    expect(
      chooseRenderings([
        { store: "oratio", key: "k", rendering: b },
        { store: "oratio", key: "k", rendering: a },
        { store: "oratio", key: "k", rendering: { ...a } },
      ])
    ).toEqual({ oratio: { k: a } });
  });

  it("keeps the one met first between renderings found as often", () => {
    const a = { text: "Wil ons, Heer" };
    const b = { text: "Heer, wil ons" };
    expect(
      chooseRenderings([
        { store: "oratio", key: "k", rendering: b },
        { store: "oratio", key: "k", rendering: a },
      ])
    ).toEqual({ oratio: { k: b } });
  });

  it("orders each store by key", () => {
    const chosen = chooseRenderings([
      { store: "nomen", key: "b", rendering: "B" },
      { store: "nomen", key: "a", rendering: "A" },
    ]);
    expect(Object.keys(chosen.nomen!)).toEqual(["a", "b"]);
  });
});

describe("keepSeason", () => {
  const v = (value: string, ...condition: string[]) => ({ value, condition });

  it("keeps the variant naming the season, and only it", () => {
    const out = keepSeason(
      { introitus: [v("rorate", "special-a"), v("vultum", "special-b"), v("salve")] },
      "special-a"
    );
    expect(out.introitus).toEqual([{ value: "rorate", condition: [] }]);
  });

  it("falls back to what the day says when no season claims it", () => {
    const out = keepSeason(
      { communio: [v("ecce", "special-a"), v("beata")] },
      "special-c"
    );
    expect(out.communio).toEqual([{ value: "beata", condition: [] }]);
  });

  it("takes the unseasoned variants for the season named by none", () => {
    const out = keepSeason(
      { introitus: [v("rorate", "special-a"), v("salve")] },
      undefined
    );
    expect(out.introitus).toEqual([{ value: "salve", condition: [] }]);
  });

  it("drops a section that only another season has", () => {
    const out = keepSeason({ alleluiap: [v("num-17-8", "paschali")] }, "special-b");
    expect(out.alleluiap).toBeUndefined();
  });

  it("leaves the tokens that say something other than the season", () => {
    const out = keepSeason(
      { graduale: [v("a", "special-a", "feria-7"), v("b")] },
      "special-a"
    );
    expect(out.graduale).toEqual([{ value: "a", condition: ["feria-7"] }]);
  });

  it("leaves what is not a variant list alone", () => {
    expect(keepSeason({ title: "Sanctæ Mariæ Sabbato" }, "paschali")).toEqual({
      title: "Sanctæ Mariæ Sabbato",
    });
  });
});

describe("seasonalPublications", () => {
  it("writes a day per season, under Sancti", () => {
    const out = seasonalPublications("la/Commune/sanctae-mariae-sabbato.json");
    expect(out).toHaveLength(5);
    expect(out.map((p) => p.outRelPath)).toEqual([
      "la/Sancti/maria-in-sabbato-in-tempore-adventus.json",
      "la/Sancti/maria-in-sabbato-a-nativitate-domini-usque-ad-purificationem.json",
      "la/Sancti/maria-in-sabbato-a-die-3-februari-usque-ad-feriam-iv-hebdomadae-sanctae.json",
      "la/Sancti/maria-in-sabbato-in-tempore-paschali.json",
      "la/Sancti/maria-in-sabbato-a-festo-trinitatis-usque-ad-sabbatum-ante-dominicam-i-adventus.json",
    ]);
    // Trinity to Advent is the Mass no season marks.
    expect(out[4]!.season).toBeUndefined();
    expect(out[0]!.season).toBe("special-a");
  });

  it("has nothing to say about an ordinary document", () => {
    expect(seasonalPublications("la/Sancti/01-01.json")).toEqual([]);
    // The same name under another tree is a day in its own right.
    expect(seasonalPublications("la/Sancti/sanctae-mariae-sabbato.json")).toEqual(
      []
    );
    expect(seasonalPublications("la/Commune/C10.json")).toEqual([]);
  });
});

describe("isPublishedTree, for a day that changes with the season", () => {
  it("does not publish the source document as it stands", () => {
    expect(isPublishedTree("la/Commune/sanctae-mariae-sabbato.json")).toBe(false);
  });
});

describe("the Martyrology", () => {
  it("knows a date of it from the rest of the tree", () => {
    expect(martyrologyDate("la/Martyrologium/01-21.json")).toBe("01-21");
    expect(martyrologyDate("la\\Martyrologium\\02-29.json")).toBe("02-29");
    expect(martyrologyDate("la/Martyrologium/Mobile.json")).toBeUndefined();
    expect(martyrologyDate("la/Sancti/01-21.json")).toBeUndefined();
  });

  describe("a date", () => {
    it("takes the wording for the rubric in force, or the default", () => {
      expect(
        martyrologyDay({
          titulus: [v(["Idibus Januárii"])],
          martyrologium: [
            v(["", "Octáva Epiphániæ Dómini.", "", "Pictávis sancti Hilárii."]),
            v(["", "Commemorátio Baptismátis Dómini.", "", "Pictávis sancti Hilárii."], ["1962"]),
            v(["", "Octava Epiphaniae Domini."], ["1570"]),
          ],
        })
      ).toEqual({
        titulus: "Idibus Januárii",
        elogia: ["Commemorátio Baptismátis Dómini.", "Pictávis sancti Hilárii."],
      });
    });

    it("ignores a variant that assumes another rubric besides", () => {
      expect(
        martyrologyDay({
          titulus: [v(["Kaléndis Januárii"])],
          martyrologium: [v(["a"]), v(["b"], ["1570", "1962"])],
        }).elogia
      ).toEqual(["a"]);
    });

    it("leaves out an entry the language has no words for", () => {
      expect(
        martyrologyDay({
          titulus: [v(["Quarto Nonas Januárii"])],
          martyrologium: [v(["@:Adalardi-Corbeiensis", "", "Octáva sancti Stéphani."])],
        }).elogia
      ).toEqual(["Octáva sancti Stéphani."]);
    });

    it("leaves out the directions to the reader", () => {
      expect(
        martyrologyDay({
          titulus: [v(["Octávo Kaléndas Januárii"])],
          martyrologium: [
            v([
              "Jesus Christus … decúrsis ménsibus /:Hic vox elevatur, et omnes genua flectunt:/, in Béthlehem Judæ náscitur. /:Hic autem in priori voce dicitur::/ Natívitas Dómini nostri Jesu Christi secúndum carnem.",
              "/:Quod sequitur, legitur in tono Lectionis consueto; et surgunt omnes.:/",
              "Eódem die natális sanctæ Anastásiæ.",
            ]),
          ],
        }).elogia
      ).toEqual([
        "Jesus Christus … decúrsis ménsibus, in Béthlehem Judæ náscitur. Natívitas Dómini nostri Jesu Christi secúndum carnem.",
        "Eódem die natális sanctæ Anastásiæ.",
      ]);
    });

    it("keeps its title when it has no entries", () => {
      expect(
        martyrologyDay({
          titulus: [v(["Sexto Kaléndas Mártii"])],
          martyrologium: [v(["", "@:Antoniae"])],
        })
      ).toEqual({ titulus: "Sexto Kaléndas Mártii" });
    });
  });

  describe("the movable days", () => {
    it("maps each day to its announcement under the rubric in force", () => {
      expect(
        martyrologyMobile({
          "quad6-0": [
            v(["Domínica Palmárum."]),
            v(["Domínica secúnda Passiónis, seu in palmis."], ["1962"]),
          ],
          "pasc5-3": [
            v(["Vigília Ascensiónis Dómini nostri Jesu Christi.", "Romæ Litaníæ minóres ad sanctum Petrum."]),
          ],
        })
      ).toEqual({
        "quad6-0": ["Domínica secúnda Passiónis, seu in palmis."],
        "pasc5-3": [
          "Vigília Ascensiónis Dómini nostri Jesu Christi.",
          "Romæ Litaníæ minóres ad sanctum Petrum.",
        ],
      });
    });

    it("leaves out an announcement the rubric in force empties", () => {
      expect(
        martyrologyMobile({
          "pasc2-3": [v(["Solémnitas sancti Joseph."]), v([], ["1962"])],
        })
      ).toEqual({});
    });

    it("leaves out what is keyed to no date", () => {
      expect(
        martyrologyMobile({
          defuncti: [v(["Hac die Commemorátio ómnium Fidélium Defunctórum."])],
          defunctim: [v(["…"])],
          nativity: [v(["Anno a creatióne mundi …"])],
          "10-du": [v(["Festum Dómini nostri Jesu Christi Regis."])],
        })
      ).toEqual({ "10-du": ["Festum Dómini nostri Jesu Christi Regis."] });
    });
  });

  describe("the conclusion", () => {
    it("is the versicle and the response its macro names", () => {
      expect(
        martyrologyConclusion({
          conclmart: [
            v(["V. Et álibi aliórum plurimórum sanctórum Mártyrum.", "$Deo gratias"]),
          ],
          "deo-gratias": [v(["R. Deo grátias."])],
        })
      ).toEqual({
        versus: "Et álibi aliórum plurimórum sanctórum Mártyrum.",
        responsum: "Deo grátias.",
      });
    });

    it("is absent where the prayers do not carry it", () => {
      expect(martyrologyConclusion({})).toBeUndefined();
    });
  });
});
