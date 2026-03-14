import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP9_INPUT = join(PROJECT_BASE, ".divinum-officium", "step9");
const STEP10_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step10");
const CONCURRENCY = 150;

const fileCache = new Map();

const EX_REGEX = /\bex\s+([A-Za-z0-9/-]+)/g;
const VIDE_REGEX = /\bvide\s+([A-Za-z0-9/-]+)/g;
const EX_REMOVE = /\bex\s+[A-Za-z0-9/-]+;?\s*/g;
const VIDE_REMOVE = /\bvide\s+[A-Za-z0-9/-]+;?\s*/g;

function normalizePath(path) {
  if (!path || typeof path !== "string") return path;
  const p = path.replace(/;\s*$/, "").trim();
  if (p.includes("/")) return p;
  if (/^C[A-Za-z0-9-]+$/.test(p)) return `Commune/${p}`;
  if (/^(Epi|Pasc|Quadp)[A-Za-z0-9-]*$/.test(p)) return `Tempora/${p}`;
  return p;
}

function isVideKey(key) {
  if (!key || key === "__preamble") return false;
  if (/^lectio/i.test(key)) return true;
  if (/^ant-laudes(\/|$)/.test(key) || /^ant-vespera(\/|$)/.test(key)) return true;
  if (/^ant-1(\/|$)/.test(key) || /^ant-2(\/|$)/.test(key) || /^ant-3(\/|$)/.test(key)) return true;
  if (/^versum/i.test(key)) return true;
  if (key === "oratio" || key.startsWith("oratio/")) return true;
  return false;
}

function extractExVideSources(obj) {
  const ex = new Set();
  const vide = new Set();
  const add = (path, set) => {
    const norm = normalizePath(path);
    if (norm) set.add(norm);
  };
  for (const key of Object.keys(obj)) {
    if (key !== "__preamble" && !key.startsWith("__preamble/")) continue;
    const preamble = obj[key];
    if (!Array.isArray(preamble)) continue;
    for (const line of preamble) {
      if (typeof line === "string" && line.startsWith("@")) {
        const path = line.slice(1).split(":")[0].trim();
        if (path) add(path, ex);
      }
    }
  }
  const rankRuleKeys = Object.keys(obj).filter(
    (k) => k !== "__preamble" && (k === "rank" || k.startsWith("rank/") || k === "rule" || k.startsWith("rule/"))
  );
  for (const key of rankRuleKeys) {
    const arr = obj[key];
    if (!Array.isArray(arr)) continue;
    for (const line of arr) {
      if (typeof line !== "string") continue;
      let m;
      EX_REGEX.lastIndex = 0;
      while ((m = EX_REGEX.exec(line)) !== null) add(m[1], ex);
      VIDE_REGEX.lastIndex = 0;
      while ((m = VIDE_REGEX.exec(line)) !== null) add(m[1], vide);
    }
  }
  return { ex, vide };
}

async function getFileContent(basePath, relPath) {
  const key = relPath;
  if (fileCache.has(key)) return fileCache.get(key);
  const fullPath = join(basePath, relPath);
  let raw;
  try {
    raw = await readFile(fullPath, "utf-8");
  } catch (_) {
    fileCache.set(key, null);
    return null;
  }
  let obj;
  try {
    obj = parse(raw);
  } catch (_) {
    fileCache.set(key, null);
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    fileCache.set(key, null);
    return null;
  }
  fileCache.set(key, obj);
  return obj;
}

async function loadDoc(basePath, language, normalizedPath) {
  const relPath = `${language}/${normalizedPath}.yml`;
  return getFileContent(basePath, relPath);
}

