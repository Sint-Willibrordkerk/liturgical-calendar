#!/usr/bin/env node
import dotenv from "dotenv";
import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm, access } from "fs/promises";
import { constants } from "fs";
import { parse, stringify } from "yaml";
import { parseArgs } from "util";

import { scanSourceFiles, getSuffixKey } from "./lib/grouper.mjs";
import {
  buildDependencyGraph,
  buildDependencyGraphFromStepDir,
  topologicalSort,
} from "./lib/dependency-resolver.mjs";
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
} from "./step2.js";
import { transform as step3Transform } from "./step3.js";
import { transform as step4Transform } from "./step4.js";
import { transform as step6Transform } from "./step6.js";
import { transform as step10Transform } from "./step10.mjs";
import { transform as step11Transform } from "./step11.mjs";
import { transform as step12Transform } from "./step12.mjs";
import { transform as step13Transform } from "./step13.mjs";

dotenv.config();

const PROJECT_BASE = process.cwd();
/** Base dir for intermediate step output (used when --from > 1). */
const STEP_BASE = join(PROJECT_BASE, ".divinum-officium");

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

/** Merge one source result into existing object (merge-on-write). */
function mergeOneInto(existing, newObj, sourceFile) {
  const suffixKey = getSuffixKey(sourceFile);
  if (suffixKey === null) {
    return step4Merge(existing, newObj);
  }
  const out = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(newObj ?? {})) {
    out[k + "/" + suffixKey] = v;
  }
  return out;
}

/** List all output keys (rel path without .yml) in a step directory. */
async function listStepOutputKeys(stepDir) {
  const keys = [];
  async function walk(dir, prefix = "") {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(join(dir, e.name), rel);
      } else if (e.name.endsWith(".yml")) {
        keys.push(rel.replace(/\.yml$/i, ""));
      }
    }
  }
  try {
    await walk(stepDir);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  return keys;
}

async function processSourceFile(sourceFile, divinumOfficiumBase, toStep) {
  const filePath = join(divinumOfficiumBase, sourceFile.relPath);

  // Step 1: Read and split into lines
  const content = await readFileWithEncoding(filePath);
  let data = step1Transform(content);
  if (toStep === 1) return { lines: data };

  // Step 2: Apply modifications
  data = step2Transform(data, { relPath: sourceFile.relPath });
  if (toStep === 2) return { lines: data };

  // Step 3: Lines to sections object
  data = step3Transform(data);
  if (toStep === 3)
    return {
      obj: data,
      rubricSuffix: sourceFile.rubricSuffix,
      dirSuffix: sourceFile.dirSuffix,
    };

  // Step 4: Transform (extract name from rank) - no merge yet
  data = step4Transform(data);
  return {
    obj: data,
    rubricSuffix: sourceFile.rubricSuffix,
    dirSuffix: sourceFile.dirSuffix,
  };
}

