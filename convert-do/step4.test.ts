import { mkdtempSync, rmSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it } from "vitest";
import { parseReference, run, transform } from "./step4";
import type { Doc } from "./lib/broad";

/** A rubric variant; `condition` defaults to the unconditional one. */
const v = (value: unknown, condition: string[] = []) => ({ value, condition });

/** A lookup over an in-memory tree, keyed by path below the language root. */
const lookupOf = (docs: Record<string, Doc>) => (path: string) => docs[path];

describe("step4 a line marked to run on", () => {
  it("joins the line after it, but keeps a reference on its own line", () => {
    const docs = {
      "Sancti/08-22": {
        graduale: [v(["!Cant. 6:2", "V. Ego dilécto meo, qui páscitur inter lília."])],
        gradualep: [v(["@:Graduale:1-2 s/$/~/", "Allelúja."])],
      },
    };
    const out = transform(docs["Sancti/08-22"], "Sancti/08-22", lookupOf(docs));
    expect(out.gradualep).toEqual([
      v(["!Cant. 6:2", "V. Ego dilécto meo, qui páscitur inter lília. Allelúja."]),
    ]);
  });

  it("does not join a line that opens a part of its own", () => {
    const docs = {
      "Sancti/x": {
        graduale: [v(["!Ps 44:17", "Constítues eos príncipes.~", "V. Pro patribus tuis.", "$Per Dominum"])],
      },
    };
    expect(transform(docs["Sancti/x"], "Sancti/x", lookupOf(docs)).graduale).toEqual([
      v(["!Ps 44:17", "Constítues eos príncipes.", "V. Pro patribus tuis.", "$Per Dominum"]),
    ]);
  });

  it("drops the mark on a section's last line", () => {
    const docs = { "Commune/C11": { oratio: [v(["Deus, qui"])] } };
    const out = transform(
      { oratio: [v(["@Commune/C11:Oratio:s/$/~/"])] },
      "Commune/C12",
      lookupOf(docs)
    );
    expect(out.oratio).toEqual([v(["Deus, qui"])]);
  });
});

/**
 * The texts below are Divinum Officium's own, as step 3 hands them over; each
 * is a case whose resolving once left a mark of the source in the published
 * Office.
 */
