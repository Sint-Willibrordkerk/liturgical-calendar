#!/usr/bin/env node
import { consola } from "consola";
import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm, access } from "fs/promises";
import { constants } from "fs";

import { SEP_RE } from "./lib/paths.js";

import {
  DIVINUM_OFFICIUM_BASE,
  getInputFiles as getStep0InputFiles,
  getOutputFile as getStep0OutputFile,
  transform as step0Transform,
  type Step0Output,
} from "./step0.js";
import { Step1Output, transform as step1Transform } from "./step1.js";
import {
  transform as step2Transform,
  getOutputFile as getStep2OutputFile,
  type Step2Output,
} from "./step2.js";
import { transform as step3Transform, type Step3Output } from "./step3.js";
import {
  Step4Output,
  extractDependencies,
  transform as step4Transform,
} from "./step4.js";
import { transform as step5Transform, type Step5Output } from "./step5.js";
import {
  transform as step6Transform,
  getOutputFile as getStep6OutputFile,
  type Step6Output,
} from "./step6.js";
import { run as runStep7 } from "./step7.js";
import { run as runStep8 } from "./step8.js";
import { run as runStep9 } from "./step9.js";
import { run as runStep10 } from "./step10.js";
import { run as runStep11 } from "./step11.js";
import { STEP_EXT, parseStep, stringifyStep } from "./lib/serialize.js";

const PROJECT_BASE = process.cwd();
const STEP_BASE = join(PROJECT_BASE, ".divinum-officium");
const MISSING_DEPENDENCY_ERROR = "Missing dependency";

/**
 * The language the sources are written in, and the one a translation falls back
 * on for what it does not translate.
 */
const BASE_LANGUAGE = "la";

/**
 * Highest step handled by the in-memory streaming runner. Later steps (7–11)
 * are directory-level batch operations (fan-out / cross-file merges / shared
 * files) and run against materialized `step{N-1}` folders instead.
 */
const STREAMING_MAX_STEP = 6;

/**
 * Steps after which the streaming pass must materialize a checkpoint. One
 * checkpoint after step 4 is enough: it materializes the **unfolded** step4
 * tree (variant directories still separate). Broad references (step 4) resolve
 * against it within the first segment (dependency-gated); inline references
 * (step 5) read that same complete step4 tree in the next segment — so both
 * find variant files like `SanctiM/11-14M`. The fold (step 6) then runs in that
 * same later segment without needing its own checkpoint.
 */
const STREAMING_CHECKPOINTS = [4];

/** Batch steps (directory-level fan-out / cross-file merges). */
const BATCH_STEPS: Record<
  number,
  (inputDir: string, outputDir: string) => Promise<{ written: number }>
> = {
  7: runStep7,
  8: runStep8,
  9: runStep9,
  10: runStep10,
  11: runStep11,
};

export async function getInputFiles(fromStep: number): Promise<{
  directories: string[];
  files: string[];
}> {
  if (fromStep === 0) {
    return getStep0InputFiles();
  } else {
    const inputDir = join(STEP_BASE, "step" + (fromStep - 1));
    return readdir(inputDir, {
      recursive: true,
      withFileTypes: true,
    }).then((entries) =>
      entries.reduce(
        (acc, entry) => {
          if (entry.isDirectory()) {
            acc.directories.push(entry.name);
          } else if (entry.isFile()) {
            acc.files.push(
              join(entry.parentPath.replace(inputDir, ""), entry.name)
            );
          }
          return acc;
        },
        { directories: [] as string[], files: [] as string[] }
      )
    );
  }
}

async function readInput(
  outputDir: string,
  fromStep: number,
  toStep: number,
  force: boolean
): Promise<{
  total: number;
  map: Map<string, string[]>;
  outputDirectories: Set<string>;
  cachedFiles: Set<string>;
}> {
  const inputFiles = await getInputFiles(fromStep);
  const result = new Map<string, string[]>();
  const cachedFiles = new Set<string>();
  for (const inputFile of inputFiles.files) {
    let output = join(outputDir, inputFile);
    if (fromStep <= 0 && toStep >= 0) output = getStep0OutputFile(output);
    // Step 2 strips the horas/missa root (combining mass and hours); step 6
    // folds variant directories and strips filename suffixes. Both collapse
    // several inputs onto one output path, which the runner then merges. Step 6
    // folds late — after the reference steps (4–5) — so references resolve
    // while variant directories are still separate files.
    if (fromStep <= 2 && toStep >= 2) output = getStep2OutputFile(output);
    if (fromStep <= 6 && toStep >= 6) output = getStep6OutputFile(output);
    if (!result.has(output)) {
      result.set(output, []);
    }
    result.get(output)!.push(inputFile);
  }
  const total = result.size;
  for (const output of result.keys()) {
    if (!force && (await outputExists(output))) {
      result.delete(output);
      cachedFiles.add(output);
    }
  }
  const outputDirectories = new Set(
    [...result.keys()].map((outputPath) => dirname(outputPath))
  );

  return { total, map: result, outputDirectories, cachedFiles };
}

