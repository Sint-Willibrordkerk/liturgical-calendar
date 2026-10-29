import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import generateCalendar, { type Language } from "./index";
import { buildOfficium } from "./officium";

describe("the Office in the calendar", () => {
  const latin: Language = {
    code: "la",
    assets: {
      masspropers: {
        oratio: {
          "omnipotens-1": { text: "Omnípotens sempitérne Deus", closure: "Per Dominum" },
        },
        antiphona: {
          "ecce-quod-1": { text: "Ecce, quod concupívi, * jam vídeo." },
        },
      },
    },
  };

  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = {
      "calendar1962.yml": parse(readFileSync(join("assets", "calendar1962.yml"), "utf-8")),
      "mass-propers/Sancti/agnetis-virginis-et-martyris.yml": {
        title: "S. Agnetis Virginis et Martyris",
        oratio: "omnipotens-1",
        "ant-2": "ecce-quod-1",
      },
    };
  });

  it("is read only when asked for", () => {
    const calendar = generateCalendar({ year: 2026, languages: [latin] });
    expect(calendar[1]![21]!.officium).toBeUndefined();
    expect(calendar[1]![21]!.mass).toBeDefined();
  });

  it("gives a day the Office of its celebration", () => {
    const calendar = generateCalendar({ year: 2026, languages: [latin], officium: true });
    expect(calendar[1]![21]!.officium).toEqual({
      laudes: { benedictus: { text: "Ecce, quod concupívi, * jam vídeo." } },
      oratio: { text: "Omnípotens sempitérne Deus", closure: "Per Dominum" },
    });
  });

  it("leaves a day whose file the calendar does not find without one", () => {
    const calendar = generateCalendar({ year: 2026, languages: [latin], officium: true });
    expect(calendar[8]![15]!.officium).toBeUndefined();
  });
});

/**
 * Each value below is one the sources left in a state the types do not allow —
 * a directive of Divinum Officium unresolved, a text left as its lines, a
 * rubric's empty section. The Office says nothing of them.
 */
