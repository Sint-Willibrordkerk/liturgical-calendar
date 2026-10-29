import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { languageAssets } from "../scripts/language-assets.mjs";
import generateCalendar, { type Language, type LiturgicalDay } from "./index";

/**
 * The Utrecht local proper as published, with the days Divinum Officium keeps
 * for the Netherlands and for the archdiocese.
 *
 * It reads what `pnpm pipeline && pnpm copy-mass-propers` writes, and is skipped
 * where those files have not been generated, as they are published to npm
 * rather than committed.
 */
const GENERATED = [
  "assets/mass-propers/Sancti/Neerlandia/Ultrajectum",
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

/** The dates the Utrecht proper keeps a day on, as month and day. */
function utrechtDates(): [number, number][] {
  const propers = parse(readFileSync("assets/propers/ultrajectum.yml", "utf-8")) as {
    items: { calendar?: Record<string, unknown> }[];
  };
  return propers.items
    .flatMap(({ calendar }) => Object.keys(calendar ?? {}))
    .map((date) => {
      const [day, month] = date.split("-").map(Number);
      return [month!, day!] as [number, number];
    });
}

const YEARS = [2026, 2027, 2028, 2029];

describe.skipIf(!generated)("the Utrecht local proper as published", () => {
  const languages: Record<string, Language> = {};

  // Every generated file is read and parsed, some ten seconds' work: more than
  // a hook is given by default once other files run beside it.
  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = readAssets("assets");
    for (const code of ["la", "nl"]) {
      languages[code] = { code, assets: languageAssets(join("languages", code, "assets"), code) };
    }
  }, 60_000);

  /** The Utrecht days kept in the years, beside the general day each displaced. */
  function kept(code: string): { label: string; local: LiturgicalDay; general: LiturgicalDay }[] {
    const out = [];
    for (const year of YEARS) {
      const local = generateCalendar({ year, propers: ["ultrajectum"], languages: [languages[code]!] });
      const general = generateCalendar({ year, languages: [languages[code]!] });
      for (const [month, day] of utrechtDates()) {
        const l = local[month]![day]!;
        const g = general[month]![day]!;
        if (l.title !== g.title) out.push({ label: `${year}-${month}-${day}`, local: l, general: g });
      }
    }
    return out;
  }

  it("gives every Utrecht day kept its Mass, by its Latin title", () => {
    const days = kept("la");
    expect(days.length).toBeGreaterThan(YEARS.length * 15);
    const without = days.filter(({ local }) => local.mass === undefined).map(({ label }) => label);
    expect(without).toEqual([]);
    const slugs = days
      .filter(({ local }) => /^[a-z0-9-]+$/.test(local.title ?? ""))
      .map(({ label, local }) => `${label} ${local.title}`);
    expect(slugs).toEqual([]);
  });

  it("names every Utrecht day kept in Dutch", () => {
    const slugs = kept("nl")
      .filter(({ local }) => /^[a-z0-9-]+$/.test(local.title ?? ""))
      .map(({ label, local }) => `${label} ${local.title}`);
    expect(slugs).toEqual([]);
  });

  it("keeps the general day's propers where a local calendar files another saint by its name", () => {
    // Gertrude the Great, of the general calendar, and Gertrude of Nivelles, of
    // the Netherlands, are both filed as `gertrudis-virginis`.
    const latin = languages.la!;
    const local = generateCalendar({ year: 2026, propers: ["ultrajectum"], languages: [latin] });
    const general = generateCalendar({ year: 2026, languages: [latin] });
    expect(local[11]![16]!.mass).toEqual(general[11]![16]!.mass);
    expect(local[3]![17]!.mass).toBeDefined();
    expect(local[3]![17]!.mass).not.toEqual(local[11]![16]!.mass);
  });

  describe("in Dutch, where the Dutch has no words for the patronal feast", () => {
    // Divinum Officium has no Dutch for the days of a local calendar, so the
    // Dutch Mass of 7 November is partial unless Latin is passed beside it.
    const NOVEMBER = [11, 7] as const;

    it("leaves out the texts the Dutch lacks", () => {
      const nl = generateCalendar({ year: 2026, propers: ["ultrajectum"], languages: [languages.nl!] });
      const mass = nl[NOVEMBER[0]]![NOVEMBER[1]]!.mass as Record<string, unknown>;
      expect(mass).toBeDefined();
      expect(mass).toHaveProperty("evangelium");
      expect(mass).not.toHaveProperty("oratio");
      expect(mass).not.toHaveProperty("lectio");
      expect(mass).not.toHaveProperty("fallback");
    });

    it("says them in Latin when Latin is passed after it, and names them", () => {
      const nl = generateCalendar({ year: 2026, propers: ["ultrajectum"], languages: [languages.nl!, languages.la!] });
      const mass = nl[NOVEMBER[0]]![NOVEMBER[1]]!.mass as Record<string, unknown>;
      for (const section of ["oratio", "lectio", "secreta", "communio", "postcommunio"]) {
        expect(mass, section).toHaveProperty(section);
      }
      expect(mass.fallback).toMatchObject({
        oratio: "la",
        lectio: "la",
        secreta: "la",
        communio: "la",
        postcommunio: "la",
      });
      // What the Dutch does say stays Dutch and is not marked.
      const dutch = generateCalendar({ year: 2026, propers: ["ultrajectum"], languages: [languages.nl!] })[11]![7]!.mass;
      expect(mass.evangelium).toEqual((dutch as Record<string, unknown>).evangelium);
      expect(mass.fallback).not.toHaveProperty("evangelium");
    });

    it("says the Office the Dutch lacks in Latin too, and names it Hour by Hour", () => {
      const options = { officium: true };
      const dutchOnly = generateCalendar({ year: 2026, propers: ["ultrajectum"], languages: [languages.nl!], ...options })[11]![7]!;
      const both = generateCalendar({ year: 2026, propers: ["ultrajectum"], languages: [languages.nl!, languages.la!], ...options })[11]![7]!;
      expect(JSON.stringify(dutchOnly.officium ?? {})).not.toContain('"fallback"');
      expect(both.officium?.laudes?.fallback).toBeDefined();
      expect(Object.values(both.officium!.laudes!.fallback!)).toEqual(
        expect.arrayContaining(["la"])
      );
    });

    it("reads the Martyrology in Latin where the Dutch package has none", () => {
      const options = { martyrologium: true };
      const dutchOnly = generateCalendar({ year: 2026, propers: ["ultrajectum"], languages: [languages.nl!], ...options })[11]![7]!;
      expect(dutchOnly.martyrologium).toBeUndefined();
      const both = generateCalendar({ year: 2026, propers: ["ultrajectum"], languages: [languages.nl!, languages.la!], ...options })[11]![7]!;
      expect(both.martyrologium?.titulus).toBeTruthy();
      expect(both.martyrologium?.fallback).toMatchObject({ titulus: "la", elogia: "la" });
    });
  });
});
