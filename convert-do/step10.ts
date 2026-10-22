import { join, dirname } from "path";
import { readFile, writeFile } from "fs/promises";

import { consola } from "consola";
import { ensureDir } from "./lib/batch.js";
import { isVariantArray, type Variant } from "./lib/variants.js";
import { STEP_EXT, parseStep, stringifyStep } from "./lib/serialize.js";
import {
  collectDocumentFiles,
  copyStores,
  languageOf,
  readStore,
  writeStore,
} from "./lib/stores.js";
import { toKebabFileName } from "./step9.js";
import { linesToPrayer } from "./step5.js";
import { createLectioStore, type LectioStore } from "./step6.js";

/**
 * Step 10 — split commemorations into their own files.
 *
 * `commemoratio-oratio` / `-secreta` / `-postcommunio` sections (any rubric
 * variant) are pulled out of each document. Their first line (`!Pro S. …`)
 * names the commemorated saint; the remaining lines become that saint's file
 * (`<dir>/<slug>.yml` with `name`/`oratio`/`secreta`/`postcommunio`). The main
 * file is rewritten without the commemoratio keys. Multiple documents that
 * commemorate the same saint in the same directory merge into one file.
 *
 * A saint's prayer first stands as a text of its own here, so it is structured
 * and filed into the prayer store step 6 opened, and the saint's file holds its
 * key — the store's second and last writer.
 */
export type Commemoration = {
  slug: string;
  displayName: string;
  oratio: Variant<string[]>[];
  secreta: Variant<string[]>[];
  postcommunio: Variant<string[]>[];
};

const COMMEMORATIO_PREFIX =
  /^commemoratio-(oratio|secreta|postcommunio)(?:\/.*)?$/;
const PRO_LINE = /^\s*!?\s*Pro\s+(.+)$/i;

export function commemorationNameToSlug(firstLine: unknown): string | null {
  if (!firstLine || typeof firstLine !== "string") return null;
  const m = firstLine.trim().match(PRO_LINE);
  if (!m) return null;
  const name = m[1]!.trim();
  if (!name) return null;
  // Named the same way every other file is, so a commemoration is found by the
  // same lookup — and so a name ending in a stop does not leave one behind.
  return toKebabFileName(name);
}

function getProDisplayName(firstLine: unknown): string {
  if (!firstLine || typeof firstLine !== "string") return "";
  let s = firstLine.trim().replace(/^!\s*/, "");
  if (/^Pro\s+/i.test(s)) s = s.replace(/^Pro\s+/i, "");
  return s || "";
}

