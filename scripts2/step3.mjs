import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP2_INPUT = join(PROJECT_BASE, ".divinum-officium", "step2");
const STEP3_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step3");
const CONCURRENCY = 150;

/**
 * Output path: preserve full structure including language (e.g. Latin/, Bohemice/).
 * relPath from collectYmlFiles(horasDir) is already relative to horas (or missa),
 * so it is already language/category/file — use as-is.
 */
function getOutputRelPath(relPath) {
  return relPath.replace(/\\/g, "/");
}

function rankToName(val) {
  const s = Array.isArray(val)
    ? val[0] != null
      ? String(val[0])
      : ""
    : String(val);
  return s.split(";;")[0].trim();
}

function transformObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "rank") {
      out.name = rankToName(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Merge two objects (horas + missa); combine rule arrays and dedupe with Set. */
function mergeTwo(prev, next) {
  const out = { ...(prev ?? {}), ...(next ?? {}) };
  const hasPrevRule = Array.isArray(prev?.rule);
  const hasNextRule = Array.isArray(next?.rule);
  if (hasPrevRule || hasNextRule) {
    out.rule = [...new Set([...(prev?.rule ?? []), ...(next?.rule ?? [])])];
  }
  return out;
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
  await rm(STEP3_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP3_OUTPUT, { recursive: true });

  const horasDir = join(STEP2_INPUT, "horas");
  const missaDir = join(STEP2_INPUT, "missa");
  const horasFiles = await collectYmlFiles(horasDir);
  const missaFiles = await collectYmlFiles(missaDir);
  const allPaths = [...new Set([...horasFiles, ...missaFiles])];

  const mkdirCache = new Set();
  const { processed, errors } = await runBatched(
    allPaths,
    CONCURRENCY,
    async (relPath) => {
      const outputRelPath = getOutputRelPath(relPath);
      let horasObj = null;
      let missaObj = null;
      const horasPath = join(horasDir, relPath);
      const missaPath = join(missaDir, relPath);

      try {
        const rawH = await readFile(horasPath, "utf-8");
        const obj = parse(rawH);
        if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
          horasObj = transformObject(obj);
        }
      } catch {
        // file missing in horas
      }
      try {
        const rawM = await readFile(missaPath, "utf-8");
        const obj = parse(rawM);
        if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
          missaObj = transformObject(obj);
        }
      } catch {
        // file missing in missa
      }

      const merged = mergeTwo(horasObj, missaObj);
      const outputPath = join(STEP3_OUTPUT, outputRelPath);
      await ensureDir(outputPath, mkdirCache);
      await writeFile(outputPath, stringify(merged), "utf-8");
    }
  );

  console.log(
    `Step 3 done. ${processed} files in ${STEP3_OUTPUT}, ${errors} errors`
  );
}

main();
