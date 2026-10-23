import { copyFile, readFile, writeFile } from "fs/promises";
import { join } from "path";

import { collectYmlFiles, ensureDir } from "./batch.js";
import { STEP_EXT, parseStep, stringifyStep } from "./serialize.js";

/**
 * The stores at each language root, from step 6 on: the readings, the prayers
 * and the chants the day files refer to by key, and the Office's hymns,
 * chapters, responsories and versicles. They travel with the tree — every later
 * step carries them forward to its own output.
 */
export const STORE_NAMES = [
  "lectio",
  "oratio",
  "antiphona",
  "hymnus",
  "capitulum",
  "responsorium",
  "versus",
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export type StoreEntries = Record<string, Record<string, unknown>>;

/** True for a store file: one of the stores, directly at a language root. */
export function isStoreFile(relPath: string): boolean {
  const parts = relPath.split(/[/\\]/);
  return (
    parts.length === 2 &&
    STORE_NAMES.some((name) => parts[1] === name + STEP_EXT)
  );
}

/** Every document under `dirPath`, as relative paths — the stores excluded. */
export async function collectDocumentFiles(dirPath: string): Promise<string[]> {
  return (await collectYmlFiles(dirPath)).filter((rel) => !isStoreFile(rel));
}

/** The language a relative path sits under, e.g. `la/Sancti/x.json` -> `la`. */
export function languageOf(relPath: string): string {
  return relPath.split(/[/\\]/)[0] ?? "";
}

/** One store of one language; empty where the tree carries none. */
export async function readStore(
  dirPath: string,
  language: string,
  name: StoreName
): Promise<StoreEntries> {
  try {
    const raw = await readFile(join(dirPath, language, name + STEP_EXT), "utf-8");
    return (parseStep(raw) ?? {}) as StoreEntries;
  } catch {
    return {};
  }
}

/** Write one store of one language. */
export async function writeStore(
  dirPath: string,
  language: string,
  name: StoreName,
  entries: StoreEntries,
  mkdirCache: Set<string>
): Promise<void> {
  const path = join(dirPath, language, name + STEP_EXT);
  await ensureDir(path, mkdirCache);
  await writeFile(path, stringifyStep(entries), "utf-8");
}

/**
 * Carry every store under `inputDir` forward to `outputDir` unchanged, except
 * those named in `skip` — which the step writes itself.
 */
export async function copyStores(
  inputDir: string,
  outputDir: string,
  skip: ReadonlySet<StoreName> = new Set()
): Promise<void> {
  const mkdirCache = new Set<string>();
  for (const rel of await collectYmlFiles(inputDir)) {
    if (!isStoreFile(rel)) continue;
    const name = rel.split(/[/\\]/)[1]!.slice(0, -STEP_EXT.length) as StoreName;
    if (skip.has(name)) continue;
    const target = join(outputDir, rel);
    await ensureDir(target, mkdirCache);
    await copyFile(join(inputDir, rel), target);
  }
}