type MergeVariant = { value: unknown; condition: string[] };

/** A section value shaped as rubric variants (`{ value, condition }[]`). */
function isVariantArray(value: unknown): value is MergeVariant[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item != null &&
        typeof item === "object" &&
        "value" in item &&
        Array.isArray((item as MergeVariant).condition)
    )
  );
}

/** Union two variant lists by condition; `high` wins on a condition collision. */
function mergeVariants(
  low: MergeVariant[],
  high: MergeVariant[]
): MergeVariant[] {
  const byCondition = new Map<string, MergeVariant>();
  for (const variant of [...low, ...high]) {
    byCondition.set([...variant.condition].sort().join("|"), variant);
  }
  return [...byCondition.values()];
}

/**
 * The same document in the base language, as step 4 wrote it.
 *
 * `undefined` where the document is already in the base language, or already
 * has a rank of its own.
 */
export function baseLanguagePath(
  outputFile: string,
  hasRank: boolean
): string | undefined {
  if (hasRank) return undefined;
  const parts = outputFile.replace(STEP_BASE, "").split(SEP_RE);
  const language = parts[2];
  if (language === undefined || language === BASE_LANGUAGE) return undefined;
  parts[2] = BASE_LANGUAGE;
  return join(STEP_BASE, ...parts.slice(1));
}

/** The document with the base language's rank, where it has none of its own. */
async function borrowRank(
  data: Step3Output,
  outputFile: string,
  requireDependencies: boolean
): Promise<Step3Output | undefined> {
  const path = baseLanguagePath(
    outputFile,
    (data as Record<string, unknown>)["rank"] !== undefined
  );
  if (path === undefined) return undefined;
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    // Not written yet: wait for it, the way any other dependency is waited on.
    // Once the queue stalls the wait is given up and the day keeps its own.
    if (requireDependencies) {
      throw new Error(`${MISSING_DEPENDENCY_ERROR}: ${BASE_LANGUAGE} rank`);
    }
    return undefined;
  }
  const rank = (parseStep(raw) as Step3Output)["rank"];
  return rank === undefined ? undefined : ({ ...data, rank } as Step3Output);
}

