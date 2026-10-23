import { join, dirname } from "path";
import { readFile, writeFile } from "fs/promises";
import {
  STEP_EXT,
  parseStep,
  stringifyOutput,
  toOutputPath,
} from "./lib/serialize.js";
import { consola } from "consola";
import { collectYmlFiles, ensureDir } from "./lib/batch";
import { isVariantArray, type Variant } from "./lib/variants";
import {
  contentHash,
  openingWords,
  refToKey,
} from "./step6.js";
import {
  BASE_LANGUAGE,
  PUBLISHED_RUBRIC,
  isOtherRubricSystem,
} from "./lib/rubrics.js";
// The calendar library owns which store each section draws on; publishing must
// use the very same sets, or a section is stored where nothing looks for it.
import {
  READING_SECTIONS,
  PRAYER_SECTIONS,
  CHANT_SECTIONS,
} from "../src/massPropers.js";

/**
 * Step 12 — the Mass propers.
 *
 * The last step, and the only one whose output leaves the pipeline. It narrows
 * the tree to what the calendar consumes, so the Divine Office — by far the
 * larger part — is not carried into the published assets. Section content keeps
 * the rubric-variant shape: which variant applies is a question for whoever
 * renders a given day, not for the pipeline.
 */
export type Step12Output = { [key: string]: unknown };

/** The Mass sections proper — a document needs one of these to be worth writing. */
const MASS_SECTIONS = new Set([
  "introitus",
  "oratio",
  "lectio",
  "graduale",
  "alleluia",
  "alleluiap",
  "tractus",
  "evangelium",
  "offertorium",
  "secreta",
  "communio",
  "postcommunio",
  "ultima-evangelium",
]);

/**
 * Kept alongside, but not enough on their own: nearly every document has them.
 *
 * `rule` is deliberately absent. It describes how the Office of a day is
 * observed, and step 5 has already lifted `prefatio` out of it; past that
 * nothing in the propers refers to it, so it is dropped here rather than
 * published.
 */
const SUPPORTING_SECTIONS = new Set(["title", "name", "prefatio"]);

/** The stores a language ships, and which sections draw on each. */
export const STORES = [
  { file: "lectio", sections: READING_SECTIONS },
  { file: "oratio", sections: PRAYER_SECTIONS },
  { file: "antiphona", sections: CHANT_SECTIONS },
] as const;

/**
 * Drop the variants that require a rubric system other than the one published.
 * They could never be chosen for that calendar, so shipping them would ship
 * unreachable content. A section left with no variants is dropped with them.
 */
export function keepPublishedRubric(
  obj: Record<string, unknown>,
  inForce: string = PUBLISHED_RUBRIC
): Step12Output {
  const out: Step12Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!isVariantArray(value)) {
      out[key] = value;
      continue;
    }
    const kept = value.filter(
      (variant) =>
        !variant.condition.some((token) => isOtherRubricSystem(token, inForce))
    );
    if (kept.length > 0) out[key] = kept;
  }
  return out;
}

/**
 * The order the sections occur in at Mass. A day file reads the way the day is
 * celebrated, rather than in whatever order the sources happened to yield.
 */
const SECTION_ORDER = [
  "title",
  "name",
  "introitus",
  "oratio",
  "lectio",
  "graduale",
  "alleluia",
  "alleluiap",
  "tractus",
  "evangelium",
  "offertorium",
  "secreta",
  "prefatio",
  "communio",
  "postcommunio",
  "ultima-evangelium",
];

const SECTION_RANK = new Map(SECTION_ORDER.map((key, i) => [key, i]));

/**
 * Order a document's sections. Anything unrecognised — there should be nothing —
 * follows the known sections alphabetically, so an unexpected key is visible
 * rather than silently dropped.
 */
export function sortSections(obj: Record<string, unknown>): Step12Output {
  const rank = (key: string) => SECTION_RANK.get(key) ?? SECTION_ORDER.length;
  const keys = Object.keys(obj).sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: Step12Output = {};
  for (const key of keys) out[key] = obj[key];
  return out;
}

/**
 * Drop the variant scaffolding wherever it says nothing.
 *
 * An empty condition is omitted — its absence means what the empty list meant.
 * A section holding only the unconditional variant becomes that variant's value,
 * unless the value is an array, since a bare array would be indistinguishable
 * from a variant list.
 *
 * Runs last, once the keys a document holds have been collected: afterwards a
 * section may no longer be a variant list to walk.
 */