async function runStepsFromData(
  data,
  outputKey,
  fromStep,
  toStep,
  cache,
  mkdirCache,
  outputDir
) {
  for (let n = fromStep; n <= toStep; n++) {
    if (n === 4) data = step4Transform(data);
    else if (n === 5) data = step5Transform(data);
    else if (n === 6) data = step6Transform(data);
    else if (n === 7) data = step7Transform(data);
    else if (n === 8) data = step8Transform(data);
    else if (n === 9)
      data = await step9Transform(data, { relPath: outputKey + ".yml" }, cache);
    else if (n === 10)
      data = await step10Transform(
        data,
        { relPath: outputKey + ".yml" },
        cache
      );
    else if (n === 11) data = step11Transform(data);
    else if (n === 12) {
      const { main, commemorations } = step12Transform(data);
      data = main;
      for (const comm of commemorations) {
        const commPath = join(
          outputDir,
          dirname(outputKey),
          `${comm.slug}.yml`
        );
        const commObj = {
          name: comm.displayName,
          oratio: comm.oratio,
          secreta: comm.secreta,
          postcommunio: comm.postcommunio,
        };
        await ensureDir(commPath, mkdirCache);
        await writeFile(commPath, stringify(commObj), "utf-8");
      }
    } else if (n === 13)
      data = step13Transform(data, { relPath: outputKey + ".yml" });
  }
  return data;
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

function getOutputPathForInput(
  inputFile: string,
  outputDir: string,
  fromStep: number,
  toStep: number
): string {
  let path = join(outputDir, inputFile);
  if (fromStep <= 0 && toStep >= 0) path = getStep0OutputFile(path);
  if (fromStep <= 2 && toStep >= 2) path = getStep2OutputFile(path);
  return path;
}

async function groupInputsByOutput(
  inputFiles: string[],
  outputDir: string,
  fromStep: number,
  toStep: number,
  force: boolean
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
  result.keys().forEach(async (output) => {
    if (!force && (await outputExists(output))) result.delete(output);
  });
  return { total, map: result };
}

async function processInputFiles(
  outputFile: string,
  inputFiles: string[],
  fromStep: number,
  toStep: number,
  mkdirCache: Set<string>,
  strictMode: boolean
) {
  let result: unknown;
  for (const inputFile of inputFiles) {
    let data: unknown;
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
      data = step1Transform(data as Step0Output, strictMode);
    if (fromStep <= 2 && toStep >= 2)
      data = step2Transform(data as Step1Output, inputFile);
    if (fromStep <= 3 && toStep >= 3) data = step3Transform(data, inputFile);
    if (fromStep <= 4 && toStep >= 4) data = step4Transform(data);
    // if (fromStep <= 5 && toStep >= 5) data = step5Transform(data);
    // if (fromStep <= 6 && toStep >= 6) data = step6Transform(data);

    if (!result) {
      result = data;
    } else {
      const hasPriority = inputFile.includes("missa");
      const merged = hasPriority
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
  let processed = 0;
  let errors = 0;

  const inputFiles = await getInputFiles(fromStep);
  const { map: byOutput, total } = await groupInputsByOutput(
    inputFiles,
    outputDir,
    fromStep,
    toStep,
    force
  );
  let queue = [...byOutput.entries()];

  if (force) {
    await rm(outputDir, { recursive: true, force: true });
  }

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
          strictMode
        );
        processed++;
      } catch (err: unknown) {
        errors++;
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

  // if (fromStep > 0) {
  //   let order = outputKeys;
  //   if (toStep >= 9) {
  //     console.log("Building dependency graph...");
  //     const graph = await buildDependencyGraphFromStepDir(inputDir, outputKeys);
  //     order = topologicalSort(graph);
  //   }
  //   const cache = new Map();
  //   for (const outputKey of order) {
  //     try {
  //       const inputPath = join(inputDir, outputKey + ".yml");
  //       let raw;
  //       try {
  //         raw = await readFile(inputPath, "utf-8");
  //       } catch {
  //         continue;
  //       }
  //       let data = parse(raw);
  //       if (typeof data !== "object" || data === null || Array.isArray(data))
  //         continue;

  //       data = await runStepsFromData(
  //         data,
  //         outputKey,
  //         fromStep,
  //         toStep,
  //         cache,
  //         mkdirCache,
  //         outputDir
  //       );
  //       cache.set(outputKey, data);

  //       const outputPath = join(outputDir, outputKey + ".yml");
  //       await ensureDir(outputPath, mkdirCache);
  //       await writeFile(outputPath, stringify(data), "utf-8");
  //       processed++;
  //       if (processed % 1000 === 0)
  //         console.log(`Processed ${processed}/${order.length} files...`);
  //     } catch (err) {
  //       errors++;
  //       console.error(`Error processing ${outputKey}: ${err.message}`);
  //     }
  //   }
  // } else {
  //   // fromStep === 1: start from source, merge when file exists
  //   if (!process.env.DIVINUM_OFFICIUM_BASE) {
  //     console.error(
  //       "DIVINUM_OFFICIUM_BASE environment variable is not set (e.g. path to divinum-officium repo)."
  //     );
  //     process.exit(1);
  //   }

  //   await rm(outputDir, { recursive: true, force: true });
  //   await mkdir(outputDir, { recursive: true });

  //   console.log("Scanning source files...");
  //   const groups = await scanSourceFiles(DIVINUM_OFFICIUM_BASE);
  //   console.log(`Found ${groups.size} output keys`);

  //   let order = [...groups.keys()].sort();
  //   if (toStep >= 9) {
  //     console.log("Building dependency graph...");
  //     const graph = await buildDependencyGraph(groups, DIVINUM_OFFICIUM_BASE);
  //     order = topologicalSort(graph);
  //   }
  //   console.log(`Processing ${order.length} files (merge when exists)`);

  //   const cache = new Map();
  //   const allSources = (group) => {
  //     const list = [...group.horasFiles, ...group.missaFiles];
  //     list.sort((a, b) => {
  //       const aBase = a.rubricSuffix === null && a.dirSuffix === null ? 0 : 1;
  //       const bBase = b.rubricSuffix === null && b.dirSuffix === null ? 0 : 1;
  //       if (aBase !== bBase) return aBase - bBase;
  //       return (a.relPath || "").localeCompare(b.relPath || "");
  //     });
  //     return list;
  //   };

  //   for (const outputKey of order) {
  //     const group = groups.get(outputKey);
  //     if (!group) continue;

  //     try {
  //       const sources = allSources(group);
  //       const outputPath = join(outputDir, outputKey + ".yml");
  //       let data = null;

  //       for (const sourceFile of sources) {
  //         const result = await processSourceFile(
  //           sourceFile,
  //           DIVINUM_OFFICIUM_BASE,
  //           Math.min(toStep, 4)
  //         );

  //         if (toStep <= 2 && result.lines !== undefined) {
  //           await ensureDir(outputPath, mkdirCache);
  //           await writeFile(outputPath, stringify(result.lines), "utf-8");
  //           data = result.lines;
  //           break;
  //         }

  //         const newObj = result.obj ?? null;
  //         if (newObj === null) continue;

  //         let existing = null;
  //         try {
  //           const raw = await readFile(outputPath, "utf-8");
  //           existing = parse(raw);
  //         } catch {}
  //         data = mergeOneInto(existing, newObj, sourceFile);
  //         await ensureDir(outputPath, mkdirCache);
  //         await writeFile(outputPath, stringify(data), "utf-8");
  //       }

  //       if (data === null || (toStep <= 2 && Array.isArray(data))) continue;
  //       if (typeof data !== "object" || Array.isArray(data)) continue;

  //       if (toStep >= 5) data = step5Transform(data);
  //       if (toStep >= 6) data = step6Transform(data);
  //       data = await runStepsFromData(
  //         data,
  //         outputKey,
  //         7,
  //         toStep,
  //         cache,
  //         mkdirCache,
  //         outputDir
  //       );
  //       cache.set(outputKey, data);

  //       await ensureDir(outputPath, mkdirCache);
  //       await writeFile(outputPath, stringify(data), "utf-8");
  //       processed++;
  //       if (processed % 1000 === 0)
  //         console.log(`Processed ${processed}/${order.length} files...`);
  //     } catch (err) {
  //       errors++;
  //       console.error(`Error processing ${outputKey}: ${err.message}`);
  //     }
  //   }
  // }
  console.log(`\nStreaming pipeline done.`);
  console.log(`  Processed: ${processed} files`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Output: ${outputDir}`);
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
