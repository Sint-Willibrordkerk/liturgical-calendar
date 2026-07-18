#!/usr/bin/env node
import { consola } from "consola";
import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm, access } from "fs/promises";
import { constants } from "fs";
import { parse, stringify } from "yaml";
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
import {
  transform as step5Transform,
  getOutputFile as getStep5OutputFile,
  type Step5Output,
} from "./step5.js";
import { transform as step6Transform, type Step6Output } from "./step6.js";
import { transform as step7Transform } from "./step7.js";
import { run as runStep8 } from "./step8.js";
import { run as runStep9 } from "./step9.js";
import { run as runStep10 } from "./step10.js";

const PROJECT_BASE = process.cwd();
const STEP_BASE = join(PROJECT_BASE, ".divinum-officium");
const MISSING_DEPENDENCY_ERROR = "Missing dependency";

/**
 * Highest step handled by the in-memory streaming runner. Later steps (8–10)
 * are directory-level batch operations (fan-out / cross-file merges) and run
 * against materialized `step{N-1}` folders instead.
 */
const STREAMING_MAX_STEP = 7;

/**
 * Steps after which the streaming pass must materialize a checkpoint, so a
 * later reference step reads a stable, correctly-staged tree from disk:
 * - after **4** — broad references resolve against the still-**unfolded**
 *   step4 tree (variant directories separate), so a reference like
 *   `SanctiM/11-14M` finds its own file. Folding it into the same pass would
 *   leave only the folded `Sancti/11-14` on disk.
 * - after **5** — inline references (step 6) read the folded step5 tree.
 */
const STREAMING_CHECKPOINTS = [4, 5];

/** Batch steps (directory-level fan-out / cross-file merges). */
const BATCH_STEPS: Record<
  number,
  (inputDir: string, outputDir: string) => Promise<{ written: number }>
> = {
  8: runStep8,
  9: runStep9,
  10: runStep10,
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
    // Step 2 strips the horas/missa root (combining mass and hours); step 5
    // folds variant directories and strips filename suffixes. Both collapse
    // several inputs onto one output path, which the runner then merges. Step 5
    // folds late — after the reference steps (3–4) — so references resolve
    // while variant directories are still separate files.
    if (fromStep <= 2 && toStep >= 2) output = getStep2OutputFile(output);
    if (fromStep <= 5 && toStep >= 5) output = getStep5OutputFile(output);
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

async function processInputFiles(
  outputFile: string,
  inputFiles: string[],
  fromStep: number,
  toStep: number,
  fileCache: Set<string>
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
      ).then(parse);
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
      const cache = [...fileCache].map((item) =>
        item
          .replace(STEP_BASE, "")
          .split(SEP_RE)
          .slice(3)
          .join("/")
          .replace(".yml", "")
      );
      const dependencies = extractDependencies(data as Step3Output, outputFile);
      for (const dependency of dependencies) {
        if (!cache.includes(dependency)) {
          throw new Error(MISSING_DEPENDENCY_ERROR);
        }
      }
      data = await step4Transform(data as Step3Output, outputFile);
    }
    if (fromStep <= 5 && toStep >= 5) {
      data = step5Transform(data as Step4Output, inputFile);
    }
    if (fromStep <= 6 && toStep >= 6) {
      // Unlike step 4, step 6 resolves its `@File:Section` references by
      // reading the already-complete step5 tree (below), not step6 output, so
      // it needs no dependency gate. Gating here would also wrongly block
      // references to variant directories (e.g. TemporaOP) that step 5 already
      // merged into their base, requeuing those files forever. The resolver is
      // lenient and leaves anything it cannot resolve in place.
      data = await step6Transform(
        data as Step5Output,
        join(STEP_BASE, "step5", inputFile)
      );
    }
    if (fromStep <= 7 && toStep >= 7)
      data = step7Transform(data as Step6Output);

    if (!result) {
      result = data;
    } else {
      // Multiple input files map to this output: horas + missa (combined by
      // step 2), plus the variant directories (TemporaOP, SanctiCist, …) that
      // step 3 folds into their base. Union their section variants by
      // condition so no base or
      // variant content is dropped; missa wins on a condition collision. A
      // shallow spread kept only one file's variants per shared section,
      // silently losing e.g. the conditionless base text that rubric variants
      // reference.
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
  await writeFile(outputFile, stringify(result), "utf-8");
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
  total: number
) {
  let processed = 0;
  const failures = new Set<[string, string[]]>();

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
          fileCache
        );
        processed++;
      } catch (err: unknown) {
        if (err instanceof Error && err.message === MISSING_DEPENDENCY_ERROR) {
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
  return { processed, failures };
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
  let workersResult = { processed: 0, failures: new Set<[string, string[]]>() };

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

  return { processed, errors: workersResult.failures.size };
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
