import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP1_INPUT = join(PROJECT_BASE, ".divinum-officium", "step1");
const STEP1B_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step1b");
const CONCURRENCY = 150;

/**
 * Modifications applied to step1 YAML (array of lines) before step2.
 * Similar in spirit to scripts/modify-source-files.mjs but operates on step1 output.
 * Each entry: { pathMatch: string | RegExp, apply: (lines, relPath) => lines }
 */

const RUBRICA_TRIDENTINA = /\s*\(rubrica tridentina\)\s*/gi;

const MODIFICATIONS = [
  {
    pathMatch: /12-29o\.yml$/i,
    apply(lines) {
      return lines.map((line) =>
        typeof line === "string"
          ? line.replace(RUBRICA_TRIDENTINA, "").trimEnd()
          : line
      );
    },
  },
];

function applyModifications(lines, relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  for (const { pathMatch, apply } of MODIFICATIONS) {
    if (
      (typeof pathMatch === "string" && normalized.includes(pathMatch)) ||
      (pathMatch instanceof RegExp && pathMatch.test(normalized))
    ) {
      lines = apply(lines, normalized);
    }
  }
  return lines;
}

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

function collectYmlFiles(dirPath) {
  return readdir(dirPath, { recursive: true }).then((entries) =>
    entries.filter((rel) => typeof rel === "string" && rel.endsWith(".yml"))
  );
}

async function main() {
  await rm(STEP1B_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP1B_OUTPUT, { recursive: true });

  const files = await collectYmlFiles(STEP1_INPUT);
  const mkdirCache = new Set();

  const { processed, errors } = await runBatched(
    files,
    CONCURRENCY,
    async (rel) => {
      const inputPath = join(STEP1_INPUT, rel);
      const outputPath = join(STEP1B_OUTPUT, rel);
      const raw = await readFile(inputPath, "utf-8");
      let lines = parse(raw);
      if (!Array.isArray(lines)) {
        throw new Error(`Expected array in ${rel}`);
      }
      lines = applyModifications(lines, rel);
      await ensureDir(outputPath, mkdirCache);
      await writeFile(outputPath, stringify(lines), "utf-8");
    }
  );

  console.log(
    `Step 1b done. ${processed} files in ${STEP1B_OUTPUT}, ${errors} errors`
  );
}

main();
