/**
 * The colors the calendar data names, read against the rubrics.
 *
 * A feast that names no color is white, so a martyr whose entry forgets
 * `color: red` comes out white without a sound. This reads the data as written
 * and holds every title that says martyr, apostle or evangelist to red, unless
 * it is one of the few the rubrics keep white.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const CALENDAR = join("assets", "calendar1962.yml");
const PROPERS = join("assets", "propers");

/**
 * A title that names a martyr, an apostle or an evangelist, as a slug or as a
 * local proper writes it (`SS. Martyrum Gorcomiensium`, `MM.`). The
 * abbreviations are `mart` and `mm`; a bare `m` would read the `b-m-v` of Our
 * Lady as one.
 */
const SAYS_RED =
  /martyr|apostol|evangel|(^|[-\s])(mart|mm)([-.\s]|$)|innocentium/i;

/** Feasts the rubrics keep white though their title says apostle (n. 123). */
const WHITE_APOSTLES = new Set([
  "joannis-apostoli-et-evangelistae",
  "in-cathedra-s-petri-apostoli-antiochiae",
  "in-conversione-s-pauli-apostoli",
  "in-dedicatione-basilicarum-ss-apostolorum-petri-et-pauli",
]);

type Entry = { title: string; color?: string; type?: string };

/** Every titled item of the calendar, with the color and type it inherits. */
function entries(
  node: unknown,
  inherited: { color?: string; type?: string } = {},
  out: Entry[] = []
): Entry[] {
  if (node == null || typeof node !== "object") return out;
  const item = node as Record<string, unknown>;
  const own = {
    color: (item.color as string | undefined) ?? inherited.color,
    type: (item.type as string | undefined) ?? inherited.type,
  };
  if (typeof item.title === "string") out.push({ title: item.title, ...own });
  for (const value of Object.values(
    (item.calendar as Record<string, unknown>) ?? {}
  )) {
    for (const day of Array.isArray(value) ? value : [value]) {
      if (typeof day === "string") out.push({ title: day, ...own });
      else if (day && typeof day === "object") {
        const d = day as { title: string; color?: string };
        out.push({ title: d.title, ...own, color: d.color ?? own.color });
      }
    }
  }
  for (const child of (item.items as unknown[]) ?? []) entries(child, own, out);
  return out;
}

describe("the colors of the calendar", () => {
  const all = entries(parse(readFileSync(CALENDAR, "utf-8")));

  it("mark every martyr, apostle and evangelist red", () => {
    const forgotten = all
      .filter(({ title, type }) => SAYS_RED.test(title) && type !== "vigilia")
      .filter(({ title }) => !WHITE_APOSTLES.has(title))
      .filter(({ color }) => color !== "red")
      .map(({ title }) => title);
    expect(forgotten).toEqual([]);
  });

  it("mark the martyrs of a local proper red, where its title says so", () => {
    // A proper names its saints as it shows them, so a martyr whose title does
    // not say so (`S. Frederici`) is beyond this guard.
    for (const file of readdirSync(PROPERS)) {
      if (!file.endsWith(".yml")) continue;
      const proper = entries(parse(readFileSync(join(PROPERS, file), "utf-8")));
      const forgotten = proper
        .filter(({ title, color }) => SAYS_RED.test(title) && color !== "red")
        .map(({ title }) => title);
      expect(forgotten, file).toEqual([]);
    }
  });

  it("keep the apostles' feasts the rubrics make white", () => {
    for (const title of WHITE_APOSTLES) {
      const entry = all.find((e) => e.title === title);
      expect(entry, title).toBeDefined();
      expect(entry!.color, title).toBeUndefined();
    }
  });

  it("name only the colors the calendar declares valid", () => {
    const valid = (parse(readFileSync(CALENDAR, "utf-8")) as {
      "valid-colors": string[];
    })["valid-colors"];
    for (const { title, color } of all) {
      if (color !== undefined) expect(valid, title).toContain(color);
    }
  });
});