async function processInputFiles(
  outputFile: string,
  inputFiles: string[],
  fromStep: number,
  toStep: number,
  fileCache: Set<string>,
  requireDependencies: boolean
) {
  let result;
  for (const inputFile of inputFiles) {
    let data;
    if (fromStep === 0) {
      data = await readFile(join(DIVINUM_OFFICIUM_BASE!, inputFile), "utf-8");
    } else {
      data = await readFile(
        join(STEP_BASE, "step" + (fromStep - 1), inputFile),
        "utf-8"
      ).then((raw) => parseStep(raw) as any);
    }

    if (fromStep <= 0 && toStep >= 0) data = step0Transform(data as string);
    if (fromStep <= 1 && toStep >= 1)
      data = step1Transform(data as Step0Output, inputFile);
    if (fromStep <= 2 && toStep >= 2)
      data = step2Transform(data as Step1Output);
    if (fromStep <= 3 && toStep >= 3) {
      data = step3Transform(data as Step2Output, inputFile);
    }
    if (fromStep <= 4 && toStep >= 4) {
      // A translation says the texts of a day, not how the day is celebrated:
      // most translated files carry no rank at all. The rank is where a day
      // names the common it draws its Mass from, so without it the day borrows
      // nothing and comes out empty — even where the common itself has been
      // translated. It is taken from the Latin, which is the one tree that
      // always has it; the sections it then borrows are the translation's own.
      const borrowed = await borrowRank(
        data as Step3Output,
        outputFile,
        requireDependencies
      );
      if (borrowed !== undefined) data = borrowed;
      // Keyed by language as well as path. A reference names a file within the
      // same language, so a document that has been written in one language does
      // not mean the same document exists in another — and taking it as such
      // lets a document proceed before the file it borrows from is there,
      // leaving the borrowed sections quietly absent.
      const cache = [...fileCache].map((item) =>
        item
          .replace(STEP_BASE, "")
          .split(SEP_RE)
          .slice(2)
          .join("/")
          .replace(STEP_EXT, "")
      );
      if (requireDependencies) {
        const language = outputFile
          .replace(STEP_BASE, "")
          .split(SEP_RE)
          .slice(2, 3)
          .join("");
        const dependencies = extractDependencies(
          data as Step3Output,
          outputFile
        );
        for (const dependency of dependencies) {
          if (!cache.includes(`${language}/${dependency}`)) {
            throw new Error(`${MISSING_DEPENDENCY_ERROR}: ${dependency}`);
          }
        }
      }
      data = await step4Transform(data as Step3Output, outputFile);
    }
    if (fromStep <= 5 && toStep >= 5) {
      // Inline `@File:Section` references resolve against the fully-materialized,
      // still-unfolded step4 tree (variant directories separate). The resolver
      // is lenient and leaves anything it cannot resolve in place.
      data = await step5Transform(
        data as Step4Output,
        join(STEP_BASE, "step4", inputFile)
      );
    }
    if (fromStep <= 6 && toStep >= 6) {
      data = step6Transform(data as Step5Output, inputFile);
    }

    if (!result) {
      result = data;
    } else {
      // Multiple input files map to this output: horas + missa (combined by
      // step 2), plus the variant directories (TemporaOP, SanctiCist, …) that
      // step 6 folds into their base. Union their section variants by condition
      // so no base or variant content is dropped; missa wins on a condition
      // collision. A shallow spread kept only one file's variants per shared
      // section, silently losing e.g. the conditionless base text that rubric
      // variants reference.
      const dataIsPriority = inputFile.includes("missa");
      const [low, high] = dataIsPriority ? [result, data] : [data, result];
      const merged: any = { ...low };
      for (const [key, highVal] of Object.entries(high)) {
        const lowVal = merged[key];
        merged[key] =
          isVariantArray(lowVal) && isVariantArray(highVal)
            ? mergeVariants(lowVal, highVal)
            : highVal;
      }
      // Flat (post-step-6) rule arrays are plain string lists, not variants;
      // keep the original union for that shape.
      const flatRuleA =
        Array.isArray(data.rule) && !isVariantArray(data.rule) ? data.rule : [];
      const flatRuleB =
        Array.isArray(result.rule) && !isVariantArray(result.rule)
          ? result.rule
          : [];
      if (flatRuleA.length || flatRuleB.length)
        merged.rule = [...new Set([...flatRuleA, ...flatRuleB])];
      result = merged;
    }
  }
  await writeFile(outputFile, stringifyStep(result), "utf-8");
  fileCache.add(outputFile);
}

async function outputExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runWorkers(
  queue: [string, string[]][],
  fromStep: number,
  toStep: number,
  fileCache: Set<string>,
  total: number,
  requireDependencies = true
) {
  let processed = 0;
  const failures = new Set<[string, string[]]>();
  const missing = new Map<string, string>();

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      const [outputFile, inputs] = item;
      try {
        await processInputFiles(
          outputFile,
          inputs,
          fromStep,
          toStep,
          fileCache,
          requireDependencies
        );
        processed++;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith(MISSING_DEPENDENCY_ERROR)) {
          missing.set(outputFile, err.message.split(": ")[1] ?? "");
          failures.add(item);
          continue;
        }
        consola.log(
          `completion percentage: ${((processed / total) * 100).toFixed(2)}%`
        );
        consola.error(
          `Error processing ${inputs.join(", ")}:`,
          (err as Error).message
        );
        throw err;
      }
    }
  }
  await Promise.all(Array(1).fill(0).map(worker));
  return { processed, failures, missing };
}

async function createDirectories(outputDirectories: Set<string>) {
  consola.start(`Creating ${outputDirectories.size} directories...`);
  for (const outputDirectory of outputDirectories) {
    await mkdir(outputDirectory, { recursive: true });
  }
  consola.success(`Directories created.`);
}

