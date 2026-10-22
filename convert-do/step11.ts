import { join } from "path";
import { readFile, writeFile } from "fs/promises";

import { DEFAULT_CONCURRENCY, ensureDir, runBatched } from "./lib/batch.js";
import { isVariantArray, type Variant } from "./lib/variants.js";
import { parseStep, stringifyStep } from "./lib/serialize.js";
import { collectDocumentFiles, copyStores } from "./lib/stores.js";

/**
 * Step 11 — variant collapse.
 *
 * Every section drops the rubric variants that merely repeat its default
 * variant, so a variant survives only where the rubric actually changes
 * something. The covered sections hold keys by now, so they compare keys rather
 * than whole texts.
 */
export type Step11Output = { [key: string]: unknown };

/** True for the section's default (unconditional) variant. */
function isDefault(variant: Variant): boolean {
  return variant.condition.length === 0;
}

/**
 * Drop every variant whose value repeats the section's default. A section
 * without a default is left untouched: there would be nothing to fall back to,
 * so removing any of its variants would change which rubrics resolve to which
 * content.
 */
export function collapseVariants(obj: Record<string, unknown>): Step11Output {
  const out: Step11Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!isVariantArray(value)) {
      out[key] = value;
      continue;
    }
    const fallback = value.find(isDefault);
    if (fallback === undefined) {
      out[key] = value;
      continue;
    }
    const fallbackValue = JSON.stringify(fallback.value);
    out[key] = value.filter(
      (variant) =>
        variant === fallback || JSON.stringify(variant.value) !== fallbackValue
    );
  }
  return out;
}

/** Batch runner: collapses every document, and carries the stores forward. */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const mkdirCache = new Set<string>();
  const { processed } = await runBatched(
    await collectDocumentFiles(inputDir),
    DEFAULT_CONCURRENCY,
    async (rel) => {
      const obj = parseStep(await readFile(join(inputDir, rel), "utf-8"));
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        throw new Error("Expected object");
      }
      const outPath = join(outputDir, rel);
      await ensureDir(outPath, mkdirCache);
      await writeFile(
        outPath,
        stringifyStep(collapseVariants(obj as Record<string, unknown>)),
        "utf-8"
      );
    }
  );
  await copyStores(inputDir, outputDir);
  return { written: processed };
}