export function compactSections(obj: Record<string, unknown>): Step12Output {
  const out: Step12Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!isVariantArray(value)) {
      out[key] = value;
      continue;
    }
    const only = value.length === 1 ? value[0]! : undefined;
    if (only && only.condition.length === 0 && !Array.isArray(only.value)) {
      out[key] = only.value;
      continue;
    }
    out[key] = value.map((variant) =>
      variant.condition.length === 0
        ? { value: variant.value }
        : { value: variant.value, condition: variant.condition }
    );
  }
  return out;
}

/** Keep only the Mass sections, dropping the Office. */
export function keepMassSections(obj: Record<string, unknown>): Step12Output {
  const out: Step12Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (MASS_SECTIONS.has(key) || SUPPORTING_SECTIONS.has(key)) out[key] = value;
  }
  return out;
}

/** True when a document carries Mass content worth publishing. */
export function hasMassContent(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some((key) => MASS_SECTIONS.has(key));
}

/**
 * The store keys held by the sections in `sections`. A value left inline is
 * content rather than a key and contributes none.
 */
function usedKeys(
  obj: Record<string, unknown>,
  sections: ReadonlySet<string>
): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    if (!sections.has(key) || !isVariantArray(value)) continue;
    for (const variant of value) {
      if (typeof variant.value === "string") keys.add(variant.value);
    }
  }
  return keys;
}

/** The reading keys a document holds. */
export function usedReadingKeys(obj: Record<string, unknown>): Set<string> {
  return usedKeys(obj, READING_SECTIONS);
}

/** The store entries named by `keys`; a key the store lacks is skipped. */
export function storeSubset<T>(
  store: Record<string, T>,
  keys: Set<string>
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of [...keys].sort()) {
    const entry = store[key];
    if (entry !== undefined) out[key] = entry;
  }
  return out;
}

// --- Every text a key ----------------------------------------------------------

/**
 * The store of the saints' names, beside the three step 6 opened. A day holds
 * the key of its name, and each language says the name in its own words.
 */
export const NAME_STORE = "nomen";

/** A store as published: keys to whatever the language says for them. */
type Entries = Record<string, unknown>;

/**
 * Every string a value says, leaving out its references, its closing formula,
 * and the lines the sources mark with `!` as a direction to the reader
 * (`!Oratio propria.`) or a reference within the text.
 */
function wordsOf(value: unknown): string {
  if (typeof value === "string") {
    return value
      .split("\n")
      .filter((line) => !line.trim().startsWith("!"))
      .join("\n");
  }
  if (Array.isArray(value)) return value.map(wordsOf).join("\n");
  if (value != null && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => key !== "ref" && key !== "closure")
      .map(([, part]) => wordsOf(part))
      .join("\n");
  }
  return "";
}

/**
 * True when a value says something. A lone `@…` line is a reference step 4
 * could not resolve, a placeholder rather than words.
 */
function carriesWords(value: unknown): boolean {
  const words = wordsOf(value).trim();
  return words !== "" && !(words.startsWith("@") && !words.includes("\n"));
}

/** The store a section draws on, or undefined where it holds an identifier. */
function storeOf(section: string): string | undefined {
  return STORES.find(({ sections }) => sections.has(section))?.file;
}

/**
 * File a value into `store` and return its key: its opening words and a hash
 * of the whole value, as step 6 keys an entry without a reference. The same
 * value filed again gets the key it was given; a key is never given twice.
 */
function fileValue(value: unknown, store: Entries): string {
  const identity = JSON.stringify(value);
  const base = `${openingWords(wordsOf(value))}-${contentHash(identity)}`.replace(/^-/, "");
  let key = base;
  let n = 1;
  while (key in store && JSON.stringify(store[key]) !== identity) key = `${base}-${++n}`;
  store[key] = value;
  return key;
}

/**
 * File every value step 6 left inline that carries words — a Passion read
 * across several references, a chant whose antiphon is empty — so the day holds
 * keys alone and serves every language. A value carrying no words stays: there
 * is nothing in it to say. `stores` is added to.
 */
export function fileInline(
  obj: Record<string, unknown>,
  stores: Record<string, Entries>
): Step12Output {
  const out: Step12Output = {};
  for (const [section, value] of Object.entries(obj)) {
    const file = storeOf(section);
    out[section] =
      file === undefined || !isVariantArray(value)
        ? value
        : value.map((variant) =>
            typeof variant.value === "string" || !carriesWords(variant.value)
              ? variant
              : { ...variant, value: fileValue(variant.value, stores[file]!) }
          );
  }
  return out;
}