async function executePipeline(
  fromStep: number,
  toStep: number,
  outputDir: string,
  force: boolean
) {
  const {
    map: byOutput,
    total,
    outputDirectories,
    cachedFiles,
  } = await readInput(outputDir, fromStep, toStep, force);

  if (force) {
    await rm(outputDir, { recursive: true, force: true });
  }
  await createDirectories(outputDirectories);

  const queue = [...byOutput.entries()];
  let processed = 0;
  let workersResult = {
    processed: 0,
    failures: new Set<[string, string[]]>(),
    missing: new Map<string, string>(),
  };

  do {
    workersResult = await runWorkers(
      queue,
      fromStep,
      toStep,
      cachedFiles,
      total
    );
    processed += workersResult.processed;
    queue.push(...workersResult.failures);
  } while (workersResult.processed > 0);

  // What is left cannot be ordered: either two documents wait on each other —
  // the Vigil of Pentecost and its rubric file each borrow from the other — or
  // the reference names a file the sources do not carry. Waiting longer will
  // not help, and dropping the document loses a day of the calendar, so the
  // gate comes off and they are written with whatever they could not resolve
  // left in place. That is what a reference resolves to elsewhere in the
  // pipeline when it cannot be followed.
  const stalled = [...workersResult.failures];
  if (stalled.length > 0) {
    for (const [outputFile] of stalled) {
      consola.warn(
        `Written unresolved, ${workersResult.missing.get(outputFile) ?? "a dependency"} never arrived: ${outputFile}`
      );
    }
    const forced = await runWorkers(
      stalled,
      fromStep,
      toStep,
      cachedFiles,
      total,
      false
    );
    processed += forced.processed;
    return { processed, errors: forced.failures.size };
  }

  return { processed, errors: 0 };
}

/** Run one batch step: rebuild `step{step}` from the materialized `step{step-1}`. */
async function runBatchStep(step: number): Promise<void> {
  const fn = BATCH_STEPS[step];
  if (!fn) throw new Error(`No batch step registered for step ${step}`);

  const inputDir = join(STEP_BASE, "step" + (step - 1));
  const outputDir = join(STEP_BASE, "step" + step);

  consola.start(`Step ${step}: ${inputDir} → ${outputDir}`);
  // Batch steps fan out / merge across files, so they always fully rebuild.
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const { written } = await fn(inputDir, outputDir);
  consola.success(`Step ${step} done: ${written} files.`);
}

export async function runPipeline(
  fromStep: number,
  toStep: number,
  force: boolean
) {
  const stepRange =
    fromStep === toStep ? `step ${fromStep}` : `steps ${fromStep}-${toStep}`;
  consola.box(`Converting Divinum Officium files\n\nProcessing ${stepRange}`);

  // Streaming portion (steps 0..STREAMING_MAX_STEP). Split into segments at the
  // checkpoints so each reference step reads a materialized, correctly-staged
  // tree; each segment materializes its own `step{to}` folder.
  if (fromStep <= STREAMING_MAX_STEP) {
    const streamingTo = Math.min(toStep, STREAMING_MAX_STEP);
    const segmentEnds = [
      ...STREAMING_CHECKPOINTS.filter((c) => c >= fromStep && c < streamingTo),
      streamingTo,
    ];

    let segmentFrom = fromStep;
    let processed = 0;
    let errors = 0;
    for (const segmentTo of segmentEnds) {
      const outputDir = join(STEP_BASE, "step" + segmentTo);
      consola.info(`Streaming steps ${segmentFrom}-${segmentTo} → ${outputDir}`);
      consola.info(
        `Force: ${
          force
            ? "yes (cleaning output folder)"
            : "no (skipping existing outputs)"
        }`
      );
      const result = await executePipeline(
        segmentFrom,
        segmentTo,
        outputDir,
        force
      );
      processed += result.processed;
      errors += result.errors;
      segmentFrom = segmentTo + 1;
    }

    consola.success(`Streaming pipeline done.`);
    consola.info(`Processed: ${processed} files`);
    consola.info(`Errors: ${errors}`);
  }

  // Batch portion (steps STREAMING_MAX_STEP+1 .. toStep).
  for (
    let step = Math.max(fromStep, STREAMING_MAX_STEP + 1);
    step <= toStep;
    step++
  ) {
    await runBatchStep(step);
  }
}
