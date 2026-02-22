import { join, dirname, basename } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP4_INPUT = join(PROJECT_BASE, ".divinum-officium", "step4");
const STEP4A_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step4a");
const CONCURRENCY = 150;

/**
 * Directory suffixes to detect variant directories.
 * Order matters: longer suffixes first to match greedily.
 */
const DIR_SUFFIXES = [
  "1955R", "1960", "1570",  // Martyrologium variants
  "Cist", "OP", "M",        // Sancti/Tempora variants
];

/**
 * Get base directory name and suffix from a directory name.
 * E.g., "Martyrologium1570" → { base: "Martyrologium", suffix: "1570" }
 *       "Sancti" → { base: "Sancti", suffix: null }
 */
function parseDirName(dirName) {
  for (const suf of DIR_SUFFIXES) {
    if (dirName.endsWith(suf) && dirName.length > suf.length) {
      return { base: dirName.slice(0, -suf.length), suffix: suf.toLowerCase() };
    }
  }
  return { base: dirName, suffix: null };
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
  const outDir = dirname(filePath);
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
  await rm(STEP4A_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP4A_OUTPUT, { recursive: true });

  const allPaths = await collectYmlFiles(STEP4_INPUT);

  // Group files by language + base directory + filename
  // E.g., "Latin/Martyrologium/01-01.yml" and "Latin/Martyrologium1570/01-01.yml"
  // should be grouped together under key "Latin\0Martyrologium\001-01.yml"
  const byBaseAndFile = new Map();

  for (const relPath of allPaths) {
    const parts = relPath.split(/[/\\]/);
    if (parts.length < 3) {
      // Not in expected structure (lang/dir/file), copy as-is
      const key = relPath;
      if (!byBaseAndFile.has(key)) byBaseAndFile.set(key, []);
      byBaseAndFile.get(key).push({ relPath, dirSuffix: null });
      continue;
    }

    const lang = parts[0];           // e.g., "Latin"
    const dirName = parts[1];        // e.g., "Martyrologium1570"
    const restPath = parts.slice(2).join("/"); // e.g., "01-01.yml"

    const { base, suffix } = parseDirName(dirName);
    const key = `${lang}\0${base}\0${restPath}`;

    if (!byBaseAndFile.has(key)) byBaseAndFile.set(key, []);
    byBaseAndFile.get(key).push({ relPath, dirSuffix: suffix });
  }

  // Read all files
  const pathToObj = new Map();
  const { errors } = await runBatched(
    allPaths,
    CONCURRENCY,
    async (relPath) => {
      const inputPath = join(STEP4_INPUT, relPath);
      try {
        const raw = await readFile(inputPath, "utf-8");
        const obj = parse(raw);
        if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
          pathToObj.set(relPath, obj);
        }
      } catch {
        // skip failed reads
      }
    }
  );

  if (errors > 0) {
    console.error(`Step 4a read errors: ${errors}`);
  }

  // Merge and write
  const mkdirCache = new Set();
  let written = 0;

  for (const [key, entries] of byBaseAndFile) {
    // Sort: base (suffix=null) first, then variants
    entries.sort((a, b) => {
      if (a.dirSuffix === null && b.dirSuffix !== null) return -1;
      if (a.dirSuffix !== null && b.dirSuffix === null) return 1;
      return 0;
    });

    const merged = {};

    for (const { relPath, dirSuffix } of entries) {
      const obj = pathToObj.get(relPath);
      if (!obj) continue;

      if (dirSuffix === null) {
        // Base directory: copy keys as-is
        for (const [k, v] of Object.entries(obj)) {
          merged[k] = v;
        }
      } else {
        // Variant directory: add suffix to keys
        for (const [k, v] of Object.entries(obj)) {
          merged[`${k}/${dirSuffix}`] = v;
        }
      }
    }

    // Determine output path: use base directory
    const keyParts = key.split("\0");
    let outRelPath;
    if (keyParts.length === 3) {
      const [lang, baseDir, restPath] = keyParts;
      outRelPath = `${lang}/${baseDir}/${restPath}`;
    } else {
      // Fallback for unexpected structure
      outRelPath = entries[0].relPath;
    }

    const outputPath = join(STEP4A_OUTPUT, outRelPath);
    await ensureDir(outputPath, mkdirCache);
    await writeFile(outputPath, stringify(merged), "utf-8");
    written++;
  }

  console.log(`Step 4a done. ${written} files in ${STEP4A_OUTPUT} (directory variants merged into base)`);
}

main();
