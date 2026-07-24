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
import { isVariantArray } from "./lib/variants";
import type { LectioEntries } from "./step10";

/**
 * Step 11 — the Mass propers.
 *
 * The last step, and the only one whose output leaves the pipeline. It narrows
 * the tree to what the calendar consumes, so the Divine Office — by far the
 * larger part — is not carried into the published assets. Section content keeps
 * the rubric-variant shape: which variant applies is a question for whoever
 * renders a given day, not for the pipeline.
 */
export type Step11Output = { [key: string]: unknown };

/** The Mass sections proper — a document needs one of these to be worth writing. */
const MASS_SECTIONS = new Set([
  "introitus",
  "oratio",
  "lectio",
  "graduale",
  "gradualep",
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
 * observed, and step 9 has already lifted `prefatio` out of it; past that
 * nothing in the propers refers to it, so it is dropped here rather than
 * published.
 */
const SUPPORTING_SECTIONS = new Set(["title", "name", "prefatio"]);

/** The sections holding a reading, and so possibly a key into `lectio.yml`. */
const READING_SECTIONS = new Set(["lectio", "evangelium", "ultima-evangelium"]);

/** The sections holding a prayer, and so possibly a key into `oratio.yml`. */
const PRAYER_SECTIONS = new Set(["oratio", "secreta", "postcommunio"]);

/** The sections holding a chant, and so possibly a key into `antiphona.yml`. */
const CHANT_SECTIONS = new Set([
  "introitus",
  "graduale",
  "gradualep",
  "tractus",
  "offertorium",
  "communio",
]);

/** The stores a language ships, and which sections draw on each. */
export const STORES = [
  { file: "lectio", sections: READING_SECTIONS },
  { file: "oratio", sections: PRAYER_SECTIONS },
  { file: "antiphona", sections: CHANT_SECTIONS },
] as const;

/**
 * The rubric systems a variant can be conditioned on: the editions, the orders
 * and usages, and (matched separately) the local ones. A token outside this set
 * says *when* a text applies rather than under whose rubrics — `octava`,
 * `adventus`, `feria-4`, `commemoratio` — and belongs to every system.
 */
const RUBRIC_SYSTEMS = new Set([
  "1570", "1617", "1888", "1906", "1910", "1913", "1930", "1939",
  "1951", "1955", "1962", "1963", "2020",
  "monastica", "cisterciensis", "praedicatorum", "altovadensis",
  "divino", "summorum", "trident", "barroux",
]);

/** The publishable rubric system: the one the shipped calendar follows. */
export const PUBLISHED_RUBRIC = "1962";

/** True when `token` names a rubric system other than the one in force. */
export function isOtherRubricSystem(token: string, inForce: string): boolean {
  // Sources vary in capitalisation, and a stray `^` survives from the condition
  // grammar; compare on the bare lowercase word.
  const bare = token.replace(/^[\^]/, "").trim().toLowerCase();
  if (bare === inForce.toLowerCase()) return false;
  if (/^(dioecesis|civitate)\s/.test(bare)) return true;
  return RUBRIC_SYSTEMS.has(bare) || RUBRIC_SYSTEMS.has(bare.replace(/^rubrica/, ""));
}

/**
 * Drop the variants that require a rubric system other than the one published.
 * They could never be chosen for that calendar, so shipping them would ship
 * unreachable content. A section left with no variants is dropped with them.
 */
export function keepPublishedRubric(
  obj: Record<string, unknown>,
  inForce: string = PUBLISHED_RUBRIC
): Step11Output {
  const out: Step11Output = {};
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
  "gradualep",
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
export function sortSections(obj: Record<string, unknown>): Step11Output {
  const rank = (key: string) => SECTION_RANK.get(key) ?? SECTION_ORDER.length;
  const keys = Object.keys(obj).sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: Step11Output = {};
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
export function compactSections(obj: Record<string, unknown>): Step11Output {
  const out: Step11Output = {};
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
export function keepMassSections(obj: Record<string, unknown>): Step11Output {
  const out: Step11Output = {};
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
export function usedKeys(
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
export function storeSubset(
  store: LectioEntries,
  keys: Set<string>
): LectioEntries {
  const out: LectioEntries = {};
  for (const key of [...keys].sort()) {
    const entry = store[key];
    if (entry !== undefined) out[key] = entry;
  }
  return out;
}

/**
 * The trees holding days. A calendar asks for the propers of a day, and only
 * these two hold them.
 *
 * `Commune` is a base for other days rather than a day: step 4 has already
 * resolved the borrowings, so the commons' texts reach the calendar through the
 * days that use them. The rest — `Ordo`, `Psalterium` and the like — are the
 * Office, not the propers.
 */
const DAY_TREES = new Set(["Sancti", "Tempora"]);

/** True when a document's tree is published. */
export function isPublishedTree(relPath: string): boolean {
  const tree = relPath.split(/[/\\]/)[1];
  return tree !== undefined && DAY_TREES.has(tree);
}

/** The language root a relative path sits under, e.g. `la/Sancti/x.yml` -> `la`. */
function languageRoot(relPath: string): string {
  const [first] = relPath.split(/[/\\]/);
  return first ?? "";
}

/**
 * Batch runner: reads the step 10 tree under `inputDir` and writes the Mass
 * propers to `outputDir`, with a `lectio.yml` per language holding only the
 * readings those propers name.
 */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const allRelPaths = await collectYmlFiles(inputDir);
  const mkdirCache = new Set<string>();

  const byLanguage = new Map<string, string[]>();
  for (const relPath of [...allRelPaths].sort()) {
    // The stores are read per language and subset, not copied wholesale.
    const base = relPath.replace(/^.*[/\\]/, "");
    if (STORES.some(({ file }) => file + STEP_EXT === base)) continue;
    if (!isPublishedTree(relPath)) continue;
    const lang = languageRoot(relPath);
    if (!byLanguage.has(lang)) byLanguage.set(lang, []);
    byLanguage.get(lang)!.push(relPath);
  }

  let written = 0;
  let skipped = 0;
  let errors = 0;

  for (const [lang, relPaths] of byLanguage) {
    const stores = new Map<string, LectioEntries>();
    const used = new Map<string, Set<string>>();
    for (const { file } of STORES) {
      used.set(file, new Set());
      try {
        const raw = await readFile(
          join(inputDir, lang, file + STEP_EXT),
          "utf-8"
        );
        stores.set(file, (parseStep(raw) ?? {}) as LectioEntries);
      } catch {
        consola.warn(`Step 11: no ${file} store for ${lang}`);
        stores.set(file, {});
      }
    }

    for (const relPath of relPaths) {
      try {
        const raw = await readFile(join(inputDir, relPath), "utf-8");
        const obj = parseStep(raw);
        if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
          throw new Error("Expected object");
        }
        const mass = keepPublishedRubric(
          keepMassSections(obj as Record<string, unknown>)
        );
        if (!hasMassContent(mass)) {
          skipped++;
          continue;
        }
        for (const { file, sections } of STORES) {
          for (const key of usedKeys(mass, sections)) used.get(file)!.add(key);
        }

        const outPath = join(outputDir, toOutputPath(relPath));
        await ensureDir(outPath, mkdirCache);
        await writeFile(outPath, stringifyOutput(sortSections(compactSections(mass))), "utf-8");
        written++;
      } catch (err) {
        errors++;
        consola.error(`Error processing ${relPath}:`, (err as Error).message);
      }
    }

    for (const { file } of STORES) {
      const storePath = join(outputDir, lang, file + ".yml");
      await ensureDir(storePath, mkdirCache);
      await writeFile(
        storePath,
        stringifyOutput(storeSubset(stores.get(file)!, used.get(file)!)),
        "utf-8"
      );
    }
  }

  consola.info(`Step 11: ${written} written, ${skipped} without mass content`);
  if (errors > 0) consola.error(`Step 11 errors: ${errors}`);

  return { written };
}