describe("step4 a substitution is made on the text as a whole", () => {
  const sunday = [
    "Ego sum qui sum, * et consílium meum non est cum ímpiis, sed in lege Dómini volúntas mea est, allelúja.;;1",
    "Postulávi Patrem meum, * allelúja: dedit mihi gentes, allelúja, in hereditátem, allelúja.;;2",
    "Ego dormívi, * et somnum cepi: et exsurréxi, quóniam Dóminus suscépit me, allelúja, allelúja.;;3",
    "V. Surréxit Dóminus de sepúlcro, allelúja.",
    "R. Qui pro nobis pepéndit in ligno, allelúja.",
  ];

  it("takes the first versicle and all that follows it away, across lines", () => {
    const docs = {
      "Tempora/Pasc0-0": { "ant-matutinum": [v(sunday)] },
      "Tempora/Pasc0-3": {
        "ant-matutinum": [
          v([
            "@Tempora/Pasc0-0::s/^V\\..*//sm",
            "V. Gavísi sunt discípuli, allelúja.",
            "R. Viso Dómino, allelúja.",
          ]),
        ],
      },
    };
    const out = transform(docs["Tempora/Pasc0-3"], "Tempora/Pasc0-3", lookupOf(docs));
    expect(out["ant-matutinum"]).toEqual([
      v([
        ...sunday.slice(0, 3),
        "V. Gavísi sunt discípuli, allelúja.",
        "R. Viso Dómino, allelúja.",
      ]),
    ]);
  });

  it("reads \\n in a replacement as a line break", () => {
    const docs = {
      "Tempora/Pasc7-0": {
        "ant-matutinum": [v([...sunday.slice(0, 3), "V. Dixit Dóminus.", "R. Et factum est."])],
      },
      "Tempora/Pasc7-3": {
        "ant-matutinum": [
          v([
            "@Tempora/Pasc7-0::s/V\\. .*/V. Repléti sunt omnes Spíritu Sancto, allelúja.\\nR. Et cœpérunt loqui, allelúja./s",
          ]),
        ],
      },
    };
    const out = transform(docs["Tempora/Pasc7-3"], "Tempora/Pasc7-3", lookupOf(docs));
    expect(out["ant-matutinum"]).toEqual([
      v([
        ...sunday.slice(0, 3),
        "V. Repléti sunt omnes Spíritu Sancto, allelúja.",
        "R. Et cœpérunt loqui, allelúja.",
      ]),
    ]);
  });

  it("makes a substitution without g once, so that a run of them numbers the psalms in turn", () => {
    const docs = {
      "Sancti/08-01": {
        "ant-vespera": [
          v([
            "Heródes rex * appósuit ut apprehénderet et Petrum.",
            "Petrus quidem * servabátur in cárcere.",
            "Dixit Angelus * ad Petrum: Circúmda tibi vestiméntum tuum.",
            "Misit Dóminus * Angelum suum, et liberávit me.",
            "Tu es Petrus, * et super hanc petram ædificábo Ecclésiam meam.;;116",
          ]),
        ],
        "ant-vespera-3": [
          v(["@:Ant Vespera:s/$/_/gm s/_/;;109/s s/_/;;112/ s/_/;;115/ s/_/;;125/ s/116/138/"]),
        ],
      },
    };
    const out = transform(docs["Sancti/08-01"], "Sancti/08-01", lookupOf(docs));
    expect(out["ant-vespera-3"]).toEqual([
      v([
        "Heródes rex * appósuit ut apprehénderet et Petrum.;;109",
        "Petrus quidem * servabátur in cárcere.;;112",
        "Dixit Angelus * ad Petrum: Circúmda tibi vestiméntum tuum.;;115",
        "Misit Dóminus * Angelum suum, et liberávit me.;;125",
        // Divinum Officium leaves the mark of the fifth antiphon, which no
        // substitution takes; the structuring drops it.
        "Tu es Petrus, * et super hanc petram ædificábo Ecclésiam meam.;;138_",
      ]),
    ]);
  });

  it("keeps an escape in a pattern, so that an escaped dot is a dot", () => {
    const docs = {
      "Commune/C1": {
        "ant-vespera": [v(["Salve, crux pretiósa, * súscipe discípulum ejus.", "Beátus Andréas * orábat, dicens: Dómine."])],
      },
      "Sancti/11-30": {
        "ant-vespera-3": [v(["@Commune/C1:Ant Vespera:s/\\.$/.;;109/m s/\\.$/.;;112/m"])],
      },
    };
    const out = transform(docs["Sancti/11-30"], "Sancti/11-30", lookupOf(docs));
    expect(out["ant-vespera-3"]).toEqual([
      v([
        "Salve, crux pretiósa, * súscipe discípulum ejus.;;109",
        "Beátus Andréas * orábat, dicens: Dómine.;;112",
      ]),
    ]);
  });
});

describe("step4 what a reference takes may hold references of its own", () => {
  it("resolves them once the substitution is made", () => {
    // The hymn of the Rosary at Matins is that of its Vespers up to the
    // doxology the Vespers would add, which is taken from the Psalterium.
    const docs = {
      "Sancti/10-07": {
        "hymnus-matutinum": [
          v(["@Sancti/10-07:Hymnus Vespera:s/\\@Psalterium.*//s", "@Sancti/10-07:Hymnus Matutinum_:s/^v. //"]),
        ],
        "hymnus-vespera": [v(["v. Cæléstis aulæ Núntius,", "Arcána pandens Núminis,", "_", "@Psalterium/Doxologies:Nat"])],
        "hymnus-matutinum_": [v(["v. In monte olívis cónsito", "Redémptor orans prócidit,", "_", "@Psalterium/Doxologies:Nat"])],
      },
      "Psalterium/Doxologies": {
        nat: [v(["Jesu, tibi sit glória,", "Qui natus es de Vírgine,", "Cum Patr[e] et almo Spíritu,", "In sempitérna sǽcula.", "Amen."])],
      },
    };
    const out = transform(docs["Sancti/10-07"], "Sancti/10-07", lookupOf(docs));
    expect(out["hymnus-matutinum"]).toEqual([
      v([
        "v. Cæléstis aulæ Núntius,",
        "Arcána pandens Núminis,",
        "_",
        "In monte olívis cónsito",
        "Redémptor orans prócidit,",
        "_",
        "Jesu, tibi sit glória,",
        "Qui natus es de Vírgine,",
        "Cum Patr[e] et almo Spíritu,",
        "In sempitérna sǽcula.",
        "Amen.",
      ]),
    ]);
  });

  it("resolves a collect added in commemoration, which names the other day's own", () => {
    const docs = {
      "Sancti/06-30": {
        oratio: [v(["Deus, qui multitúdinem géntium.", "$Per Dominum.", "_", "$Oremus", "!Pro S. Petro", "@Sancti/02-22:Oratio Petri"])],
      },
      "Sancti/02-22": {
        "oratio-petri": [v(["Deus, qui beáto Petro Apóstolo tuo, collátis clávibus regni cæléstis."])],
      },
    };
    const out = transform(docs["Sancti/06-30"], "Sancti/06-30", lookupOf(docs));
    expect(out.oratio).toEqual([
      v([
        "Deus, qui multitúdinem géntium.",
        "$Per Dominum.",
        "_",
        "$Oremus",
        "!Pro S. Petro",
        "Deus, qui beáto Petro Apóstolo tuo, collátis clávibus regni cæléstis.",
      ]),
    ]);
  });
});

