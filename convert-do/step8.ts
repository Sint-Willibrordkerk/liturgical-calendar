import { join, dirname } from "path";
import { readFile, writeFile } from "fs/promises";

import { consola } from "consola";
import {
  collectYmlFiles,
  ensureDir,
  runBatched,
  DEFAULT_CONCURRENCY,
} from "./lib/batch";
import { isVariantArray, type Variant } from "./lib/variants";
import { STEP_EXT, parseStep, stringifyStep } from "./lib/serialize.js";
import { toKebabFileName } from "./step7";

/**
 * Step 8 — split commemorations into their own files (ported from step12).
 *
 * `commemoratio-oratio` / `-secreta` / `-postcommunio` sections (any rubric
 * variant) are pulled out of each document. Their first line (`!Pro S. …`)
 * names the commemorated saint; the remaining lines become that saint's file
 * (`<dir>/<slug>.yml` with `name`/`oratio`/`secreta`/`postcommunio`). The main
 * file is rewritten without the commemoratio keys. Multiple documents that
 * commemorate the same saint in the same directory merge into one file.
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

/** Batch runner: writes stripped main files plus per-saint commemoration files. */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const allRelPaths = await collectYmlFiles(inputDir);
  const mkdirCache = new Set<string>();

  const byOutputKey = new Map<
    string,
    { dir: string; slug: string } & Omit<Commemoration, "slug">
  >();
  const toWriteMain: { relPath: string; content: string }[] = [];

  const { errors: readErrors } = await runBatched(
    allRelPaths,
    DEFAULT_CONCURRENCY,
    async (relPath) => {
      const raw = await readFile(join(inputDir, relPath), "utf-8");
      let obj: Record<string, unknown>;
      try {
        obj = parseStep(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      const dir = dirname(relPath);
      for (const {
        slug,
        displayName,
        oratio,
        secreta,
        postcommunio,
      } of extractCommemorations(obj)) {
        const outKey = `${dir}/${slug}`;
        if (!byOutputKey.has(outKey)) {
          byOutputKey.set(outKey, {
            dir,
            slug,
            displayName,
            oratio,
            secreta,
            postcommunio,
          });
        } else {
          const existing = byOutputKey.get(outKey)!;
          if (oratio.length) existing.oratio = oratio;
          if (secreta.length) existing.secreta = secreta;
          if (postcommunio.length) existing.postcommunio = postcommunio;
          if (displayName) existing.displayName = displayName;
        }
      }
      toWriteMain.push({
        relPath,
        content: stringifyStep(withoutCommemoratioKeys(obj)),
      });
    }
  );

  if (readErrors > 0) consola.error(`Step 8 read errors: ${readErrors}`);

  let written = 0;
  for (const { relPath, content } of toWriteMain) {
    const outPath = join(outputDir, relPath);
    await ensureDir(outPath, mkdirCache);
    await writeFile(outPath, content, "utf-8");
    written++;
  }
  for (const { dir, slug, displayName, oratio, secreta, postcommunio } of byOutputKey.values()) {
    const outRelPath =
      dir && dir !== "." ? `${dir}/${slug}${STEP_EXT}` : `${slug}${STEP_EXT}`;
    const outPath = join(outputDir, outRelPath);
    const doc = { name: displayName, oratio, secreta, postcommunio };
    await ensureDir(outPath, mkdirCache);
    await writeFile(outPath, stringifyStep(doc), "utf-8");
    written++;
  }

  return { written };
}
