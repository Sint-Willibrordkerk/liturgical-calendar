import { join, dirname } from "path";
import { readFile, writeFile } from "fs/promises";
import { parse, stringify } from "yaml";
import { consola } from "consola";
import {
  collectYmlFiles,
  ensureDir,
  runBatched,
  DEFAULT_CONCURRENCY,
} from "./lib/batch";
import { Step6Output } from "./step6";
import { isVariantArray, type Variant } from "./lib/variants";

/**
 * Step 7 — derive filenames from the liturgical name (ported from step11).
 *
 * Content transform: fold `rank`/`officium` into `name` (first `;;`-part for
 * rank), keep everything else. Sections remain rubric-variant lists
 * (`{ value, condition }[]`); the name is derived per variant. Filenames: each
 * document is written once per distinct kebab-cased name found across its
 * `name`/`officium`/`rank` variants; collisions within a directory are
 * disambiguated by original stem.
 */
export type Step7Output = { [key: string]: unknown };

/** Order-independent key for a rubric condition set. */
function conditionKey(condition: string[]): string {
  return [...condition].sort().join("|");
}

/** First non-empty line of a variant's value. */
function nameFromLines(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const s = value.find((v) => typeof v === "string" && v.trim() !== "");
  return s != null ? (s as string).trim() : null;
}

/** The name part of a rank variant — text before the first `;;` of its first line. */
function rankNameFromLines(value: unknown): string | null {
  const first = nameFromLines(value);
  if (first == null) return null;
  const part = first.split(";;")[0];
  return part != null && part.trim() !== "" ? part.trim() : null;
}

/** Invalid filename characters (Windows): replaced with `-`. */
const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

export function toKebabFileName(s: unknown): string | null {
  if (s == null) return null;
  let t = String(s).trim().toLowerCase().replace(/\s+/g, "-");
  t = t.replace(INVALID_FILE_CHARS, "-");
  t = t.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return t === "" ? null : t;
}

/** Every distinct kebab filename derivable from the name/officium/rank variants. */
export function getAllDisplayNames(
  obj: unknown,
  originalStem: string
): string[] {
  const kebabs = new Set<string>();
  const add = (s: string | null) => {
    const k = toKebabFileName(s);
    if (k) kebabs.add(k);
  };
  if (obj == null || typeof obj !== "object") return [originalStem];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (!isVariantArray(value)) continue;
    if (key === "name" || key === "officium") {
      for (const variant of value) add(nameFromLines(variant.value));
    } else if (key === "rank") {
      for (const variant of value) add(rankNameFromLines(variant.value));
    }
  }
  if (kebabs.size === 0) return [originalStem];
  return [...kebabs];
}

/**
 * Content transform: fold `rank`/`officium`/`name` into a `name` section (a
 * rubric-variant list of the derived name), dropping the originals. An explicit
 * `name` wins; otherwise the first non-empty of rank/officium per condition.
 * Exported for the streaming/batch runner and for tests.
 */
export function transform(obj: Step6Output): Step7Output {
  const out: Step7Output = {};
  const nameByCondition = new Map<string, Variant<string[]>>();

  const addNames = (
    value: unknown,
    extract: (lines: unknown) => string | null,
    override: boolean
  ) => {
    if (!isVariantArray(value)) return;
    for (const variant of value) {
      const name = extract(variant.value);
      if (!name) continue;
      const k = conditionKey(variant.condition);
      if (override || !nameByCondition.has(k)) {
        nameByCondition.set(k, { value: [name], condition: variant.condition });
      }
    }
  };

  // Fill from rank/officium (first non-empty per condition), then let an
  // explicit `name` override.
  for (const [key, value] of Object.entries(obj)) {
    if (key === "rank") addNames(value, rankNameFromLines, false);
    else if (key === "officium") addNames(value, nameFromLines, false);
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key === "name") addNames(value, nameFromLines, true);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "name" || key === "rank" || key === "officium") continue;
    out[key] = value;
  }
  if (nameByCondition.size) out.name = [...nameByCondition.values()];
  return out;
}

function getStem(relPath: string): string {
  const base = relPath.replace(/^.*[/\\]/, "");
  return base.replace(/\.yml$/i, "") || base;
}

type CollisionEntry = {
  targetBasename: string;
  originalStem: string;
  relPath: string;
  content: string;
};

export function resolveCollisions(
  entries: CollisionEntry[]
): { relPath: string; finalBasename: string; content: string }[] {
  const byBasename = new Map<string, Omit<CollisionEntry, "targetBasename">[]>();
  for (const { targetBasename, originalStem, relPath, content } of entries) {
    if (!byBasename.has(targetBasename)) byBasename.set(targetBasename, []);
    byBasename.get(targetBasename)!.push({ originalStem, relPath, content });
  }
  const result: { relPath: string; finalBasename: string; content: string }[] =
    [];
  for (const [base, list] of byBasename) {
    const byContent = new Map<string, (typeof list)[number]>();
    for (const entry of list) {
      if (!byContent.has(entry.content)) byContent.set(entry.content, entry);
    }
    const uniq = [...byContent.values()];
    if (uniq.length === 1) {
      result.push({
        relPath: uniq[0]!.relPath,
        finalBasename: base,
        content: uniq[0]!.content,
      });
    } else {
      for (const { originalStem, relPath, content } of uniq) {
        result.push({
          relPath,
          finalBasename: `${base}-${originalStem}`,
          content,
        });
      }
    }
  }
  return result;
}

/** Batch runner: reads all `.yml` under `inputDir`, writes name-based files to `outputDir`. */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const allRelPaths = await collectYmlFiles(inputDir);
  const mkdirCache = new Set<string>();

  const shared: (CollisionEntry & { dir: string })[] = [];
  const { errors: readErrors } = await runBatched(
    allRelPaths,
    DEFAULT_CONCURRENCY,
    async (relPath) => {
      const raw = await readFile(join(inputDir, relPath), "utf-8");
      const obj = parse(raw);
      const originalStem = getStem(relPath);
      const dir = dirname(relPath);
      for (const targetBasename of getAllDisplayNames(obj, originalStem)) {
        shared.push({ relPath, dir, targetBasename, originalStem, content: raw });
      }
    }
  );

  if (readErrors > 0) {
    consola.error(`Step 7 read errors: ${readErrors}`);
  }

  const byDir = new Map<string, (CollisionEntry & { dir: string })[]>();
  for (const item of shared) {
    if (!byDir.has(item.dir)) byDir.set(item.dir, []);
    byDir.get(item.dir)!.push(item);
  }

  let written = 0;
  for (const [, entries] of byDir) {
    for (const { relPath, finalBasename, content } of resolveCollisions(
      entries
    )) {
      const dir = dirname(relPath);
      const outRelPath =
        dir && dir !== "."
          ? `${dir}/${finalBasename}.yml`
          : `${finalBasename}.yml`;
      const outPath = join(outputDir, outRelPath);
      const transformed = transform(parse(content) as Step6Output);
      await ensureDir(outPath, mkdirCache);
      await writeFile(outPath, stringify(transformed), "utf-8");
      written++;
    }
  }

  return { written };
}
