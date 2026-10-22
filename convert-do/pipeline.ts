#!/usr/bin/env node
import { consola } from "consola";
import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm, access } from "fs/promises";
import { constants } from "fs";

import {
  DIVINUM_OFFICIUM_BASE,
  getInputFiles as getStep0InputFiles,
  getOutputFile as getStep0OutputFile,
  transform as step0Transform,
  type Step0Output,
} from "./step0.js";
import { type Step1Output, transform as step1Transform } from "./step1.js";
import {
  transform as step2Transform,
  getOutputFile as getStep2OutputFile,
  type Step2Output,
} from "./step2.js";
import { transform as step3Transform } from "./step3.js";
import { run as runStep4 } from "./step4.js";
import { run as runStep5 } from "./step5.js";
import { run as runStep6 } from "./step6.js";
import { run as runStep7 } from "./step7.js";
import { run as runStep8 } from "./step8.js";
import { run as runStep9 } from "./step9.js";
import { run as runStep10 } from "./step10.js";
import { run as runStep11 } from "./step11.js";
import { run as runStep12 } from "./step12.js";
import { parseStep, stringifyStep } from "./lib/serialize.js";

const PROJECT_BASE = process.cwd();
const STEP_BASE = join(PROJECT_BASE, ".divinum-officium");

/** The last step. */
export const LAST_STEP = 12;

/**
 * Highest step handled by the in-memory streaming runner. These steps read only
 * the file in front of them. From step 4 on a step reads other files — to
 * resolve a reference, or to file a text into a per-language store — so those
 * run as directory-level batch passes against the materialized `step{N-1}`.
 */
const STREAMING_MAX_STEP = 3;

/** Batch steps (directory-level passes). */
const BATCH_STEPS: Record<
  number,
  (inputDir: string, outputDir: string) => Promise<{ written: number }>
> = {
  4: runStep4,
  5: runStep5,
  6: runStep6,
  7: runStep7,
  8: runStep8,
  9: runStep9,
  10: runStep10,
  11: runStep11,
  12: runStep12,
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
  map: Map<string, string>;
  outputDirectories: Set<string>;
}> {
  const inputFiles = await getInputFiles(fromStep);
  const result = new Map<string, string>();
  for (const inputFile of inputFiles.files) {
    let output = join(outputDir, inputFile);
    if (fromStep <= 0 && toStep >= 0) output = getStep0OutputFile(output);
    // Step 2 files the Mass and the Office of a day below their language,
    // side by side; each input still has an output of its own.
    if (fromStep <= 2 && toStep >= 2) output = getStep2OutputFile(output);
    result.set(output, inputFile);
  }
  for (const output of result.keys()) {
    if (!force && (await outputExists(output))) result.delete(output);
  }
  const outputDirectories = new Set(
    [...result.keys()].map((outputPath) => dirname(outputPath))
  );

  return { map: result, outputDirectories };
}

async function processInputFile(
  outputFile: string,
  inputFile: string,
  fromStep: number,
  toStep: number
) {
  let data: any;
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
  if (fromStep <= 2 && toStep >= 2) data = step2Transform(data as Step1Output);
  if (fromStep <= 3 && toStep >= 3)
    data = step3Transform(data as Step2Output, inputFile);

  await writeFile(outputFile, stringifyStep(data), "utf-8");
}

async function outputExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The streaming steps read only the file in front of them, so the outputs are
 * independent and processed in parallel.
 */
const STREAMING_CONCURRENCY = 32;

async function executePipeline(
  fromStep: number,
  toStep: number,
  outputDir: string,
  force: boolean
) {
  const { map: byOutput, outputDirectories } = await readInput(
    outputDir,
    fromStep,
    toStep,
    force
  );

  if (force) {
    await rm(outputDir, { recursive: true, force: true });
  }
  consola.start(`Creating ${outputDirectories.size} directories...`);
  for (const outputDirectory of outputDirectories) {
    await mkdir(outputDirectory, { recursive: true });
  }

  const queue = [...byOutput.entries()];
  let processed = 0;
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      const [outputFile, input] = item;
      try {
        await processInputFile(outputFile, input, fromStep, toStep);
        processed++;
      } catch (err) {
        consola.error(`Error processing ${input}:`, (err as Error).message);
        throw err;
      }
    }
  }
  await Promise.all(Array(STREAMING_CONCURRENCY).fill(0).map(worker));
  return { processed };
}

/** Run one batch step: rebuild `step{step}` from the materialized `step{step-1}`. */
async function runBatchStep(step: number): Promise<void> {
  const fn = BATCH_STEPS[step];
  if (!fn) throw new Error(`No batch step registered for step ${step}`);

  const inputDir = join(STEP_BASE, "step" + (step - 1));
  const outputDir = join(STEP_BASE, "step" + step);

  consola.start(`Step ${step}: ${inputDir} → ${outputDir}`);
  // Batch steps read across files, so they always fully rebuild.
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

  // Streaming portion (steps 0..STREAMING_MAX_STEP), written once to its last
  // step's folder.
  if (fromStep <= STREAMING_MAX_STEP) {
    const streamingTo = Math.min(toStep, STREAMING_MAX_STEP);
    const outputDir = join(STEP_BASE, "step" + streamingTo);
    consola.info(`Streaming steps ${fromStep}-${streamingTo} → ${outputDir}`);
    consola.info(
      `Force: ${
        force ? "yes (cleaning output folder)" : "no (skipping existing outputs)"
      }`
    );
    const { processed } = await executePipeline(fromStep, streamingTo, outputDir, force);
    consola.success(`Streaming pipeline done: ${processed} files.`);
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
