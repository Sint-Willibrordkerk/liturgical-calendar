import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { colors, seasons } from "./constants";

/**
 * The translations are keyed by the name the calendar files a day under, so a
 * key that names nothing in the calendar translates nothing.
 *
 * This is how the Dutch quietly stopped working once the calendar was renamed
 * to match the Mass propers: the table was untouched and still looked right,
 * but almost none of its keys reached a day any more.
 */
const LANGUAGES = "languages";
const CALENDAR = join("assets", "calendar1962.yml");
const PROPERS = join("assets", "propers");

/**
 * The vocabulary files name no days: the ordinals titles are built from, and
 * the names of the seasons and the colors, keyed by their identifiers, and the
 * age of the moon the Martyrology announces.
 */
const VOCABULARY = new Set([
  "ordinals.yml",
  "seasons.yml",
  "colors.yml",
  "luna.yml",
]);

/**
 * Keys that name a day no calendar carries. Left in place rather than deleted —
 * a day may come back, and the Dutch is worth keeping — but pinned here so the
 * list cannot grow unnoticed.
 */
const UNREACHABLE = 0;

function names(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const n of node) names(n, out);
    return out;
  }
  if (typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === "id" && typeof value === "string") out.push(value);
    else if (key === "calendar" && value && typeof value === "object") {
      for (const day of Object.values(value)) {
        for (const entry of Array.isArray(day) ? day : [day]) {
          if (typeof entry === "string") out.push(entry);
          else if (entry && typeof entry === "object" && "id" in entry)
            out.push(String(entry.id));
        }
      }
    } else names(value, out);
  }
  return out;
}

function keysOf(file: string): string[] {
  const keys: string[] = [];
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^([^:#]+):/);
    if (match?.[1]?.trim()) keys.push(match[1]);
  }
  return keys;
}

// A day is named by the base calendar or by a local propers calendar, so a
// key that reaches either is reachable — the Utrecht propers give their own
// days ids, and the Dutch keys on those ids.
const calendarNames = new Set(names(parse(readFileSync(CALENDAR, "utf-8"))));
for (const file of readdirSync(PROPERS)) {
  if (!file.endsWith(".yml")) continue;
  for (const name of names(parse(readFileSync(join(PROPERS, file), "utf-8")))) {
    calendarNames.add(name);
  }
}

/** The languages that carry translations; a language may carry only propers. */
const translated = readdirSync(LANGUAGES).filter((code) =>
  existsSync(join(LANGUAGES, code, "assets", "translations", code))
);

describe.each(translated)("the %s translations", (language) => {
  const dir = join(LANGUAGES, language, "assets", "translations", language);
  const files = readdirSync(dir);

  it("says nothing twice", () => {
    for (const file of files) {
      const keys = keysOf(join(dir, file));
      expect(new Set(keys).size, `duplicate key in ${file}`).toBe(keys.length);
    }
  });

  it("names every season and every color, by its identifier", () => {
    const read = (file: string) =>
      existsSync(join(dir, file)) ? keysOf(join(dir, file)) : [];
    expect(read("seasons.yml").sort()).toEqual([...seasons].sort());
    expect(read("colors.yml").sort()).toEqual([...colors].sort());
  });

  it("keys its days by the name the calendar files them under", () => {
    const vocabulary = new Set(
      files.filter((file) => VOCABULARY.has(file)).flatMap((file) => keysOf(join(dir, file)))
    );
    const unreachable = files
      .filter((file) => !VOCABULARY.has(file))
      .flatMap((file) => keysOf(join(dir, file)))
      .filter(
        (key) =>
          !calendarNames.has(key) &&
          !vocabulary.has(key) &&
          !key.includes("$")
      );
    expect(unreachable.length).toBeLessThanOrEqual(UNREACHABLE);
  });
});
