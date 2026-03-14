import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP10_INPUT = join(PROJECT_BASE, ".divinum-officium", "step10");
const STEP11_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step11");
const CONCURRENCY = 150;

/** Invalid filename characters (Windows): replace with - */
const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

function firstString(val) {
  if (typeof val === "string" && val.trim() !== "") return val.trim();
  if (Array.isArray(val)) {
    const s = val.find((v) => typeof v === "string" && v.trim() !== "");
    return s != null ? s.trim() : null;
  }
  return null;
}

function getAllDisplayNames(obj, originalStem) {
  const kebabs = new Set();
  const add = (s) => {
    const k = toKebabFileName(s);
    if (k) kebabs.add(k);
  };
  if (obj == null || typeof obj !== "object") return [originalStem];
  for (const key of Object.keys(obj)) {
    if (key === "name" || key.startsWith("name/")) {
      add(firstString(obj[key]));
    } else if (key === "officium" || key.startsWith("officium/")) {
      const arr = obj[key];
      if (Array.isArray(arr)) {
        const first = arr.find((v) => typeof v === "string" && v.trim() !== "");
        if (first != null) add(first.trim());
      } else if (typeof arr === "string") add(arr);
    } else if (key === "rank" || key.startsWith("rank/")) {
      add(getRankFirstPart(obj[key]));
    }
  }
  if (kebabs.size === 0) return [originalStem];
  return [...kebabs];
}

function getRankFirstPart(rank) {
  if (rank == null) return null;
  let s = Array.isArray(rank)
    ? rank.find((v) => typeof v === "string" && v.trim() !== "")
    : typeof rank === "string"
    ? rank
    : null;
  if (s == null) return null;
  s = String(s).trim();
  const first = s.split(";;")[0];
  return first != null && first.trim() !== "" ? first.trim() : null;
}

function toKebabFileName(s) {
  if (s == null) return null;
  let t = String(s).trim().toLowerCase().replace(/\s+/g, "-");
  t = t.replace(INVALID_FILE_CHARS, "-");
  t = t.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return t === "" ? null : t;
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

function collectYmlFiles(dirPath) {
  return readdir(dirPath, { recursive: true }).then((entries) =>
    entries.filter((rel) => typeof rel === "string" && rel.endsWith(".yml"))
  );
}

function resolveCollisions(entries) {
  const byBasename = new Map();
  for (const { targetBasename, originalStem, relPath, content } of entries) {
    if (!byBasename.has(targetBasename)) byBasename.set(targetBasename, []);
    byBasename.get(targetBasename).push({ originalStem, relPath, content });
  }
  const result = [];
  for (const [base, list] of byBasename) {
    const byContent = new Map();
    for (const { originalStem, relPath, content } of list) {
      const key = content;
      if (!byContent.has(key))
        byContent.set(key, { originalStem, relPath, content });
    }
    const uniq = [...byContent.values()];
    if (uniq.length === 1) {
      result.push({
        relPath: uniq[0].relPath,
        finalBasename: base,
        content: uniq[0].content,
      });
    } else {
      for (const { originalStem, relPath, content } of uniq) {
        result.push({
          relPath,
          finalBasename: `${base}-${originalStem}`,
          content,
        });
      }
    }
  }
  return result;
}

function getStem(relPath) {
  const base = relPath.replace(/^.*[/\\]/, "");
  return base.replace(/\.yml$/i, "") || base;
}

/** Transform content for step11 output: name as string (from name, officium, or rank), remove officium and rank. */
function transformContentForStep11(rawContent) {
  const obj = parse(rawContent);
  if (obj == null || typeof obj !== "object") return rawContent;
  return transformObjectForStep11(obj);
}

function transformObjectForStep11(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "rank" || key.startsWith("rank/")) {
      const nameKey =
        key === "rank" ? "name" : "name/" + key.replace(/^rank\//, "");
      if (out[nameKey] === undefined || out[nameKey] === "") {
        out[nameKey] = getRankFirstPart(value) ?? "";
      }
      continue;
    }
    if (key === "name" || key.startsWith("name/")) {
      out[key] = firstString(value) ?? "";
      continue;
    }
    if (key === "officium" || key.startsWith("officium/")) {
      const nameKey =
        key === "officium" ? "name" : "name/" + key.replace(/^officium\//, "");
      if (out[nameKey] === undefined || out[nameKey] === "") {
        out[nameKey] = firstString(value) ?? "";
      }
      continue;
    }
    out[key] = value;
  }
  for (const k of Object.keys(out)) {
    if ((k === "name" || k.startsWith("name/")) && out[k] === "") delete out[k];
  }
  return out;
}

/**
 * Transform object by extracting name from rank/officium.
 * Exported for streaming pipeline.
 *
 * @param {Object} obj - Sections object
 * @returns {Object} Transformed object
 */
export function transform(obj) {
  return transformObjectForStep11(obj);
}

async function main() {
  await rm(STEP11_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP11_OUTPUT, { recursive: true });

  const allRelPaths = await collectYmlFiles(STEP10_INPUT);
  const mkdirCache = new Set();
  async function ensureDir(filePath) {
    const outDir = dirname(filePath);
    if (!mkdirCache.has(outDir)) {
      await mkdir(outDir, { recursive: true });
      mkdirCache.add(outDir);
    }
  }

  const shared = [];
  const { errors: readErrors } = await runBatched(
    allRelPaths,
    CONCURRENCY,
    async (relPath) => {
      const absPath = join(STEP10_INPUT, relPath);
      const raw = await readFile(absPath, "utf-8");
      const obj = parse(raw);
      const originalStem = getStem(relPath);
      const dir = dirname(relPath);
      const allNames = getAllDisplayNames(obj, originalStem);
      for (const targetBasename of allNames) {
        shared.push({
          relPath,
          dir,
          targetBasename,
          originalStem,
          content: raw,
        });
      }
    }
  );

  if (readErrors > 0) {
    console.error(`Step 11 read errors: ${readErrors}`);
    return;
  }

  const byDir = new Map();
  for (const item of shared) {
    const d = item.dir;
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(item);
  }

  const toWrite = [];
  for (const [, entries] of byDir) {
    const resolved = resolveCollisions(entries);
    for (const { relPath, finalBasename, content } of resolved) {
      const dir = dirname(relPath);
      const outRelPath = dir
        ? `${dir}/${finalBasename}.yml`
        : `${finalBasename}.yml`;
      toWrite.push({
        outRelPath,
        content: stringify(transformContentForStep11(content)),
      });
    }
  }

  let writeErrors = 0;
  for (const { outRelPath, content } of toWrite) {
    try {
      const outPath = join(STEP11_OUTPUT, outRelPath);
      await ensureDir(outPath);
      await writeFile(outPath, content, "utf-8");
    } catch (err) {
      writeErrors++;
      console.error(`Error writing ${outRelPath}:`, err.message);
    }
  }

  console.log(
    `Step 11 done. ${toWrite.length} files in ${STEP11_OUTPUT}, ${writeErrors} write errors`
  );
}

const isMainModule =
  import.meta.url.endsWith("step11.mjs") &&
  process.argv[1]?.replace(/\\/g, "/").endsWith("step11.mjs");
if (isMainModule) {
  main();
}
