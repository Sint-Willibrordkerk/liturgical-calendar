#!/usr/bin/env node
import dotenv from "dotenv";
import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm, access } from "fs/promises";
import { constants } from "fs";
import { parse, stringify } from "yaml";
import { parseArgs } from "util";

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
  Step2Output,
} from "./step2.js";
import { Step3Output, transform as step3Transform } from "./step3.js";
import { extractDependencies, transform as step4Transform } from "./step4.js";

dotenv.config();

const PROJECT_BASE = process.cwd();
/** Base dir for intermediate step output (used when --from > 1). */
const STEP_BASE = join(PROJECT_BASE, ".divinum-officium");
const MISSING_DEPENDENCY_ERROR = "Missing dependency";

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: "0" },
      to: { type: "string", default: "13" },
      step: { type: "string" },
      force: { type: "boolean", short: "f", default: false },
      strict: { type: "boolean", short: "s", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(`
Pipeline - Process files in streaming mode (in-memory, no intermediate files)

Usage: node pipeline.mjs [options]

Options:
  --from <step>     Start from step N (0-13, default: 0)
  --to <step>       Process up to step N (0-13, default: 13)
  --step <step>     Process only step N (shorthand for --from N --to N)
  -f, --force       Clean output folder and process all files (default: only process missing outputs)
  -s, --strict      Strict mode (default: false)
  -h, --help        Show this help

Examples:
  node pipeline.mjs                    # Full pipeline, output in step13/
  node pipeline.mjs --to 5             # Steps 1-5, output in step5/
  node pipeline.mjs --from 4 --to 8    # Steps 4-8, output in step8/
  node pipeline.mjs --step 7           # Only step 7, output in step7/
`);
    process.exit(0);
  }

  let fromStep, toStep;

  if (values.step) {
    const step = parseInt(values.step, 10);
    if (isNaN(step) || step < 0 || step > 13) {
      console.error(`Invalid --step value: ${values.step}. Must be 0-13.`);
      process.exit(1);
    }
    fromStep = step;
    toStep = step;
  } else {
    fromStep = parseInt(values.from, 10);
    toStep = parseInt(values.to, 10);

    if (isNaN(fromStep) || fromStep < 0 || fromStep > 13) {
      console.error(`Invalid --from value: ${values.from}. Must be 0-13.`);
      process.exit(1);
    }
    if (isNaN(toStep) || toStep < 0 || toStep > 13) {
      console.error(`Invalid --to value: ${values.to}. Must be 0-13.`);
      process.exit(1);
    }
    if (fromStep > toStep) {
      console.error(
        `--from (${fromStep}) cannot be greater than --to (${toStep}).`
      );
      process.exit(1);
    }
  }

  return {
    fromStep,
    toStep,
    force: !!values.force,
    strictMode: !!values.strict,
  };
}

async function ensureDir(filePath: string, mkdirCache: Set<string>) {
  const outDir = dirname(filePath);
  if (!mkdirCache.has(outDir)) {
    await mkdir(outDir, { recursive: true });
    mkdirCache.add(outDir);
  }
}

async function getInputFiles(fromStep: number): Promise<string[]> {
  if (fromStep === 0) {
    return getStep0InputFiles();
  } else {
    const inputDir = join(STEP_BASE, "step" + (fromStep - 1));
    const files = await readdir(inputDir, {
      recursive: true,
      withFileTypes: true,
    }).then((entries) =>
      entries
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath.replace(inputDir, ""), e.name))
    );
    return files.length > 0 ? files : getInputFiles(fromStep - 1);
  }
}

async function groupInputsByOutput(
  inputFiles: string[],
  outputDir: string,
  fromStep: number,
  toStep: number,
  force: boolean,
  fileCache: Set<string>
): Promise<{ total: number; map: Map<string, string[]> }> {
  const result = new Map<string, string[]>();
  for (const inputFile of inputFiles) {
    let output = join(outputDir, inputFile);
    if (fromStep <= 0 && toStep >= 0) output = getStep0OutputFile(output);
    if (fromStep <= 2 && toStep >= 2) output = getStep2OutputFile(output);
    if (!result.has(output)) {
      result.set(output, []);
    }
    result.get(output)!.push(inputFile);
  }
  const total = result.size;
  for (const output of result.keys()) {
    if (!force && (await outputExists(output))) {
      result.delete(output);
      fileCache.add(output);
    }
  }
  return { total, map: result };
}

