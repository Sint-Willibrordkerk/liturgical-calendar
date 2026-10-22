import { join } from "path";
import { readFile, writeFile } from "fs/promises";

import { applyIncludes } from "./condition.js";
import { SEP, escapeRegExp, splitPath } from "./lib/paths.js";
import { directoryMappings, mappings } from "./lib/mappings.js";
import { DEFAULT_CONCURRENCY, ensureDir, runBatched } from "./lib/batch.js";
import { STEP_EXT, parseStep, stringifyStep } from "./lib/serialize.js";
import { collectDocumentFiles, copyStores } from "./lib/stores.js";
import { unionDocuments } from "./lib/variants.js";
import { KEYED_RULES } from "./lib/broad.js";
import { SOURCES, locate } from "./step4.js";

/**
 * Step 8 — directory and filename suffixes to rubric conditions.
 *
 * Combines the Office and the Mass of each day into one document, reads the
 * rubric a file stands for from its directory and filename, adds it to every
 * variant's condition, and folds the variant files of a day onto one path.
 * Both kinds of reference have been resolved by now (steps 4 and 7), so a
 * reference to a variant file found its own file.
 */
type FoldVariant = { value: unknown; condition: string[] };
export type Step8Output = { [key: string]: FoldVariant[] };

const WHITESPACE = /\s+/g;

function toKebabCase(str: string) {
  const result = str.toLowerCase().trim().replace(WHITESPACE, "-");
  return result.startsWith("-") ? result.slice(1) : result;
}

function splitSuffix(input: string) {
  const parts = splitPath(input.split(".").at(-2)!);
  let file = parts.pop()!.replace("Ferua", "Feria");
  if (file === "Epi1-0") file = "Epi1-0r";
  if (file === "Epi1-0a") file = "Epi1-0";
  return {
    file,
    dir: parts.pop()!,
  };
}

/**
 * A filename marking a commemoration kept on a day: `…cc`, and `…octt` for one
 * kept during an octave.
 *
 * A commemoration is a celebration in its own right, with its own collect and
 * lessons — the day it falls on merely keeps it. Its file therefore stays on its
 * own path rather than folding onto the day's, which would merge one saint's
 * texts into another feast's file.
 *
 * Because the file stands alone, it does not carry `commemoratio` as a rubric
 * condition either: the token existed to tell the commemoration's variants apart
 * from the day's once they shared a file, and nothing shares a file now.
 */
export function isCommemorationFile(file: string): boolean {
  return /(?:cc|octt)$/.test(file);
}

const excludedFiles = [
  "Coronatio",
  "10-DU",
  "10-DP",
  "07-DP",
  "11-03sec",
  "00-VB",
  "00-VE",
  "09-DP",
  "09-DT",
  // The Martyrology's movable days, named for no date.
  "Mobile",
];

export function getOutputFile(input: string) {
  // The `horas`/`missa` root has already been stripped by step 2; here we only
  // fold a variant directory onto its base and strip the filename suffix.
  let output = input;
  const { file, dir } = splitSuffix(input);

  for (const directory of ["Commune", "Martyrologium", "Sancti", "Tempora"]) {
    if (!dir.startsWith(directory)) continue;

    if (dir !== directory) {
      output = output.replace(
        new RegExp(`(${SEP})${escapeRegExp(dir)}(${SEP})`),
        `$1${directory}$2`
      );
    }

    if (excludedFiles.includes(file)) break;
    // A commemoration is its own celebration, kept alongside the day rather
    // than part of it. Folding it onto the day's path would merge someone
    // else's collect and lessons into the feast.
    if (isCommemorationFile(file)) break;

    let suffixLength = 0;
    while (
      file[file.length - suffixLength - 1]! < "0" ||
      file[file.length - suffixLength - 1]! > "9"
    ) {
      suffixLength++;
      if (["10-DU"].includes(file)) break;
    }
    if (suffixLength > 0)
      output = output.replace(`${file.slice(-suffixLength)}${STEP_EXT}`, STEP_EXT);
  }
  return output;
}

export function transform(obj: Step8Output, inputFile: string): Step8Output {
  let { file, dir } = splitSuffix(inputFile);
  const standsAlone = isCommemorationFile(file);

  const result: Step8Output = {};
  const includes: string[] = [];

  for (const directory of ["Commune", "Martyrologium", "Sancti", "Tempora"]) {
    if (!dir.startsWith(directory)) continue;

    if (dir !== directory) {
      includes.push(
        directoryMappings[
          toKebabCase(
            dir.replace(directory, "")
          ) as keyof typeof directoryMappings
        ]
      );
    }

    if (excludedFiles.includes(file)) break;

    if (file.includes("Feria")) {
      const match = file.match(/(\d+)Feria/);
      includes.push(`feria-${Number(match![1]) + 1}`);
      file = file.replace("Feria", "");
    }

    let hasChanged;
    do {
      hasChanged = false;
      for (const [suffix, value] of mappings) {
        if (file.endsWith(suffix)) {
          includes.push(...value);
          file = file.slice(0, -suffix.length);
          hasChanged = true;
        }
      }
    } while (hasChanged);

    if (["10-DU"].includes(file)) continue;

    let suffixLength = 0;
    while (
      file[file.length - suffixLength - 1]! < "0" ||
      file[file.length - suffixLength - 1]! > "9"
    ) {
      suffixLength++;
    }

    if (suffixLength > 0) {
      throw new Error(`Suffix is not supported: ${file}`);
    }
  }

  // A commemoration keeps its own path, so the marker lives in the name rather
  // than in a condition no rubric would ever satisfy.
  const tokens = standsAlone
    ? includes.filter((token) => token !== "commemoratio")
    : includes;

  Object.entries(obj).forEach(([key, value]) => {
    value.forEach((item) => {
      // Combine the path-derived tokens with the variant's own condition
      // (from step 1 header conditions) rather than replacing it, so a variant
      // keeps its identity. This keeps the result independent of whether step 2
      // (combine mass and hours) was materialized separately before step 3.
      const condition = [...new Set([...item.condition, ...tokens])];
      result[key] = applyIncludes(
        condition,
        [],
        item.value as string[],
        (result[key] ?? []) as { value: string[]; condition: string[] }[]
      );
    });
  });

  return result;
}