describe("step4 parseReference", () => {
  it("reads file, section, line range and substitutions", () => {
    expect(parseReference("@Commune/C1:Lectio3:2-4:s/N\\./Petri/")).toEqual({
      filePath: "Commune/C1",
      section: "lectio3",
      lineRange: { start: 2, end: 4 },
      substitutions: [{ pattern: "N\\.", replacement: "Petri", flags: "" }],
    });
  });

  it("keeps a substitution whole when its text holds a colon", () => {
    expect(parseReference("@Commune/C4:Lectio1:s/.*5 /!1 Tim 3:5-9/")).toEqual({
      filePath: "Commune/C4",
      section: "lectio1",
      lineRange: null,
      substitutions: [{ pattern: ".*5 ", replacement: "!1 Tim 3:5-9", flags: "" }],
    });
  });

  it("reads a line range with no section named", () => {
    expect(parseReference("@Tempora/Pasc2-3::1-4")).toMatchObject({
      filePath: "Tempora/Pasc2-3",
      section: "",
      lineRange: { start: 1, end: 4 },
    });
  });

  it("reads a substitution set off by a space", () => {
    expect(parseReference("@Commune/C7a:: s/N\./N. Vírginis tuæ/")).toEqual({
      filePath: "Commune/C7a",
      section: "",
      lineRange: null,
      substitutions: [{ pattern: "N.", replacement: "N. Vírginis tuæ", flags: "" }],
    });
  });

  it("reads a line range whose substitution follows after a space", () => {
    expect(parseReference("@Commune/C7:Ant Vespera:1 s/;;.*//g")).toEqual({
      filePath: "Commune/C7",
      section: "ant-vespera",
      lineRange: { start: 1, end: 1 },
      substitutions: [{ pattern: ";;.*", replacement: "", flags: "g" }],
    });
  });

  it("reads such a line range with no section named", () => {
    expect(parseReference("@Commune/C7::3 s/121/126/")).toEqual({
      filePath: "Commune/C7",
      section: "",
      lineRange: { start: 3, end: 3 },
      substitutions: [{ pattern: "121", replacement: "126", flags: "" }],
    });
  });

  it("is not a reference unless the line begins with @", () => {
    expect(parseReference("Deus, qui")).toBeNull();
  });
});