/**
 * File the day's name into `names` and leave its key: the name in the form a
 * reference is keyed in. A second name folding to a key already taken takes the
 * next free counter.
 */
export function fileName(
  obj: Record<string, unknown>,
  names: Record<string, string>
): Step12Output {
  const name = obj.name;
  if (typeof name !== "string") return obj;
  const base = refToKey(name);
  if (base === null) return obj;
  let key = base;
  let n = 1;
  while (key in names && names[key] !== name) key = `${base}-${++n}`;
  names[key] = name;
  return { ...obj, name: key };
}

/**
 * A base key, and what a translation says in its place. `untranslated` where
 * that is the base language's own text: a translation's sources carry it where
 * they have nothing of their own.
 */
export type Rendering = {
  store: string;
  key: string;
  rendering: unknown;
  untranslated?: boolean;
};

/**
 * The variant of `section` under exactly `condition`. Step 11 drops a variant
 * only where it repeats the default, so where the base language still tells a
 * variant apart and the translation has none, the translation lacks that text:
 * its default says another.
 */
function sameCondition(section: Variant[], condition: string[]): Variant | undefined {
  const tokens = JSON.stringify([...condition].sort());
  return section.find((variant) => JSON.stringify([...variant.condition].sort()) === tokens);
}

/**
 * What a translation's file of a day says in the place of each key the base
 * language's file of it holds: its variant of the same condition, resolved
 * against its own store, or the value itself where it left it inline.
 * One rendering of a key per day, so a day counts once however often it says it.
 */
export function renderingsOf(
  base: Record<string, unknown>,
  translation: Record<string, unknown>,
  stores: Record<string, Entries>,
  baseStores: Record<string, Entries> = {}
): Rendering[] {
  const out: Rendering[] = [];
  const seen = new Set<string>();
  const add = (store: string, key: string, rendering: unknown) => {
    if (rendering === undefined || !carriesWords(rendering)) return;
    const id = JSON.stringify(rendering);
    if (seen.has(JSON.stringify([store, key, id]))) return;
    seen.add(JSON.stringify([store, key, id]));
    out.push(
      id === JSON.stringify(baseStores[store]?.[key])
        ? { store, key, rendering, untranslated: true }
        : { store, key, rendering }
    );
  };

  for (const [section, value] of Object.entries(base)) {
    if (section === "name") {
      if (typeof value === "string") add(NAME_STORE, value, translation.name);
      continue;
    }
    const file = storeOf(section);
    const theirs = translation[section];
    if (file === undefined || !isVariantArray(value) || !isVariantArray(theirs)) {
      continue;
    }
    for (const variant of value) {
      if (typeof variant.value !== "string") continue;
      const said = sameCondition(theirs, variant.condition)?.value;
      add(file, variant.value, typeof said === "string" ? stores[file]?.[said] : said);
    }
  }
  return out;
}

/**
 * One rendering per key — the one found on most days, the one met first
 * between renderings found as often — each store ordered by key. The base
 * language's own text is kept only where the translation says it no other way.
 */
export function chooseRenderings(
  renderings: Rendering[]
): Record<string, Entries> {
  type Tally = { count: number; rendering: unknown; untranslated: boolean };
  // store -> key -> rendering -> how often, and the rendering itself
  const tally = new Map<string, Map<string, Map<string, Tally>>>();
  for (const { store, key, rendering, untranslated = false } of renderings) {
    if (!tally.has(store)) tally.set(store, new Map());
    const byKey = tally.get(store)!;
    if (!byKey.has(key)) byKey.set(key, new Map());
    const found = byKey.get(key)!;
    const id = JSON.stringify(rendering);
    const seen = found.get(id);
    if (seen) seen.count++;
    else found.set(id, { count: 1, rendering, untranslated });
  }

  const out: Record<string, Entries> = {};
  for (const [store, byKey] of tally) {
    const entries: Entries = {};
    for (const key of [...byKey.keys()].sort()) {
      // A Map keeps the order its entries were met in, so a strict `>` keeps
      // the first of those found as often.
      const better = (a: Tally, b: Tally) =>
        a.untranslated !== b.untranslated ? b.untranslated : a.count > b.count;
      let best: Tally | undefined;
      for (const candidate of byKey.get(key)!.values()) {
        if (best === undefined || better(candidate, best)) best = candidate;
      }
      entries[key] = best!.rendering;
    }
    out[store] = entries;
  }
  return out;
}