/** Remove every `commemoratio-{oratio,secreta,postcommunio}` key (any variant). */
export function withoutCommemoratioKeys<T extends Record<string, unknown>>(
  obj: T
): Partial<T> {
  if (obj == null || typeof obj !== "object") return obj;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (COMMEMORATIO_PREFIX.test(key)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

export function extractCommemorations(
  obj: Record<string, unknown>
): Commemoration[] {
  if (obj == null || typeof obj !== "object") return [];
  const bySlug = new Map<
    string,
    {
      displayName: string;
      oratio: Variant<string[]>[];
      secreta: Variant<string[]>[];
      postcommunio: Variant<string[]>[];
    }
  >();
  for (const [key, value] of Object.entries(obj)) {
    const match = key.match(COMMEMORATIO_PREFIX);
    if (!match || !isVariantArray(value)) continue;
    const type = match[1] as "oratio" | "secreta" | "postcommunio";
    // Each rubric variant carries its own `!Pro …` header line and content.
    for (const variant of value) {
      const lines = variant.value;
      if (!Array.isArray(lines) || lines.length === 0) continue;
      const firstLine = lines[0];
      const slug = commemorationNameToSlug(
        typeof firstLine === "string" ? firstLine : String(firstLine)
      );
      if (!slug) continue;
      const displayName = getProDisplayName(firstLine);
      if (!bySlug.has(slug)) {
        bySlug.set(slug, { displayName, oratio: [], secreta: [], postcommunio: [] });
      }
      const entry = bySlug.get(slug)!;
      entry[type].push({ value: lines.slice(1) as string[], condition: variant.condition });
      if (displayName) entry.displayName = displayName;
    }
  }
  return [...bySlug.entries()].map(([slug, data]) => ({
    slug,
    displayName: data.displayName || slug,
    oratio: data.oratio,
    secreta: data.secreta,
    postcommunio: data.postcommunio,
  }));
}

/**
 * Transform a document into its commemoratio-free main object plus the list of
 * commemorations it contains. Exported for the runner and tests.
 */
export function transform(obj: Record<string, unknown>): {
  main: Record<string, unknown>;
  commemorations: Commemoration[];
} {
  return {
    main: withoutCommemoratioKeys(obj),
    commemorations: extractCommemorations(obj),
  };
}

/**
 * A saint's prayer variants, structured and filed: each variant holds the key of
 * its prayer in the store, or the structured prayer itself where it carries no
 * words to file.
 */
export function filePrayers(
  variants: Variant<string[]>[],
  store: LectioStore
): Variant[] {
  return variants.map(({ value, condition }) => {
    const prayer = linesToPrayer(value);
    return { value: store.intern(prayer) ?? prayer, condition };
  });
}

/**
 * Batch runner: writes the stripped main files plus one file per saint, whose
 * prayers are filed into the prayer store.
 *
 * Documents are read and the saints filed in sorted path order, so which
 * document's section wins a merge, and which key a prayer receives, are the same
 * on every run.
 */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const allRelPaths = (await collectDocumentFiles(inputDir)).sort();
  const mkdirCache = new Set<string>();

  const byOutputKey = new Map<
    string,
    { dir: string; slug: string } & Omit<Commemoration, "slug">
  >();
  let written = 0;
  let readErrors = 0;

  for (const relPath of allRelPaths) {
    let obj: Record<string, unknown>;
    try {
      obj = parseStep(await readFile(join(inputDir, relPath), "utf-8")) as Record<string, unknown>;
    } catch (err) {
      readErrors++;
      consola.error(`Error reading ${relPath}:`, (err as Error).message);
      continue;
    }
    const dir = dirname(relPath);
    for (const { slug, displayName, oratio, secreta, postcommunio } of extractCommemorations(obj)) {
      const outKey = `${dir}/${slug}`;
      const existing = byOutputKey.get(outKey);
      if (!existing) {
        byOutputKey.set(outKey, { dir, slug, displayName, oratio, secreta, postcommunio });
      } else {
        if (oratio.length) existing.oratio = oratio;
        if (secreta.length) existing.secreta = secreta;
        if (postcommunio.length) existing.postcommunio = postcommunio;
        if (displayName) existing.displayName = displayName;
      }
    }
    const outPath = join(outputDir, relPath);
    await ensureDir(outPath, mkdirCache);
    await writeFile(outPath, stringifyStep(withoutCommemoratioKeys(obj)), "utf-8");
    written++;
  }

  if (readErrors > 0) consola.error(`Step 10 read errors: ${readErrors}`);

  const stores = new Map<string, LectioStore>();
  const storeOf = async (language: string) => {
    let store = stores.get(language);
    if (!store) {
      store = createLectioStore(await readStore(inputDir, language, "oratio"));
      stores.set(language, store);
    }
    return store;
  };

  const saints = [...byOutputKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [, { dir, slug, displayName, oratio, secreta, postcommunio }] of saints) {
    const store = await storeOf(languageOf(dir));
    const outRelPath = dir && dir !== "." ? `${dir}/${slug}${STEP_EXT}` : `${slug}${STEP_EXT}`;
    const outPath = join(outputDir, outRelPath);
    const doc = {
      name: displayName,
      oratio: filePrayers(oratio, store),
      secreta: filePrayers(secreta, store),
      postcommunio: filePrayers(postcommunio, store),
    };
    await ensureDir(outPath, mkdirCache);
    await writeFile(outPath, stringifyStep(doc), "utf-8");
    written++;
  }

  // The prayer store is written with the saints' prayers added; every language
  // keeps its prayer store, whether or not it commemorates anyone.
  await copyStores(inputDir, outputDir, new Set(["oratio"]));
  const languages = new Set(allRelPaths.map(languageOf));
  for (const language of languages) {
    await writeStore(outputDir, language, "oratio", (await storeOf(language)).entries(), mkdirCache);
  }

  return { written };
}