describe("step4 transform", () => {
  it("replaces a reference line with the lines of the section it names", () => {
    const out = transform(
      { lectio1: [v(["@Commune/C1:Lectio1"])] },
      "Sancti/12-25",
      lookupOf({ "Commune/C1": { lectio1: [v(["borrowed lectio"])] } })
    );
    expect(out.lectio1).toEqual([v(["borrowed lectio"])]);
  });

  it("resolves an omitted file (@:Section) against the current file", () => {
    const out = transform(
      { intro: [v(["@:Oratio"])] },
      "Sancti/12-25",
      lookupOf({ "Sancti/12-25": { oratio: [v(["self oratio"])] } })
    );
    expect(out.intro).toEqual([v(["self oratio"])]);
  });

  it("takes an omitted section to be the one holding the reference", () => {
    const out = transform(
      { oratio: [v(["@Commune/C2"])] },
      "Sancti/01-01",
      lookupOf({ "Commune/C2": { oratio: [v(["the common's collect"])], introitus: [v(["no"])] } })
    );
    expect(out.oratio).toEqual([v(["the common's collect"])]);
  });

  it("assembles a section from several references and lines of its own", () => {
    // SS. Peter and Paul: two collects joined by `Oremus`.
    const out = transform(
      { oratio: [v(["@:Oratio Pauli", "$Oremus", "@:Oratio Petri"])] },
      "Sancti/01-25",
      lookupOf({
        "Sancti/01-25": {
          "oratio-pauli": [v(["Deus, qui univérsum mundum…", "$Per Dominum"])],
          "oratio-petri": [v(["Deus, qui beáto Petro…", "$Per Dominum"])],
        },
      })
    );
    expect(out.oratio).toEqual([
      v([
        "Deus, qui univérsum mundum…",
        "$Per Dominum",
        "$Oremus",
        "Deus, qui beáto Petro…",
        "$Per Dominum",
      ]),
    ]);
  });

  it("applies a line range and substitutions to the pulled lines", () => {
    const out = transform(
      { lectio4: [v(["@Commune/C1:Lectio3:2-3:s/N\\./Petri/g"])] },
      "Sancti/x",
      lookupOf({ "Commune/C1": { lectio3: [v(["!Ezech 1:10", "10 N. vidit", "11 N. audivit", "12 rest"])] } })
    );
    expect(out.lectio4).toEqual([v(["10 Petri vidit", "11 Petri audivit"])]);
  });

  it("chooses the target variant by the referencing variant's condition", () => {
    const lookup = lookupOf({
      "Commune/C1": { oratio: [v(["default"]), v(["tridentine"], ["1570"])] },
    });
    const out = transform(
      { oratio: [v(["@Commune/C1"]), v(["@Commune/C1"], ["1570"]), v(["@Commune/C1"], ["monastica"])] },
      "Sancti/x",
      lookup
    );
    expect(out.oratio).toEqual([
      v(["default"]),
      v(["tridentine"], ["1570"]),
      v(["default"], ["monastica"]),
    ]);
  });

  it("leaves a reference it cannot resolve in place", () => {
    const lookup = lookupOf({ "Commune/C1": { oratio: [v(["x"])] } });
    expect(
      transform({ oratio: [v(["@Commune/C99:Oratio"])] }, "Sancti/x", lookup).oratio
    ).toEqual([v(["@Commune/C99:Oratio"])]);
    expect(
      transform({ oratio: [v(["@Commune/C1:Secreta"])] }, "Sancti/x", lookup).oratio
    ).toEqual([v(["@Commune/C1:Secreta"])]);
  });

  it("removes a reference to an empty section", () => {
    const out = transform(
      { oratio: [v(["a", "@Commune/C1:Oratio", "b"])] },
      "Sancti/x",
      lookupOf({ "Commune/C1": { oratio: [v([])] } })
    );
    expect(out.oratio).toEqual([v(["a", "b"])]);
  });

  it("resolves a pulled reference that omits its file against the file it was found in", () => {
    const out = transform(
      { lectio1: [v(["@Commune/C1:Lectio1"])] },
      "Sancti/x",
      lookupOf({
        "Commune/C1": {
          lectio1: [v(["@:Lectio2"])],
          lectio2: [v(["the common's second lesson"])],
        },
        "Sancti/x": { lectio2: [v(["the day's second lesson"])] },
      })
    );
    expect(out.lectio1).toEqual([v(["the common's second lesson"])]);
  });

  it("stops a chain of references at the depth limit", () => {
    const out = transform(
      { oratio: [v(["@:Oratio"])] },
      "Sancti/x",
      lookupOf({ "Sancti/x": { oratio: [v(["@:Oratio"])] } })
    );
    expect(out.oratio).toEqual([v(["@:Oratio"])]);
  });

  it("leaves a rank that is a reference for step 7", () => {
    const out = transform(
      { rank: [v(["@Tempora/Pasc0-1"])] },
      "TemporaOP/Pasc0-1",
      lookupOf({ "Tempora/Pasc0-1": { rank: [v([";;Duplex I classis;;7;;ex Pasc0-0"])] } })
    );
    expect(out.rank).toEqual([v(["@Tempora/Pasc0-1"])]);
  });

  it("leaves the preamble's whole-file includes for step 7", () => {
    const out = transform(
      { __preamble: [v(["@Commune/C1"])], oratio: [v(["own"])] },
      "Sancti/x",
      lookupOf({ "Commune/C1": { __preamble: [v(["other"])] } })
    );
    expect(out.__preamble).toEqual([v(["@Commune/C1"])]);
  });
});

