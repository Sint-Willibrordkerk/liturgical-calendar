#!/usr/bin/env node
import { consola } from "consola";
import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm, access } from "fs/promises";
import { constants } from "fs";
import { parse, stringify } from "yaml";

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
import {
  Step4Output,
  extractDependencies,
  transform as step4Transform,
} from "./step4.js";
import {
  extractDependencies as extractStep5Dependencies,
  transform as step5Transform,
} from "./step5.js";

const PROJECT_BASE = process.cwd();
const STEP_BASE = join(PROJECT_BASE, ".divinum-officium");
const MISSING_DEPENDENCY_ERROR = "Missing dependency";

async function getInputFiles(fromStep: number): Promise<{
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
      cachedFiles.add(output);
    }
  }
  const outputDirectories = new Set(
    [...result.keys()].map((outputPath) => dirname(outputPath))
  );

  return { total, map: result, outputDirectories, cachedFiles };
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
      data = step1Transform(data as Step0Output);
    if (fromStep <= 2 && toStep >= 2)
      data = step2Transform(data as Step1Output, inputFile);
    if (fromStep <= 3 && toStep >= 3) {
      data = step3Transform(data as Step2Output, inputFile);
    }
    if (fromStep <= 4 && toStep >= 4) {
      const cache = [...fileCache].map((item) =>
        item
          .replace(STEP_BASE, "")
          .split("\\")
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
      const cache = [...fileCache].map((item) =>
        item
          .replace(STEP_BASE, "")
          .split("\\")
          .slice(2)
          .join("/")
          .replace(".yml", "")
      );
      const dependencies = extractStep5Dependencies(
        data as Step4Output,
        outputFile
      );
      for (const dependency of dependencies) {
        if (!cache.includes(dependency)) {
          throw new Error(MISSING_DEPENDENCY_ERROR);
        }
      }
      data = await step5Transform(
        data as Step4Output,
        join(STEP_BASE, "step4", inputFile)
      );
    }
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

export async function runPipeline(
  fromStep: number,
  toStep: number,
  force: boolean
) {
  const outputDir = join(STEP_BASE, "step" + toStep);

  const stepRange =
    fromStep === toStep ? `step ${fromStep}` : `steps ${fromStep}-${toStep}`;
  consola.box(`Converting Divinum Officium files\n\nProcessing ${stepRange}`);
  consola.info(`Output: ${outputDir}`);
  consola.info(
    `Force: ${
      force ? "yes (cleaning output folder)" : "no (skipping existing outputs)"
    }`
  );

  const { processed, errors } = await executePipeline(
    fromStep,
    toStep,
    outputDir,
    force
  );

  consola.success(`Streaming pipeline done.`);
  consola.info(`Processed: ${processed} files`);
  consola.info(`Errors: ${errors}`);
}