/**
 * The trees holding days. A calendar asks for the propers of a day, and only
 * these two hold them.
 *
 * `Commune` is a base for other days rather than a day: step 7 has already
 * resolved the borrowings, so the commons' texts reach the calendar through the
 * days that use them. The rest — `Ordo`, `Psalterium` and the like — are the
 * Office, not the propers.
 */
const DAY_TREES = new Set(["Sancti", "Tempora"]);

/**
 * The local calendars kept even though they are nested. `aliquibus locis` — "in
 * some places" — is a universal option, part of the general calendar; the rest
 * (`Urbis`, `Bavaria`, `Brasilia`, …) are the propers of a particular place,
 * outside the calendar being published and shadowing its own days.
 */
const KEPT_LOCAL_CALENDARS = new Set(["aliquibus locis"]);

/**
 * True when a document is published: a day directly under a day tree, or one
 * under a kept local calendar. A day nested under any other local calendar is a
 * regional proper, not part of the general calendar, and is dropped.
 */
export function isPublishedTree(relPath: string): boolean {
  const parts = relPath.split(/[/\\]/);
  const tree = parts[1];
  if (tree === undefined || !DAY_TREES.has(tree)) return false;
  const subdirs = parts.slice(2, -1);
  return subdirs.length === 0 || KEPT_LOCAL_CALENDARS.has(subdirs[0]!);
}

/**
 * A day whose Mass changes with the part of the year.
 *
 * The sources hold such a day as one document whose sections carry a season
 * token; published whole it would offer the calendar a choice it cannot make.
 * Each season is written instead as its own day under `Sancti`, named for the
 * stretch of the year it covers.
 *
 * Our Lady on Saturday is the case the sources carry. The season with no token
 * of its own — from Trinity to Advent — is the Mass the document says when no
 * season claims it.
 */
type Season = { season?: string; name: string };

const SEASONAL_DAYS: Record<string, Season[]> = {
  // Named by the path below the language, since another tree holds documents
  // of the same name — the Saturdays of Our Lady in July and September, each
  // one day with one Mass, which publish as themselves.
  "Commune/sanctae-mariae-sabbato": [
    { season: "special-a", name: "maria-in-sabbato-in-tempore-adventus" },
    {
      season: "special-b",
      name: "maria-in-sabbato-a-nativitate-domini-usque-ad-purificationem",
    },
    {
      season: "special-c",
      name: "maria-in-sabbato-a-die-3-februari-usque-ad-feriam-iv-hebdomadae-sanctae",
    },
    { season: "paschali", name: "maria-in-sabbato-in-tempore-paschali" },
    {
      name: "maria-in-sabbato-a-festo-trinitatis-usque-ad-sabbatum-ante-dominicam-i-adventus",
    },
  ],
};

/** The tree a seasonal day is written under, whatever tree its source sat in. */
const SEASONAL_TREE = "Sancti";

/** Every season token a seasonal day is split on. */
const SEASON_TOKENS = new Set(
  Object.values(SEASONAL_DAYS).flatMap((seasons) =>
    seasons.flatMap(({ season }) => (season === undefined ? [] : [season]))
  )
);

export type Publication = {
  relPath: string;
  outRelPath: string;
  season?: string;
};

/**
 * The days a document is published as, where it is one that changes with the
 * season; nothing, where it is an ordinary document published as it stands.
 *
 * The source document lives under `Commune`, since that is where the sources
 * keep it, but the days it yields are days and go under the day tree.
 */
export function seasonalPublications(relPath: string): Publication[] {
  const parts = relPath.split(/[/\\]/);
  if (parts.length < 2) return [];
  const base = parts[parts.length - 1] ?? "";
  const stem = base.replace(/\.[^.]*$/, "");
  const ext = base.slice(stem.length);
  const seasons = SEASONAL_DAYS[[...parts.slice(1, -1), stem].join("/")];
  if (seasons === undefined) return [];
  const lang = parts[0]!;
  return seasons.map(({ season, name }) => ({
    relPath,
    outRelPath: `${lang}/${SEASONAL_TREE}/${name}${ext}`,
    season,
  }));
}