describe("step4 a reference brings its target's rubric variants with it", () => {
  // 13 January in the Martyrology: the octave is a commemoration of the
  // Baptism under the 1960 rubrics.
  const day = {
    octava: [
      v(["Octava Epiphaniæ Domini."]),
      v(["Commemoratio Baptismatis Domini."], ["1962"]),
    ],
    hilarii: [v(["Pictavis sancti Hilarii."])],
  };

  const resolve = (martyrologium: { value: unknown; condition: string[] }[]) =>
    transform(
      { martyrologium },
      "Martyrologium/01-13",
      lookupOf({ "Martyrologium/01-13": { ...day, martyrologium } })
    ).martyrologium;

  it("writes the borrowing variant once more for the target's rubric", () => {
    expect(resolve([v(["@:Octava", "@:Hilarii"])])).toEqual([
      v(["Octava Epiphaniæ Domini.", "Pictavis sancti Hilarii."]),
      v(["Commemoratio Baptismatis Domini.", "Pictavis sancti Hilarii."], ["1962"]),
    ]);
  });

  it("leaves a rubric to the borrowing section's own variant for it", () => {
    expect(resolve([v(["@:Octava", "@:Hilarii"]), v(["@:Octava"], ["1962"])])).toEqual([
      v(["Octava Epiphaniæ Domini.", "Pictavis sancti Hilarii."]),
      v(["Commemoratio Baptismatis Domini."], ["1962"]),
    ]);
  });

  it("resolves under the most specific target condition it includes", () => {
    expect(resolve([v(["@:Octava"], ["1962", "monastica"])])).toEqual([
      v(["Commemoratio Baptismatis Domini."], ["1962", "monastica"]),
    ]);
  });

  it("writes no copies outside the Martyrology", () => {
    expect(
      transform(
        { oratio: [v(["@Commune/C1:Oratio"])] },
        "Sancti/x",
        lookupOf({ "Commune/C1": { oratio: [v(["a"]), v(["b"], ["1962"])] } })
      ).oratio
    ).toEqual([v(["a"])]);
  });
});

describe("step4 run", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  async function put(dir: string, rel: string, doc: Doc) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, `${rel}.json`), JSON.stringify(doc), "utf-8");
  }

  it("finds a section the target only borrows from its common", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step4-"));
    const input = join(root, "step3");
    const output = join(root, "step4");
    await put(input, "la/missa/Commune/C8", { evangelium: [v(["!Matt 5:1-12", "In illo témpore…"])] });
    await put(input, "la/missa/Sancti/11-09", {
      rank: [v([";;Duplex;;3;;vide C8"])],
    });
    await put(input, "la/missa/Sancti/11-10", {
      evangelium: [v(["@Sancti/11-09:Evangelium"])],
    });

    await run(input, output);

    const out = JSON.parse(await readFile(join(output, "la/missa/Sancti/11-10.json"), "utf-8"));
    expect(out.evangelium).toEqual([v(["!Matt 5:1-12", "In illo témpore…"])]);
    // The borrowing day itself is not resolved here: that is step 7's.
    const own = JSON.parse(await readFile(join(output, "la/missa/Sancti/11-09.json"), "utf-8"));
    expect(own.evangelium).toBeUndefined();
  });

  it("looks a translation's target up with the Latin rank", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step4-nl-"));
    const input = join(root, "step3");
    const output = join(root, "step4");
    await put(input, "la/missa/Sancti/11-09", { rank: [v([";;Duplex;;3;;vide C8"])] });
    await put(input, "nl/missa/Commune/C8", { evangelium: [v(["In die tijd…"])] });
    await put(input, "nl/missa/Sancti/11-09", {});
    await put(input, "nl/missa/Sancti/11-10", { evangelium: [v(["@Sancti/11-09:Evangelium"])] });

    await run(input, output);

    const out = JSON.parse(await readFile(join(output, "nl/missa/Sancti/11-10.json"), "utf-8"));
    expect(out.evangelium).toEqual([v(["In die tijd…"])]);
  });
});
