import { join } from "path";
import { writeFile } from "fs/promises";

import { KEYED_RULES, type Doc } from "./lib/broad.js";
import { DEFAULT_CONCURRENCY, ensureDir, runBatched } from "./lib/batch.js";
import { STEP_EXT, stringifyStep } from "./lib/serialize.js";
import { copyStores } from "./lib/stores.js";
import { documentsOf, languageResolver, readTree, transform } from "./step4.js";

/**
 * Step 7 — broad references.
 *
 * Resolves the whole-file includes (`@File`, `ex …`) and the selective borrows
 * (`vide …`). Every borrowed text is already in the store by now, so a borrowing
 * copies the key the borrowed section holds: a day drawing its Mass from a
 * common comes to hold the common's keys, and the text stays single.
 *
 * Runs before the fold (step 8), so a reference to a variant file such as
 * `@SanctiM/11-14M` finds a file of its own.
 */
export type Step7Output = Doc;

/** Batch runner: resolves every document's broad references, one language at a time. */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const tree = await readTree(inputDir);
  const mkdirCache = new Set<string>();
  let written = 0;

  for (const [language, languageTree] of tree) {
    // A translation takes the base language's rank, read from this same input:
    // no step before this one touches the rank, so it is always there, however
    // the base language's own borrowings turn out. The Office and the Mass of a
    // day resolve their own references, reading their targets with both
    // together.
    const { resolve, view } = languageResolver(tree, language, KEYED_RULES);
    // Visited in a fixed order: which side of a borrowing cycle borrows from the
    // other depends on which is reached first.
    const { processed } = await runBatched(
      documentsOf(languageTree),
      DEFAULT_CONCURRENCY,
      async ({ source, path }) => {
        const resolved = resolve(source, path)!;
        // A rank borrowed by reference is resolved only now, after the broad
        // references: it says how the day is kept, and the borrowings it names
        // belong to the day it was borrowed from.
        const out = { ...resolved, ...transform(resolved, path, view, new Set(["rank"])) };
        const outPath = join(outputDir, language, source, path + STEP_EXT);
        await ensureDir(outPath, mkdirCache);
        await writeFile(outPath, stringifyStep(out), "utf-8");
      }
    );
    written += processed;
  }

  // A borrowing copies keys and files no new text.
  await copyStores(inputDir, outputDir);
  return { written };
}