/** Order-independent key for a rubric condition set. */
function conditionKey(condition: string[]): string {
  return [...condition].sort().join("|");
}

/**
 * Fold one more document onto a path already holding `earlier`. Their
 * sections are unioned by condition, so no base or variant content is dropped;
 * on a condition collision the earlier document — first in path order, so the
 * base file before its variants — wins.
 */
export function mergeDocuments(earlier: Step8Output, later: Step8Output): Step8Output {
  // The earlier document's sections and variants come first, so a folded day
  // reads in path order — its base file, then its variants. The order matters
  // beyond looks: step 9 files a translation by the order of the base
  // language's designations.
  const merged: Step8Output = { ...earlier };
  for (const [key, value] of Object.entries(later)) {
    const own = merged[key];
    if (Array.isArray(own) && Array.isArray(value)) {
      // On a collision the earlier file wins: the base file, where it gives a
      // variant for the use explicitly — 7 December's `[Rank] (rubrica
      // cisterciensis)` — over a variant file's.
      const held = new Set(own.map((variant) => conditionKey(variant.condition)));
      merged[key] = [
        ...own,
        ...value.filter((variant) => !held.has(conditionKey(variant.condition))),
      ];
    } else {
      merged[key] = own ?? value;
    }
  }
  return merged;
}

/**
 * Combine a day's Office (`low`) and Mass (`high`): unioned by condition, the
 * Mass winning a collision. A section step 5 lifted out of another — the
 * Alleluia out of the Gradual, the Preface out of the rule — goes with its
 * parent: where the Mass's Gradual stands for a condition, the Office's
 * Alleluia for that condition is not taken either, as it would not have been
 * when it was still part of the Office's Gradual.
 */
export function combineSources(low: Step8Output, high: Step8Output): Step8Output {
  const trimmed: Step8Output = { ...low };
  for (const [lifted, parent] of Object.entries(KEYED_RULES.liftedFrom)) {
    const own = high[parent];
    const variants = trimmed[lifted];
    if (!Array.isArray(own) || !Array.isArray(variants)) continue;
    const held = new Set(own.map((variant) => conditionKey(variant.condition)));
    const kept = variants.filter((variant) => !held.has(conditionKey(variant.condition)));
    if (kept.length > 0) trimmed[lifted] = kept;
    else delete trimmed[lifted];
  }
  return unionDocuments(trimmed, high) as Step8Output;
}

/**
 * A document's path without its source: `la/missa/Sancti/01-01.json` →
 * `la/Sancti/01-01.json`.
 */
export function withoutSource(relPath: string): string {
  const parts = relPath.split(/[/\\]/);
  return [parts[0], ...parts.slice(2)].join("/");
}

/**
 * Batch runner. First the Office and the Mass of each day are combined into one
 * document — they resolved their own references, and are one day from here on;
 * the Mass wins a collision. Then the variant files of a day are folded onto one
 * path. The stores are carried forward unchanged.
 */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  // Unfolded path → its documents, Office before Mass, so the Mass wins.
  const days = new Map<string, string[]>();
  const sourceRank = (rel: string) => SOURCES.indexOf(locate(rel).source as (typeof SOURCES)[number]);
  for (const rel of (await collectDocumentFiles(inputDir)).sort()) {
    const day = withoutSource(rel);
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(rel);
  }
  for (const rels of days.values()) rels.sort((x, y) => sourceRank(x) - sourceRank(y));

  // Folded path → the unfolded days landing on it, in path order.
  const groups = new Map<string, string[]>();
  for (const day of [...days.keys()].sort()) {
    const out = getOutputFile(day);
    if (!groups.has(out)) groups.set(out, []);
    groups.get(out)!.push(day);
  }

  const mkdirCache = new Set<string>();
  const { processed, errors } = await runBatched(
    [...groups.entries()],
    DEFAULT_CONCURRENCY,
    async ([out, dayPaths]) => {
      let folded: Step8Output | undefined;
      for (const day of dayPaths) {
        let combined: Step8Output | undefined;
        for (const rel of days.get(day)!) {
          const doc = parseStep(await readFile(join(inputDir, rel), "utf-8")) as Step8Output;
          combined = combined === undefined ? doc : combineSources(combined, doc);
        }
        const conditioned = transform(combined!, day);
        folded = folded === undefined ? conditioned : mergeDocuments(folded, conditioned);
      }
      const outPath = join(outputDir, out);
      await ensureDir(outPath, mkdirCache);
      await writeFile(outPath, stringifyStep(folded), "utf-8");
    }
  );
  // A file whose name carries a suffix no rubric is known for stops the run:
  // folding it under a guessed name would merge it into the wrong day.
  if (errors > 0) throw new Error(`Step 8: ${errors} files could not be folded`);

  await copyStores(inputDir, outputDir);
  return { written: processed };
}
