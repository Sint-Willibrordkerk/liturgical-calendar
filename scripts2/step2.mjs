import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP1B_INPUT = join(PROJECT_BASE, ".divinum-officium", "step1b");
const STEP2_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step2");
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

const KEY_LINE_REGEX = /^\[[\p{L}\p{N}_ #,:-]+\]/u;

function isKeyLine(line) {
  return typeof line === "string" && KEY_LINE_REGEX.test(line);
}

function trimTrailingEmpty(arr) {
  if (!Array.isArray(arr)) return arr;
  const out = [...arr];
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

function linesToObject(lines) {
  const result = { __preamble: [] };
  let currentKey = "__preamble";
  let currentLines = [];

  for (const line of lines) {
    if (isKeyLine(line)) {
      result[currentKey] = trimTrailingEmpty(currentLines);
      currentKey = line;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  result[currentKey] = trimTrailingEmpty(currentLines);
  return result;
}

function collectYmlFiles(dirPath) {
  return readdir(dirPath, { recursive: true }).then((entries) =>
    entries.filter((rel) => typeof rel === "string" && rel.endsWith(".yml"))
  );
}

async function main() {
  await rm(STEP2_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP2_OUTPUT, { recursive: true });

  const files = await collectYmlFiles(STEP1B_INPUT);
  const mkdirCache = new Set();

  const { processed, errors } = await runBatched(
    files,
    CONCURRENCY,
    async (rel) => {
      const inputPath = join(STEP1B_INPUT, rel);
      const outputPath = join(STEP2_OUTPUT, rel);
      const raw = await readFile(inputPath, "utf-8");
      const lines = parse(raw);
      if (!Array.isArray(lines)) {
        throw new Error("Expected root array");
      }
      const obj = linesToObject(lines);
      await ensureDir(outputPath, mkdirCache);
      await writeFile(outputPath, stringify(obj), "utf-8");
    }
  );

  console.log(
    `Step 2 done. ${processed} files in ${STEP2_OUTPUT}, ${errors} errors`
  );
}

main();