async function processInputFiles(
  outputFile: string,
  inputFiles: string[],
  fromStep: number,
  toStep: number,
  mkdirCache: Set<string>,
  fileCache: Set<string>,
  strictMode: boolean
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
      data = step1Transform(data as Step0Output);
    if (fromStep <= 2 && toStep >= 2)
      data = step2Transform(data as Step1Output, inputFile);
    if (fromStep <= 3 && toStep >= 3) {
      data = step3Transform(data as Step2Output, inputFile);
    }
    if (fromStep <= 4 && toStep >= 4) {
      const dependencies = extractDependencies(data as Step3Output);
      for (const dependency of dependencies) {
        if (!fileCache.has(dependency)) {
          throw new Error(MISSING_DEPENDENCY_ERROR);
        }
      }
      data = await step4Transform(
        data as Step3Output,
        inputFile,
        join(STEP_BASE, "step3")
      );
    }
    // if (fromStep <= 5 && toStep >= 5) data = step5Transform(data);
    // if (fromStep <= 6 && toStep >= 6) data = step6Transform(data);

    if (!result) {
      result = data;
    } else {
      const hasPriority = inputFile.includes("missa");
      const merged: any = hasPriority
        ? { ...result, ...data }
        : { ...data, ...result };
      const ruleA = Array.isArray(data.rule) ? data.rule : [];
      const ruleB = Array.isArray(result?.rule) ? result.rule : [];
      if (ruleA.length || ruleB.length)
        merged.rule = [...new Set([...ruleA, ...ruleB])];
      result = merged;
    }
  }
  await ensureDir(outputFile, mkdirCache);
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

async function runStreaming(
  fromStep: number,
  toStep: number,
  force: boolean,
  strictMode: boolean
) {
  const outputDir = join(STEP_BASE, "step" + toStep);

  const stepRange =
    fromStep === toStep ? `step ${fromStep}` : `steps ${fromStep}-${toStep}`;
  console.log(`Streaming pipeline: processing ${stepRange}`);
  console.log(`Output: ${outputDir}`);
  if (!force) {
    console.log(
      "Incremental mode (no --force): skipping existing output files."
    );
  }

  const mkdirCache = new Set<string>();
  const fileCache = new Set<string>();
  const inputFiles = await getInputFiles(fromStep);
  const { map: byOutput, total } = await groupInputsByOutput(
    inputFiles,
    outputDir,
    fromStep,
    toStep,
    force,
    fileCache
  );
  let queue = [...byOutput.entries()];

  if (force) {
    await rm(outputDir, { recursive: true, force: true });
  }

  let processed = 0;
  let workersResult = { processed: 0, failures: new Set<[string, string[]]>() };

  while (workersResult.failures.size === 0 || workersResult.processed > 0) {
    workersResult = await runWorkers(
      queue,
      workersResult.failures,
      fromStep,
      toStep,
      mkdirCache,
      fileCache,
      strictMode,
      processed,
      total
    );
    processed += workersResult.processed;
    queue.push(...workersResult.failures);
  }

  const errors = workersResult.failures.size;

  console.log(`\nStreaming pipeline done.`);
  console.log(`  Processed: ${processed} files`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Output: ${outputDir}`);
}

async function runWorkers(
  queue: [string, string[]][],
  failures: Set<[string, string[]]>,
  fromStep: number,
  toStep: number,
  mkdirCache: Set<string>,
  fileCache: Set<string>,
  strictMode: boolean,
  processed: number,
  total: number
) {
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
          mkdirCache,
          fileCache,
          strictMode
        );
        processed++;
      } catch (err: unknown) {
        if (err instanceof Error && err.message === MISSING_DEPENDENCY_ERROR) {
          failures.add(item);
          continue;
        }
        console.log(
          `completion percentage: ${((processed / total) * 100).toFixed(2)}%`
        );
        console.error(
          `Error processing ${inputs.join(", ")}:`,
          (err as Error).message
        );
        throw err;
      }
    }
  }
  await Promise.all(Array(16).fill(0).map(worker));
  return { processed, failures };
}

async function main() {
  const args = parseCliArgs();
  await runStreaming(
    args.fromStep,
    args.toStep,
    args.force,
    args.strictMode
  ).catch((err) => {
    console.error("Pipeline error:", err);
    process.exit(1);
  });
}

main();
