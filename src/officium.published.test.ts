import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { languageAssets } from "../scripts/language-assets.mjs";
import generateCalendar, { type Language, type LiturgicalDay } from "./index";

/**
 * The Office as the pipeline publishes it, from Divinum Officium's own texts.
 *
 * The other tests hold small texts of their own; this one reads what
 * `pnpm pipeline && pnpm copy-mass-propers` writes, and asks of every day of
 * several years that the Office say what its types say and carry no mark of the
 * sources. It is skipped where those files have not been generated, as they are
 * published to npm rather than committed.
 */
const GENERATED = [
  "assets/mass-propers/Sancti",
  "languages/la/assets/mass-propers/la",
  "languages/nl/assets/mass-propers/nl",
];
const generated = GENERATED.every((path) => existsSync(path));

/** Every YAML under `dir`, by the path below it. */
function readAssets(dir: string, base = ""): Record<string, unknown> {
  const assets: Record<string, unknown> = {};
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    const rel = base ? `${base}/${item}` : item;
    if (statSync(full).isDirectory()) Object.assign(assets, readAssets(full, rel));
    else if (/\.ya?ml$/.test(item)) assets[rel] = parse(readFileSync(full, "utf-8"));
  }
  return assets;
}

const words = (value: unknown): boolean =>
  typeof value === "string" && value.trim() !== "" && !/^\s*[@!$&#~]/m.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** What is wrong with a text of the Office, by the type it should have. */
const SHAPES: Record<string, (value: unknown) => boolean> = {
  antiphona: (v) => record(v) && words(v.text),
  versus: (v) => record(v) && ((words(v.versus) && words(v.responsum)) || words(v.text)),
  capitulum: (v) => record(v) && words(v.text),
  responsorium: (v) =>
    record(v) && words(v.responsum) && words(v.versus) && [v.repetitio, v.gloria].every((x) => x === undefined || words(x)),
  hymnus: (v) =>
    record(v) &&
    Array.isArray(v.strophae) &&
    v.strophae.length > 0 &&
    v.strophae.every((s) => Array.isArray(s) && s.length > 0 && s.every(words)),
  psalmodia: (v) =>
    record(v) &&
    Array.isArray(v.antiphonae) &&
    v.antiphonae.length > 0 &&
    v.antiphonae.every(
      (a) =>
        record(a) &&
        (a.versus !== undefined
          ? words(a.versus) && words(a.responsum)
          : (a.text !== undefined || a.psalmus !== undefined) &&
            (a.text === undefined || words(a.text)) &&
            (a.psalmus === undefined || (words(a.psalmus) && !/[;_]/.test(a.psalmus as string))))
    ),
  lectio: (v) =>
    record(v) &&
    (words(v.text) || (Array.isArray(v.verses) && v.verses.length > 0 && v.verses.every(words))) &&
    (v.evangelium === undefined || SHAPES.lectio!(v.evangelium)),
  oratio: (v) => record(v) && words(v.text) && !/^\s*[@!]/m.test(v.text as string),
};

/** The places in an Office whose text does not have the shape it should. */
function misshapen(officium: NonNullable<LiturgicalDay["officium"]>): string[] {
  const wrong: string[] = [];
  const check = (where: string, value: unknown, shape: keyof typeof SHAPES) => {
    if (value !== undefined && !SHAPES[shape]!(value)) wrong.push(where);
  };
  for (const hour of ["primaeVesperae", "vesperae", "laudes"] as const) {
    const h = officium[hour] as Record<string, unknown> | undefined;
    if (!h) continue;
    check(`${hour}.psalmodia`, h.psalmodia, "psalmodia");
    check(`${hour}.capitulum`, h.capitulum, "capitulum");
    check(`${hour}.hymnus`, h.hymnus, "hymnus");
    check(`${hour}.versus`, h.versus, "versus");
    check(`${hour}.antiphon`, h.magnificat ?? h.benedictus, "antiphona");
  }
  for (const hour of ["tertia", "sexta", "nona"] as const) {
    const h = officium[hour];
    if (!h) continue;
    check(`${hour}.capitulum`, h.capitulum, "capitulum");
    check(`${hour}.responsorium`, h.responsorium, "responsorium");
    check(`${hour}.versus`, h.versus, "versus");
  }
  check("prima", officium.prima?.lectioBrevis, "capitulum");
  const matins = officium.matutinum;
  if (matins) {
    check("matutinum.invitatorium", matins.invitatorium, "antiphona");
    check("matutinum.hymnus", matins.hymnus, "hymnus");
    check("matutinum.psalmodia", matins.psalmodia, "psalmodia");
    check("matutinum.legenda", matins.legenda, "lectio");
    for (const nocturn of matins.nocturni ?? []) {
      if (nocturn.versus !== undefined && !(words(nocturn.versus.versus) && words(nocturn.versus.responsum))) {
        wrong.push("matutinum.nocturnus.versus");
      }
      for (const lesson of nocturn.lectiones) {
        check(`matutinum.lectio${lesson.numerus}`, lesson.lectio, "lectio");
        check(`matutinum.responsorium${lesson.numerus}`, lesson.responsorium, "responsorium");
      }
    }
  }
  check("oratio", officium.oratio, "oratio");
  return wrong;
}

describe.skipIf(!generated)("the Office as published", () => {
  const languages: Record<string, Language> = {};

  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = readAssets("assets");
    for (const code of ["la", "nl"]) {
      languages[code] = { code, assets: languageAssets(join("languages", code, "assets"), code) };
    }
  });

  const YEARS = [2026, 2027, 2029, 2038];

  for (const code of ["la", "nl"]) {
    it(`says in ${code} what its types say, on every day of ${YEARS.join(", ")}`, () => {
      const wrong: string[] = [];
      let offices = 0;
      for (const year of YEARS) {
        const calendar = generateCalendar({ year, languages: [languages[code]!], officium: true });
        for (const [month, days] of Object.entries(calendar)) {
          for (const [day, entry] of Object.entries(days ?? {})) {
            if (entry?.officium) {
              const label = `${code} ${year}-${month}-${day} ${entry.title}`;
              offices++;
              wrong.push(...misshapen(entry.officium).map((where) => `${label}: ${where}`));
            }
          }
        }
      }
      expect(offices).toBeGreaterThan(500);
      expect(wrong).toEqual([]);
    });
  }

  it("carries the Office of the celebration kept, and none on a commemoration", () => {
    for (const code of ["la", "nl"]) {
      const calendar = generateCalendar({ year: 2026, languages: [languages[code]!], officium: true });
      const commemorations = Object.values(calendar).flatMap((days) =>
        Object.values(days ?? {}).flatMap((entry) => entry?.commemorations ?? [])
      );
      expect(commemorations.length).toBeGreaterThan(100);
      expect(commemorations.filter((entry) => entry.officium !== undefined)).toEqual([]);
    }
  });

  describe("days whose texts the sources once left unresolved", () => {
    let latin: ReturnType<typeof generateCalendar>;
    beforeAll(() => {
      latin = generateCalendar({ year: 2026, languages: [languages.la!], officium: true });
    });

    it("gives the Tuesday in the Easter octave its three antiphons and the versicle that closes them", () => {
      const psalmodia = latin[4]![7]!.officium!.matutinum!.psalmodia!;
      expect(psalmodia.antiphonae).toHaveLength(4);
      expect(psalmodia.antiphonae.map((entry) => ("psalmus" in entry ? entry.psalmus : undefined))).toEqual([
        "1",
        "2",
        "3",
        undefined,
      ]);
      expect(psalmodia.antiphonae[3]).toEqual({
        versus: "Surréxit Dóminus vere, allelúja.",
        responsum: "Et appáruit Simóni, allelúja.",
      });
      // Where the next day's differs, and takes the same three antiphons.
      const wednesday = latin[4]![8]!.officium!.matutinum!.psalmodia!;
      expect(wednesday.antiphonae.slice(0, 3)).toEqual(psalmodia.antiphonae.slice(0, 3));
      expect(wednesday.antiphonae[3]).toEqual({
        versus: "Gavísi sunt discípuli, allelúja.",
        responsum: "Viso Dómino, allelúja.",
      });
    });

    it("gives the Ember Wednesday of Pentecost its versicle, not a line joined to the antiphons", () => {
      const last = latin[5]![27]!.officium!.matutinum!.psalmodia!.antiphonae.at(-1);
      expect(last).toEqual({
        versus: "Repléti sunt omnes Spíritu Sancto, allelúja.",
        responsum: "Et cœpérunt loqui, allelúja.",
      });
    });

    it("has Easter's antiphon where the versicle is said at Lauds", () => {
      expect(latin[4]![5]!.officium!.laudes!.versus).toEqual({
        text: "Hæc dies * quam fecit Dóminus: exsultémus et lætémur in ea.",
      });
    });

    it("numbers the psalms of St Andrew's second Vespers one to an antiphon", () => {
      const antiphonae = latin[11]![30]!.officium!.vesperae!.psalmodia!.antiphonae;
      expect(antiphonae.map((entry) => ("psalmus" in entry ? entry.psalmus : undefined))).toEqual([
        "109",
        "112",
        "115",
        "125",
        "138",
      ]);
    });

    it("closes the Rosary's hymn at Matins with its doxology", () => {
      const hymnus = latin[10]![7]!.officium!.matutinum!.hymnus!;
      expect(hymnus.strophae.at(-1)).toEqual([
        "Jesu, tibi sit glória,",
        "Qui natus es de Vírgine,",
        "Cum Patr[e] et almo Spíritu,",
        "In sempitérna sǽcula.",
        "Amen.",
      ]);
    });

    it("says the Baptism's second Vespers from the Epiphany's, the reference of another rite being no text", () => {
      expect(latin[1]![13]!.officium!.vesperae!.psalmodia!.antiphonae).toHaveLength(5);
    });

    it("leaves the Te Deum out of the last lesson", () => {
      const lessons = latin[1]![14]!.officium!.matutinum!;
      const text = JSON.stringify(lessons);
      expect(text).not.toContain("teDeum");
    });

    it("names no directive in the collect of St Paul's commemoration, which asks for St Peter's", () => {
      const day = latin[6]![30]!;
      expect(day.mass).toBeDefined();
      expect(JSON.stringify(day.mass)).not.toContain("@Sancti");
      expect(day.officium!.oratio!.text).not.toMatch(/^[!@]/m);
    });
  });
});
