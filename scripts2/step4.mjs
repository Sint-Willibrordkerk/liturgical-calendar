import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP3_INPUT = join(PROJECT_BASE, ".divinum-officium", "step3");
const STEP4_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step4");
const CONCURRENCY = 150;

/**
 * Rubric/calendar suffixes: strip from stem to get "base" for merging into main file.
 */
const RUBRIC_SUFFIXES = [
  "dat", "oct", "cc", "da", "nt", "ot", "rt", "pt", "qt", "tt",
  "t", "o", "r", "n", "p", "q",
];

const SUFFIX_TO_KEY = {
  t: "tridentine",
  o: "1888",
  r: "1960",
  n: "1960-new",
  da: "divino-afflatu",
  p: "paschaltide",
  q: "lent",
  cc: "simplex-impeded",
  oct: "octave",
  nt: "1960-transfer",
  ot: "1888-transfer",
  rt: "1960-transfer",
  pt: "paschaltide-transfer",
  qt: "lent-transfer",
  tt: "tridentine-transfer",
  dat: "divino-afflatu-transfer",
};

function getBaseStem(stem) {
  for (const suf of RUBRIC_SUFFIXES) {
    if (stem !== suf && stem.endsWith(suf)) {
      return stem.slice(0, -suf.length);
    }
  }
  return stem;
}

function getKeySuffix(stem, base) {
  const fileSuffix = stem.length > base.length ? stem.slice(base.length) : "";
  const key = SUFFIX_TO_KEY[fileSuffix];
  return key !== undefined ? key : (fileSuffix || null);
}

function rankToName(val) {
  const s = Array.isArray(val) ? (val[0] != null ? String(val[0]) : "") : String(val);
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

function mergeAllWithKeySuffix(entries) {
  const out = {};
  for (const { stem, base, obj } of entries) {
    const keySuffix = getKeySuffix(stem, base);
    if (keySuffix == null || stem === base) {
      for (const [k, v] of Object.entries(obj ?? {})) {
        out[k] = v;
      }
    } else {
      for (const [k, v] of Object.entries(obj ?? {})) {
        out[k + "/" + keySuffix] = v;
      }
    }
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

function getStem(relPath) {
  const base = relPath.replace(/^.*[/\\]/, "");
  return base.replace(/\.yml$/i, "") || base;
}

async function main() {
  await rm(STEP4_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP4_OUTPUT, { recursive: true });

  const allPaths = await collectYmlFiles(STEP3_INPUT);
  const pathToObj = new Map();

  const { processed, errors } = await runBatched(
    allPaths,
    CONCURRENCY,
    async (relPath) => {
      const inputPath = join(STEP3_INPUT, relPath);
      try {
        const raw = await readFile(inputPath, "utf-8");
        const obj = parse(raw);
        if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
          pathToObj.set(relPath, transformObject(obj));
        }
      } catch {
        // skip failed reads
      }
    }
  );

  if (errors > 0) {
    console.error(`Step 4 read errors: ${errors}`);
  }

  const byBase = new Map();
  for (const [relPath, obj] of pathToObj) {
    const dir = dirname(relPath);
    const stem = getStem(relPath);
    const base = getBaseStem(stem);
    const key = dir + "\0" + base;
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key).push({ relPath, stem, base, obj });
  }

  const mkdirCache = new Set();
  let written = 0;
  for (const [, entries] of byBase) {
    entries.sort((a, b) => (a.stem === a.base ? 0 : 1) - (b.stem === b.base ? 0 : 1));
    const merged = mergeAllWithKeySuffix(entries);
    const dir = dirname(entries[0].relPath);
    const outRelPath = dir ? `${dir}/${entries[0].base}.yml` : `${entries[0].base}.yml`;
    const outputPath = join(STEP4_OUTPUT, outRelPath);
    await ensureDir(outputPath, mkdirCache);
    await writeFile(outputPath, stringify(merged), "utf-8");
    written++;
  }

  console.log(`Step 4 done. ${written} files in ${STEP4_OUTPUT} (rubric variants merged into base)`);
}

main();
