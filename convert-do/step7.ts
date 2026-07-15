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

/**
 * Step 7 — derive filenames from the liturgical name (ported from step11).
 *
 * Content transform: fold `rank`/`officium` into `name` (first `;;`-part for
 * rank), keep everything else. Filenames: each document is written once per
 * distinct kebab-cased name found across its `name`/`officium`/`rank`
 * variants; collisions within a directory are disambiguated by original stem.
 */
export type Step7Output = { [key: string]: unknown };

/** Invalid filename characters (Windows): replaced with `-`. */
const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

function firstString(val: unknown): string | null {
  if (typeof val === "string" && val.trim() !== "") return val.trim();
  if (Array.isArray(val)) {
    const s = val.find((v) => typeof v === "string" && v.trim() !== "");
    return s != null ? (s as string).trim() : null;
  }
  return null;
}

function getRankFirstPart(rank: unknown): string | null {
  let s: string | null | undefined = Array.isArray(rank)
    ? (rank.find((v) => typeof v === "string" && v.trim() !== "") as
        | string
        | undefined)
    : typeof rank === "string"
    ? rank
    : null;
  if (s == null) return null;
  s = String(s).trim();
  const first = s.split(";;")[0];
  return first != null && first.trim() !== "" ? first.trim() : null;
}

export function toKebabFileName(s: unknown): string | null {
  if (s == null) return null;
  let t = String(s).trim().toLowerCase().replace(/\s+/g, "-");
  t = t.replace(INVALID_FILE_CHARS, "-");
  t = t.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return t === "" ? null : t;
}

export function getAllDisplayNames(
  obj: unknown,
  originalStem: string
): string[] {
  const kebabs = new Set<string>();
  const add = (s: unknown) => {
    const k = toKebabFileName(s);
    if (k) kebabs.add(k);
  };
  if (obj == null || typeof obj !== "object") return [originalStem];
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const value = (obj as Record<string, unknown>)[key];
    if (key === "name" || key.startsWith("name/")) {
      add(firstString(value));
    } else if (key === "officium" || key.startsWith("officium/")) {
      if (Array.isArray(value)) {
        const first = value.find(
          (v) => typeof v === "string" && v.trim() !== ""
        );
        if (first != null) add((first as string).trim());
      } else if (typeof value === "string") add(value);
    } else if (key === "rank" || key.startsWith("rank/")) {
      add(getRankFirstPart(value));
    }
  }
  if (kebabs.size === 0) return [originalStem];
  return [...kebabs];
}

/**
 * Content transform: `rank`/`officium` → `name` (string), drop rank/officium.
 * Exported for the streaming/batch runner and for tests.
 */
export function transform(obj: Step6Output): Step7Output {
  const out: Step7Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "rank" || key.startsWith("rank/")) {
      const nameKey = key === "rank" ? "name" : "name/" + key.slice("rank/".length);
      if (out[nameKey] === undefined || out[nameKey] === "") {
        out[nameKey] = getRankFirstPart(value) ?? "";
      }
      continue;
    }
    if (key === "name" || key.startsWith("name/")) {
      out[key] = firstString(value) ?? "";
      continue;
    }
    if (key === "officium" || key.startsWith("officium/")) {
      const nameKey =
        key === "officium" ? "name" : "name/" + key.slice("officium/".length);
      if (out[nameKey] === undefined || out[nameKey] === "") {
        out[nameKey] = firstString(value) ?? "";
      }
      continue;
    }
    out[key] = value;
  }
  for (const k of Object.keys(out)) {
    if ((k === "name" || k.startsWith("name/")) && out[k] === "") delete out[k];
  }
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
