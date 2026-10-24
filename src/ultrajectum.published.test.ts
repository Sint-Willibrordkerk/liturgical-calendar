import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
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

  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = readAssets("assets");
    for (const code of ["la", "nl"]) {
      languages[code] = { code, assets: readAssets(join("languages", code, "assets")) };
    }
  });

  /** The Utrecht days kept in the years, beside the general day each displaced. */
  function kept(code: string): { label: string; local: LiturgicalDay; general: LiturgicalDay }[] {
    const out = [];
    for (const year of YEARS) {
      const local = generateCalendar(year, ["ultrajectum"], languages[code]!);
      const general = generateCalendar(year, [], languages[code]!);
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
    const local = generateCalendar(2026, ["ultrajectum"], latin);
    const general = generateCalendar(2026, [], latin);
    expect(local[11]![16]!.mass).toEqual(general[11]![16]!.mass);
    expect(local[3]![17]!.mass).toBeDefined();
    expect(local[3]![17]!.mass).not.toEqual(local[11]![16]!.mass);
  });
});