async function transformObject(obj, currentFileRel, basePath) {
  const pathParts = currentFileRel.replace(/\\/g, "/").split("/");
  const language = pathParts[0];
  if (!language) return obj;

  const { ex, vide } = extractExVideSources(obj);
  const currentKeys = new Set(Object.keys(obj).filter((k) => k !== "__preamble"));
  const added = Object.create(null);

  for (const path of ex) {
    const doc = await loadDoc(basePath, language, path);
    if (!doc) continue;
    for (const [k, v] of Object.entries(doc)) {
      if (k === "__preamble") continue;
      if (currentKeys.has(k)) continue;
      currentKeys.add(k);
      added[k] = v;
    }
  }

  for (const path of vide) {
    const doc = await loadDoc(basePath, language, path);
    if (!doc) continue;
    for (const [k, v] of Object.entries(doc)) {
      if (k === "__preamble") continue;
      if (!isVideKey(k)) continue;
      if (currentKeys.has(k)) continue;
      currentKeys.add(k);
      added[k] = v;
    }
  }

  const addedKeys = Object.keys(added).sort();
  let result = addedKeys.length === 0 ? obj : { ...obj };
  if (addedKeys.length > 0) {
    for (const k of addedKeys) result[k] = added[k];
  }
  return stripPreambleExVide(result);
}

/**
 * Transform object by resolving ex/vide references and importing sections.
 * Exported for streaming pipeline.
 *
 * @param {Object} obj - Sections object
 * @param {{ relPath: string }} context - Context with relative path
 * @param {Map<string, Object>} resolvedFiles - Map of outputKey → transformed data
 * @returns {Promise<Object>} Transformed object with ex/vide resolved
 */
export async function transform(obj, context, resolvedFiles) {
  // For streaming: use resolvedFiles as the file cache
  fileCache.clear();
  if (resolvedFiles) {
    for (const [key, value] of resolvedFiles) {
      fileCache.set(key + ".yml", value);
    }
  }
  return transformObject(obj, context.relPath, "");
}

/**
 * Extract ex/vide dependencies from object for dependency analysis.
 * Exported for streaming pipeline.
 *
 * @param {Object} obj - Sections object
 * @returns {Set<string>} Set of referenced file paths
 */
export function extractDependencies(obj) {
  const { ex, vide } = extractExVideSources(obj);
  return new Set([...ex, ...vide]);
}

function stripPreambleExVide(result) {
  const out = { ...result };
  for (const key of Object.keys(out)) {
    if (key !== "__preamble" && !key.startsWith("__preamble/")) continue;
    if (!Array.isArray(out[key])) continue;
    out[key] = out[key].filter(
      (line) => typeof line !== "string" || !line.startsWith("@")
    );
    if (out[key].length === 0) delete out[key];
  }
  const rankRuleKeys = Object.keys(out).filter(
    (k) => k !== "__preamble" && (k === "rank" || k.startsWith("rank/") || k === "rule" || k.startsWith("rule/"))
  );
  for (const key of rankRuleKeys) {
    const arr = out[key];
    if (!Array.isArray(arr)) continue;
    const cleaned = arr
      .map((line) => {
        if (typeof line !== "string") return line;
        let s = line.replace(EX_REMOVE, "").replace(VIDE_REMOVE, "").trim();
        s = s.replace(/\s*;;\s*$/, "").replace(/\s*;\s*$/, "");
        return s;
      })
      .filter((line) => line !== "" || typeof line !== "string");
    out[key] = cleaned;
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
  await rm(STEP10_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP10_OUTPUT, { recursive: true });

  const files = await collectYmlFiles(STEP9_INPUT);
  const mkdirCache = new Set();

  const { processed, errors } = await runBatched(
    files,
    CONCURRENCY,
    async (rel) => {
      const inputPath = join(STEP9_INPUT, rel);
      const outputPath = join(STEP10_OUTPUT, rel);
      const raw = await readFile(inputPath, "utf-8");
      const obj = parse(raw);
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        throw new Error("Expected object");
      }
      const out = await transformObject(obj, rel, STEP9_INPUT);
      await ensureDir(outputPath, mkdirCache);
      await writeFile(outputPath, stringify(out), "utf-8");
    }
  );

  console.log(`Step 10 done. ${processed} files in ${STEP10_OUTPUT}, ${errors} errors`);
}

const isMainModule = import.meta.url.endsWith("step10.mjs") &&
  process.argv[1]?.replace(/\\/g, "/").endsWith("step10.mjs");
if (isMainModule) {
  main();
}