describe("a text of the Office that does not have its shape", () => {
  const laudes = (proper: Record<string, unknown>) => buildOfficium(proper)?.laudes;

  it("is left out, and the Hour is said from the psalter", () => {
    const proper = {
      "capitulum-laudes": ["@:Lectio Prima", "$Deo gratias"],
      "ant-2": { text: "Ecce, quod concupívi, * jam vídeo." },
    };
    expect(laudes(proper)).toEqual({ benedictus: { text: "Ecce, quod concupívi, * jam vídeo." } });
  });

  it("is not published when nothing else of the Office is", () => {
    expect(buildOfficium({ "ant-laudes": ["@:Ant Laudes;;109;110"], oratio: { text: "Deus, qui" } })).toBeUndefined();
  });

  it.each([
    ["an unresolved reference where psalmody stands", "ant-laudes", ["@:Ant Laudes;;109;110;111;112;116"]],
    ["psalmody left as its lines", "ant-matutinum", ["Ego sum qui sum, * et consílium meum.;;1", "", "R. Qui pro nobis."]],
    ["psalm numbers joined by the source", "ant-laudes", { antiphonae: [{ text: "Salve, crux * pretiósa.", psalmus: "10.;;11.;;11.;;12.;;138" }] }],
    ["a psalm number with the source's mark", "ant-laudes", { antiphonae: [{ text: "Salve, crux * pretiósa.", psalmus: "138_" }] }],
    ["an antiphon left empty", "ant-2", { text: "" }],
    ["a hymn left as its lines", "hymnus-laudes", ["v. Cæléstis aulæ Núntius,", "@Psalterium/Doxologies:Nat"]],
    ["a hymn with an unresolved doxology", "hymnus-laudes", { strophae: [["Jesu, coróna Vírginum,"], ["@Psalterium/Doxologies:Nat"]] }],
    ["a chapter that is a reference", "capitulum-laudes", { text: "@:Lectio Prima" }],
    ["a versicle left as lines", "versum-2", ["V. Spécie tua.", "R. Inténde."]],
    ["a versicle of no words", "versum-2", { versus: "", responsum: "Inténde." }],
  ])("%s", (_, key, value) => {
    expect(
      buildOfficium({ [key]: value, "ant-2": { text: "Ecce, quod concupívi, * jam vídeo." } })?.laudes
    ).toEqual({ benedictus: { text: "Ecce, quod concupívi, * jam vídeo." } });
  });

  it("lets an antiphon stand where the versicle is said at Easter", () => {
    expect(laudes({ "versum-2": { text: "Hæc dies * quam fecit Dóminus." } })).toEqual({
      versus: { text: "Hæc dies * quam fecit Dóminus." },
    });
  });

  it("says second Vespers from the first where the day's own are unusable", () => {
    // The Baptism's second Vespers come from another rite's reference.
    const officium = buildOfficium({
      "ant-vespera": { antiphonae: [{ text: "Ante lucíferum génitus, * et ante sǽcula." }] },
      "ant-vespera-3": ["@:Ant Laudes;;109;110;111;112;116"],
    });
    expect(officium!.vesperae!.psalmodia).toEqual({
      antiphonae: [{ text: "Ante lucíferum génitus, * et ante sǽcula." }],
    });
  });

  it("leaves out a lesson a rubric leaves out, and its responsory with it", () => {
    const officium = buildOfficium({
      lectio1: { ref: "Tob 12:1-4", verses: ["Vocávit ad se Tobías fílium suum."] },
      lectio3: [],
      responsory3: [],
      lectio4: { ref: "De Sanctis Angelis", text: "Ráphaël interpretátur medicina Dei." },
    });
    expect(officium!.matutinum!.nocturni!.map((n) => n.lectiones.map((l) => l.numerus))).toEqual([[1], [4]]);
  });

  it("is dropped from a lesson that names a Gospel it expounds, if the Gospel is none", () => {
    expect(
      buildOfficium({
        lectio7: { ref: "Hom. 36", text: "Quis hic curatiónis modus?", evangelium: ["Léctio sancti Evangélii", "!Joannes 5:1-4"] },
      })
    ).toBeUndefined();
  });

  it("is cut from a collect that asks for another's, whose reference the Mass resolves", () => {
    const officium = buildOfficium({
      "ant-2": { text: "Ecce, quod concupívi, * jam vídeo." },
      oratio: {
        text: "Deus, qui multitúdinem géntium.\n!Pro S. Petro\n@Sancti/02-22:Oratio Petri",
        closure: "Per Dominum.",
      },
    });
    expect(officium!.oratio).toEqual({ text: "Deus, qui multitúdinem géntium.", closure: "Per Dominum." });
  });

  it("is none for a collect of no words", () => {
    const officium = buildOfficium({
      "ant-2": { text: "Ecce, quod concupívi, * jam vídeo." },
      oratio: { text: "", closure: "" },
    });
    expect(officium!.oratio).toBeUndefined();
  });
});

describe("the Office of a commemoration", () => {
  const latin: Language = {
    code: "la",
    assets: {
      masspropers: {
        oratio: {
          "omnipotens-1": { text: "Omnípotens sempitérne Deus", closure: "Per Dominum" },
        },
        antiphona: {
          "ecce-quod-1": { text: "Ecce, quod concupívi, * jam vídeo." },
        },
      },
    },
  };

  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = {
      "calendar1962.yml": parse(readFileSync(join("assets", "calendar1962.yml"), "utf-8")),
      "mass-propers/Sancti/telesphori-papae-et-martyris.yml": {
        title: "S. Telesphori Papæ et Martyris",
        oratio: "omnipotens-1",
        "ant-2": "ecce-quod-1",
      },
    };
  });

  it("is none: the day keeps the Office of the celebration, and the commemoration is a collect", () => {
    const calendar = generateCalendar({ year: 2026, languages: [latin], officium: true });
    const commemorations = Object.values(calendar).flatMap((days) =>
      Object.values(days ?? {}).flatMap((day) => day?.commemorations ?? [])
    );
    const telesphorus = commemorations.find((entry) => entry.title === "S. Telesphori Papæ et Martyris");
    expect(telesphorus).toBeDefined();
    expect(telesphorus!.mass).toBeDefined();
    expect(telesphorus!.officium).toBeUndefined();
  });
});