/**
 * Narrow a document to one season.
 *
 * A section with a variant for the season keeps that variant alone; one with
 * none keeps the variants naming no season at all. The season token is then
 * dropped from what remains — the file as a whole is now that season — while
 * every other token stays. A section left with nothing is dropped.
 */
export function keepSeason(
  obj: Record<string, unknown>,
  season: string | undefined
): Step12Output {
  const out: Step12Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!isVariantArray(value)) {
      out[key] = value;
      continue;
    }
    const unseasoned = value.filter(
      (variant) => !variant.condition.some((token) => SEASON_TOKENS.has(token))
    );
    const kept =
      season === undefined
        ? unseasoned
        : (() => {
            const named = value.filter((variant) =>
              variant.condition.includes(season)
            );
            return named.length > 0 ? named : unseasoned;
          })();
    if (kept.length === 0) continue;
    out[key] = kept.map((variant) => ({
      value: variant.value,
      condition: variant.condition.filter((token) => !SEASON_TOKENS.has(token)),
    }));
  }
  return out;
}

/** The language root a relative path sits under, e.g. `la/Sancti/x.yml` -> `la`. */
function languageRoot(relPath: string): string {
  const [first] = relPath.split(/[/\\]/);
  return first ?? "";
}

// --- The Martyrology ---------------------------------------------------------

/** The tree the Martyrology sits in, and is published under. */
export const MARTYROLOGY_TREE = "Martyrologium";

/** The date a path is the Martyrology of (`01-21`), or undefined. */
export function martyrologyDate(relPath: string): string | undefined {
  const parts = relPath.split(/[/\\]/);
  if (parts.length !== 3 || parts[1] !== MARTYROLOGY_TREE) return undefined;
  return /^(\d\d-\d\d)\.[^.]+$/.exec(parts[2]!)?.[1];
}

/** A day of the Martyrology as published: its date line and its entries. */
export type MartyrologyDay = { titulus?: string; elogia?: string[] };

/**
 * A section's lines under the rubric in force: its variant for that rubric, or
 * its default. A variant assuming any other rubric, alone or besides, is never
 * the one read.
 */
function linesInForce(
  section: unknown,
  inForce: string
): string[] | undefined {
  if (!isVariantArray(section)) return undefined;
  const own = section.find(
    (variant) =>
      variant.condition.length === 1 && variant.condition[0] === inForce
  );
  const chosen = own ?? section.find((variant) => variant.condition.length === 0);
  return Array.isArray(chosen?.value) ? (chosen.value as string[]) : undefined;
}

/** A direction to the reader, between `/:` and `:/`. */
const DIRECTION = /\s*\/:[\s\S]*?:\/\s*/g;

/** A line without its directions, or empty where it was nothing else. */
function withoutDirections(line: string): string {
  return line
    .replace(DIRECTION, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** What is read of a section's lines: no blanks, directions or bare references. */
function readLines(lines: string[]): string[] {
  return lines
    .map(withoutDirections)
    .filter((line) => line !== "" && line !== "_" && !/^@\S*$/.test(line));
}

/** A date of the Martyrology, reduced to what is read under the rubric in force. */
export function martyrologyDay(
  obj: Record<string, unknown>,
  inForce: string = PUBLISHED_RUBRIC
): MartyrologyDay {
  const out: MartyrologyDay = {};
  const [titulus] = readLines(linesInForce(obj.titulus, inForce) ?? []);
  if (titulus !== undefined) out.titulus = titulus;
  const elogia = readLines(linesInForce(obj.martyrologium, inForce) ?? []);
  if (elogia.length > 0) out.elogia = elogia;
  return out;
}

/**
 * The announcements keyed to no date: two Divinum Officium attaches to the
 * office of the day it is read on, and one nothing reads.
 */
const UNDATED_ANNOUNCEMENTS = new Set(["defuncti", "defunctim", "nativity"]);

/** The movable days' announcements under the rubric in force, keyed by day. */
export function martyrologyMobile(
  obj: Record<string, unknown>,
  inForce: string = PUBLISHED_RUBRIC
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, section] of Object.entries(obj)) {
    if (UNDATED_ANNOUNCEMENTS.has(key)) continue;
    const lines = readLines(linesInForce(section, inForce) ?? []);
    if (lines.length > 0) out[key] = lines;
  }
  return out;
}

/** The versicle that closes the reading, and its response. */
export type MartyrologyConclusion = { versus: string; responsum: string };

