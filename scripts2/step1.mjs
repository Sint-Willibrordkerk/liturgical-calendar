import dotenv from "dotenv";
import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { stringify } from "yaml";

dotenv.config();

const PROJECT_BASE = process.cwd();
const DIVINUM_OFFICIUM_BASE = join(
  process.env.DIVINUM_OFFICIUM_BASE ?? "",
  "web/www"
);
const INPUT_ROOTS = ["horas", "missa"];
const STEP1_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step1");
const CONCURRENCY = 150;

async function runBatched(items, concurrency, fn) {
  const queue = [...items];
  let processed = 0;
  let errors = 0;
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      try {
        await fn(item);
        processed++;
      } catch (err) {
        errors++;
        console.error(`Error processing ${item}:`, err.message);
      }
    }
  }
  const n = Math.min(concurrency, items.length) || 1;
  await Promise.all(Array(n).fill(0).map(worker));
  return { processed, errors };
}

async function ensureDir(filePath, mkdirCache) {
  const outDir = join(filePath, "..");
  if (!mkdirCache.has(outDir)) {
    await mkdir(outDir, { recursive: true });
    mkdirCache.add(outDir);
  }
}

function fileFilter(filename) {
  return (
    filename.endsWith(".txt") &&
    !filename.endsWith("pl.txt") &&
    !filename.endsWith("tts.txt") &&
    filename.includes("Latin\\")
  );
}

function collectTxtFiles(dirPath, rootName) {
  return readdir(dirPath, { recursive: true }).then((entries) => {
    return entries.filter(fileFilter).map((rel) => `${rootName}/${rel}`);
  });
}

async function readFileWithEncoding(filePath) {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err) {
    if (err?.code === "ENOENT") throw err;
    return await readFile(filePath, "latin1");
  }
}

function linesToArray(content) {
  return content.split(/\r?\n/);
}

async function processRoot(baseDir, rootName, mkdirCache) {
  const rootPath = join(baseDir, rootName);
  const files = await collectTxtFiles(rootPath, rootName);
  return runBatched(files, CONCURRENCY, async (rel) => {
    const inputPath = join(baseDir, rel);
    const outputRel = rel.replace(/\.txt$/i, ".yml");
    const outputPath = join(STEP1_OUTPUT, outputRel);
    const content = await readFileWithEncoding(inputPath);
    const lines = linesToArray(content);
    await ensureDir(outputPath, mkdirCache);
    await writeFile(outputPath, stringify(lines), "utf-8");
  });
}

async function main() {
  if (!process.env.DIVINUM_OFFICIUM_BASE) {
    console.error(
      "DIVINUM_OFFICIUM_BASE environment variable is not set (e.g. path to divinum-officium repo)."
    );
    process.exit(1);
  }

  await rm(STEP1_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP1_OUTPUT, { recursive: true });
  const mkdirCache = new Set();

  let totalProcessed = 0;
  let totalErrors = 0;
  for (const root of INPUT_ROOTS) {
    try {
      const { processed, errors } = await processRoot(
        DIVINUM_OFFICIUM_BASE,
        root,
        mkdirCache
      );
      totalProcessed += processed;
      totalErrors += errors;
      console.log(`${root}: ${processed} files written, ${errors} errors`);
    } catch (err) {
      console.error(`Failed to process ${root}:`, err);
      process.exit(1);
    }
  }
  console.log(
    `Step 1 done. Total: ${totalProcessed} files in ${STEP1_OUTPUT}, ${totalErrors} errors`
  );
}

main();
