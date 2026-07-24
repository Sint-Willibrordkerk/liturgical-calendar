import { join, dirname } from "path";
import { readFile, writeFile } from "fs/promises";

import { consola } from "consola";
import {
  collectYmlFiles,
  ensureDir,
  runBatched,
  DEFAULT_CONCURRENCY,
} from "./lib/batch";
import { Step6Output } from "./step6";
import { isVariantArray } from "./lib/variants";
import { STEP_EXT, stripStepExt, parseStep, stringifyStep } from "./lib/serialize.js";

/**
 * Step 7 — derive filenames from the liturgical name (ported from step11).
 *
 * Each document is written once per distinct kebab-cased name found across its
 * `name`/`officium`/`rank` variants, and each file is named after the one it was
 * written for. Other sections keep the rubric-variant shape. Collisions within a
 * directory are disambiguated by original stem.
 */
export type Step7Output = { [key: string]: unknown };

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

/**
 * A liturgical name as a filename. Kept in step with the calendar's lookup
 * (`titleToFileName` in the asset loader) — both must agree or a day fails to
 * find its file.
 *
 * - accents are folded, so `Adriáni` files and looks up as `adriani`;
 * - dots and commas are dropped, so `S. Adriani, Martyris` → `s-adriani-martyris`;
 * - a leading honorific segment — `s`, `ss`, `b` or `bb`, being `S.`/`Ss.`/`B.`/
 *   `Bb.` once their dots are gone — is dropped, so the file is named for the
 *   saints rather than the honorific: `adriani-martyris`,
 *   `fabiani-et-sebastiani`.
 */
export function toKebabFileName(s: unknown): string | null {
  if (s == null) return null;
  let t = String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, "")
    .replace(/[^a-z0-9æœ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(ss?|bb?)-/, "");
  return t === "" ? null : t;
}

/**
 * A file the document yields: its filename, and how the celebration it holds is
 * designated — `title` from `officium`, `name` from `name`.
 */
export type NameCandidate = {
  key: string;
  title: string | null;
  name: string | null;
};

/** Order-independent key for a rubric condition set. */
function conditionKey(condition: string[]): string {
  return [...condition].sort().join("|");
}

/** How a celebration is designated under one rubric condition. */
type Designation = {
  officium: string | null;
  name: string | null;
  rank: string | null;
};

/** Gather `officium`, `name` and `rank` per rubric condition. */
function designationsByCondition(obj: unknown): Map<string, Designation> {
  const byCondition = new Map<string, Designation>();
  const at = (condition: string[]): Designation => {
    const k = conditionKey(condition);
    let d = byCondition.get(k);
    if (!d) {
      d = { officium: null, name: null, rank: null };
      byCondition.set(k, d);
    }
    return d;
  };

  if (obj == null || typeof obj !== "object") return byCondition;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (!isVariantArray(value)) continue;
    if (key === "officium") {
      for (const v of value) at(v.condition).officium ??= nameFromLines(v.value);
    } else if (key === "name") {
      for (const v of value) at(v.condition).name ??= nameFromLines(v.value);
    } else if (key === "rank") {
      for (const v of value) at(v.condition).rank ??= rankNameFromLines(v.value);
    }
  }
  return byCondition;
}

/**
 * Every file the document yields.
 *
 * A celebration is designated under each of its rubrics, and each designation
 * becomes a file carrying that one — `S. Adriani, Martyris` in the Cistercian
 * use, `S. Hadriani Martyris` in the Roman — rather than whichever the rubrics
 * later leave standing.
 *
 * Where a condition has both an `officium` and a `name`, the **officium** names
 * the file: it is the formal designation, and the `name` is the short form that
 * belongs inside it. `rank` still names a file of its own, since it often
 * carries the specific feast where the officium gives only a generic one.
 *
 * A file's `title` is the designation it is filed under, so it never contradicts
 * its own filename.
 */
export function collectNames(
  obj: unknown,
  originalStem: string
): NameCandidate[] {
  const byKey = new Map<string, NameCandidate>();

  for (const { officium, name, rank } of designationsByCondition(obj).values()) {
    const sources: { text: string | null; title: string | null }[] = [
      { text: officium, title: officium },
      { text: rank, title: rank },
      // The `name` files on its own only where no officium outranks it, and is
      // titled by the rank if the source gave one.
      officium ? { text: null, title: null } : { text: name, title: rank },
    ];
    for (const { text, title } of sources) {
      const key = toKebabFileName(text);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, { key, title, name });
    }
  }

  // With no designation at all the original stem names the file, and the file
  // designates nothing.
  if (byKey.size === 0) {
    return [{ key: originalStem, title: null, name: null }];
  }
  return [...byKey.values()];
}

/** Every distinct kebab filename derivable from the name/officium/rank variants. */
export function getAllDisplayNames(
  obj: unknown,
  originalStem: string
): string[] {
  return collectNames(obj, originalStem).map(({ key }) => key);
}

/**
 * Content transform: drop `rank`, `officium` and `name`, and designate the
 * document as the file being written — `title` from the officium, `name` from
 * the name.
 *
 * A document is written under every designation it yields, so these belong to
 * the file rather than to the document: each file says which celebration it
 * holds, and the others are files of their own. Only what the source gave is
 * emitted, so a file with no officium carries no `title`.
 *
 * Designating it here also keeps these out of the rubric conditions, where a
 * name given only under one use — `Adriáni`, in the Cistercian — would later be
 * dropped along with that use.
 */
export function transform(
  obj: Step6Output,
  designation?: { title?: string | null; name?: string | null }
): Step7Output {
  const out: Step7Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "name" || key === "rank" || key === "officium") continue;
    out[key] = value;
  }
  if (designation?.title) out.title = designation.title;
  if (designation?.name) out.name = designation.name;
  return out;
}

function getStem(relPath: string): string {
  const base = relPath.replace(/^.*[/\\]/, "");
  return stripStepExt(base) || base;
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
      const obj = parseStep(raw) as Record<string, unknown>;
      const originalStem = getStem(relPath);
      const dir = dirname(relPath);
      for (const { key, title, name } of collectNames(obj, originalStem)) {
        shared.push({
          relPath,
          dir,
          targetBasename: key,
          originalStem,
          content: stringifyStep(
            transform(obj as Step6Output, { title, name })
          ),
        });
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
          ? `${dir}/${finalBasename}${STEP_EXT}`
          : `${finalBasename}${STEP_EXT}`;
      const outPath = join(outputDir, outRelPath);
      await ensureDir(outPath, mkdirCache);
      // Already selected, folded and serialized when the names were collected.
      await writeFile(outPath, content, "utf-8");
      written++;
    }
  }

  return { written };
}