/** A line without its `V.` or `R.` mark. */
function unmarked(line: string): string {
  return line.replace(/^[VR]\.\s*/, "");
}

/**
 * The conclusion, from the Office's common prayers: the versicle `Conclmart`
 * gives, and the response its `$` line names.
 */
export function martyrologyConclusion(
  prayers: Record<string, unknown>,
  inForce: string = PUBLISHED_RUBRIC
): MartyrologyConclusion | undefined {
  const lines = linesInForce(prayers.conclmart, inForce) ?? [];
  const versus = lines.find((line) => /^V\./.test(line));
  const macro = lines.find((line) => line.startsWith("$"));
  if (versus === undefined || macro === undefined) return undefined;
  const named = macro.slice(1).trim().toLowerCase().replace(/\s+/g, "-");
  const [responsum] = linesInForce(prayers[named], inForce) ?? [];
  if (responsum === undefined) return undefined;
  return { versus: unmarked(versus), responsum: unmarked(responsum) };
}

/** The prayers the conclusion is taken from, under a language root. */
const COMMON_PRAYERS = join("Psalterium", "Common", "Prayers");

/**
 * Publish the Martyrology of each language that has one: a file per date, the
 * movable days and the conclusion. Returns how many files were written.
 */
async function publishMartyrology(
  inputDir: string,
  outputDir: string,
  relPaths: string[],
  mkdirCache: Set<string>
): Promise<number> {
  const read = async (relPath: string) => {
    try {
      const obj = parseStep(await readFile(join(inputDir, relPath), "utf-8"));
      return typeof obj === "object" && obj !== null && !Array.isArray(obj)
        ? (obj as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  };
  const write = async (relPath: string, value: unknown) => {
    const outPath = join(outputDir, relPath);
    await ensureDir(outPath, mkdirCache);
    await writeFile(outPath, stringifyOutput(value), "utf-8");
  };

  let written = 0;
  const languages = new Set<string>();
  for (const relPath of relPaths) {
    const date = martyrologyDate(relPath);
    if (date === undefined) continue;
    const obj = await read(relPath);
    if (obj === undefined) continue;
    const lang = languageRoot(relPath);
    languages.add(lang);
    await write(join(lang, MARTYROLOGY_TREE, `${date}.yml`), martyrologyDay(obj));
    written++;
  }

  // The movable days and the conclusion go with a Martyrology, and only there.
  for (const lang of languages) {
    const mobile = await read(join(lang, MARTYROLOGY_TREE, `Mobile${STEP_EXT}`));
    if (mobile !== undefined) {
      await write(join(lang, MARTYROLOGY_TREE, "mobile.yml"), martyrologyMobile(mobile));
      written++;
    }
    const prayers = await read(join(lang, COMMON_PRAYERS + STEP_EXT));
    const conclusio = prayers && martyrologyConclusion(prayers);
    if (conclusio !== undefined) {
      await write(join(lang, MARTYROLOGY_TREE, "conclusio.yml"), conclusio);
      written++;
    }
  }
  return written;
}

/** A path without its language root: `la/Sancti/x.json` -> `Sancti/x.json`. */
function withoutLanguage(relPath: string): string {
  return relPath.replace(/^[^/\\]*[/\\]/, "");
}

/** A publication's day: its Mass sections under the published rubric and season. */
async function massOf(
  inputDir: string,
  { relPath, outRelPath, season }: Publication
): Promise<Step12Output> {
  const obj = parseStep(await readFile(join(inputDir, relPath), "utf-8"));
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("Expected object");
  }
  const published = keepPublishedRubric(
    keepMassSections(obj as Record<string, unknown>)
  );
  // Narrowed after the rubric filter, so a season is decided among the
  // variants that could actually be chosen.
  return relPath === outRelPath ? published : keepSeason(published, season);
}

/**
 * Batch runner: reads the step 11 tree under `inputDir` and writes to
 * `outputDir` the days, once, as the base language lays them out and holding
 * keys alone; and for each language the stores those keys name, a
 * translation's keyed by the base language's.
 */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const allRelPaths = await collectYmlFiles(inputDir);
  const mkdirCache = new Set<string>();

  const byLanguage = new Map<string, Publication[]>();
  for (const relPath of [...allRelPaths].sort()) {
    // The stores are read per language and subset, not copied wholesale.
    const base = relPath.replace(/^.*[/\\]/, "");
    if (STORES.some(({ file }) => file + STEP_EXT === base)) continue;
    // A day that changes with the season is published as one day per season,
    // whatever tree its source sits in; every other document stands as it is.
    const seasonal = seasonalPublications(relPath);
    const publications =
      seasonal.length > 0
        ? seasonal
        : isPublishedTree(relPath)
          ? [{ relPath, outRelPath: relPath }]
          : [];
    if (publications.length === 0) continue;
    const lang = languageRoot(relPath);
    if (!byLanguage.has(lang)) byLanguage.set(lang, []);
    byLanguage.get(lang)!.push(...publications);
  }

  const readStores = async (lang: string) => {
    const stores: Record<string, Entries> = {};
    for (const { file } of STORES) {
      try {
        const raw = await readFile(join(inputDir, lang, file + STEP_EXT), "utf-8");
        stores[file] = (parseStep(raw) ?? {}) as Entries;
      } catch {
        consola.warn(`Step 12: no ${file} store for ${lang}`);
        stores[file] = {};
      }
    }
    return stores;
  };
  const writeStores = async (lang: string, stores: Record<string, Entries>) => {
    for (const file of [...STORES.map(({ file }) => file), NAME_STORE]) {
      const storePath = join(outputDir, lang, file + ".yml");
      await ensureDir(storePath, mkdirCache);
      await writeFile(storePath, stringifyOutput(stores[file] ?? {}), "utf-8");
    }
  };

  let written = 0;
  let skipped = 0;
  let errors = 0;

  // The days, from the base language. Each is kept, keyed, for the
  // translations to be read against.
  const days = new Map<string, Step12Output>();
  const baseStores = await readStores(BASE_LANGUAGE);
  const names: Record<string, string> = {};
  const used = new Map<string, Set<string>>(STORES.map(({ file }) => [file, new Set()]));
  for (const publication of byLanguage.get(BASE_LANGUAGE) ?? []) {
    try {
      const mass = await massOf(inputDir, publication);
      if (!hasMassContent(mass)) {
        skipped++;
        continue;
      }
      const day = fileName(fileInline(mass, baseStores), names);
      for (const { file, sections } of STORES) {
        for (const key of usedKeys(day, sections)) used.get(file)!.add(key);
      }
      const outRelPath = withoutLanguage(publication.outRelPath);
      days.set(outRelPath, day);
      const outPath = join(outputDir, toOutputPath(outRelPath));
      await ensureDir(outPath, mkdirCache);
      await writeFile(outPath, stringifyOutput(sortSections(compactSections(day))), "utf-8");
      written++;
    } catch (err) {
      errors++;
      consola.error(`Error processing ${publication.relPath}:`, (err as Error).message);
    }
  }
  const published: Record<string, Entries> = {
    [NAME_STORE]: storeSubset(names, new Set(Object.keys(names))),
  };
  for (const { file } of STORES) {
    published[file] = storeSubset(baseStores[file]!, used.get(file)!);
  }
  await writeStores(BASE_LANGUAGE, published);

  // Each translation, as stores keyed by the base language's keys.
  for (const [lang, publications] of byLanguage) {
    if (lang === BASE_LANGUAGE) continue;
    const stores = await readStores(lang);
    const renderings: Rendering[] = [];
    let unmatched = 0;
    for (const publication of publications) {
      try {
        const mass = await massOf(inputDir, publication);
        const day = days.get(withoutLanguage(publication.outRelPath));
        if (day === undefined) {
          if (hasMassContent(mass)) unmatched++;
          continue;
        }
        renderings.push(...renderingsOf(day, mass, stores, baseStores));
      } catch (err) {
        errors++;
        consola.error(`Error processing ${publication.relPath}:`, (err as Error).message);
      }
    }
    const chosen = chooseRenderings(renderings);
    await writeStores(lang, chosen);
    const rendered = Object.values(chosen).reduce((n, s) => n + Object.keys(s).length, 0);
    consola.info(
      `Step 12: ${lang} renders ${rendered} texts; ` +
        `${unmatched} of its days the base language does not publish`
    );
  }

  const martyrology = await publishMartyrology(
    inputDir,
    outputDir,
    [...allRelPaths].sort(),
    mkdirCache
  );

  consola.info(
    `Step 12: ${written} days written, ${skipped} without mass content, ` +
      `${martyrology} of the Martyrology`
  );
  if (errors > 0) consola.error(`Step 12 errors: ${errors}`);

  return { written: written + martyrology };
}
