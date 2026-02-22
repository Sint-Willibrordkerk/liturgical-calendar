import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP4_INPUT = join(PROJECT_BASE, ".divinum-officium", "step4a");
const STEP5_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step5");
const CONCURRENCY = 150;

const KEY_REGEX = /^\[(.*?)\](?:\s*\((.*?)\))?$/s;

function toKebabCase(str) {
  if (str == null) return "";
  return String(str).trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * If key is [base] or [base]/suffix (from step4 rubric merge), normalize to base or base/suffix
 * without brackets. Returns normalized key or original.
 */
function normalizeBracketKey(key) {
  const m = String(key).match(/^\[([^\]]*)\](?:\/(.*))?$/);
  if (!m) return key;
  const base = toKebabCase(m[1]);
  const suffix = m[2] != null && m[2].trim() !== "" ? m[2].trim() : "";
  return suffix ? `${base}/${suffix}` : base;
}

function parseKey(fullKey) {
  if (fullKey === "__preamble") return { realKey: "__preamble", condition: "" };
  const m = String(fullKey).match(KEY_REGEX);
  if (!m) return { realKey: fullKey, condition: "" };
  return { realKey: m[1].trim(), condition: (m[2] || "").trim() };
}

function conditionEffect(condition) {
  if (!condition) return "onlyIn";
  return /\b(?:omittitur|omittuntur|nisi)\b/i.test(condition)
    ? "exceptIn"
    : "onlyIn";
}

function extractRubricNames(condition) {
  if (!condition) return [];
  let c = condition
    .replace(/\b(?:omittitur|omittuntur|dicitur|dicuntur)\b/gi, " ")
    .replace(/\bnisi\s+/gi, " ")
    .replace(/^\s*(?:sed|vero|atque|attamen|si|deinde)\s+/i, " ")
    .trim();
  const clauses = c
    .split(/\s+aut\s+|\s+et\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const names = [];
  const seen = new Set();
  for (const clause of clauses) {
    const rubricaMatch = clause.match(/^(?:rubrica|rubricis)\s+(.+)$/i);
    const name = rubricaMatch
      ? toKebabCase(rubricaMatch[1])
      : toKebabCase(clause);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function transformObject(input) {
  const result = {};
  for (const [fullKey, value] of Object.entries(input)) {
    if (fullKey === "__preamble") {
      result.__preamble = value;
      continue;
    }
    const key = normalizeBracketKey(fullKey);
    const { realKey, condition } = parseKey(key);
    const baseKey = toKebabCase(realKey);
    if (!condition) {
      result[baseKey] = value;
      continue;
    }
    const effect = conditionEffect(condition);
    const rubricNames = extractRubricNames(condition);
    if (rubricNames.length === 0) {
      const fallback = toKebabCase(condition);
      if (effect === "onlyIn") {
        result[fallback ? `${baseKey}/${fallback}` : baseKey] = value;
      } else {
        result[baseKey] = value;
        if (fallback) result[`${baseKey}/${fallback}`] = [];
      }
      continue;
    }
    if (effect === "onlyIn") {
      for (const name of rubricNames) {
        result[`${baseKey}/${name}`] = value;
      }
    } else {
      result[baseKey] = value;
      for (const name of rubricNames) {
        result[`${baseKey}/${name}`] = [];
      }
    }
  }
  return result;
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
  await rm(STEP5_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP5_OUTPUT, { recursive: true });

  const files = await collectYmlFiles(STEP4_INPUT);
  const mkdirCache = new Set();

  const { processed, errors } = await runBatched(
    files,
    CONCURRENCY,
    async (rel) => {
      const inputPath = join(STEP4_INPUT, rel);
      const outputPath = join(STEP5_OUTPUT, rel);
      const raw = await readFile(inputPath, "utf-8");
      const obj = parse(raw);
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        throw new Error("Expected object");
      }
      const out = transformObject(obj);
      await ensureDir(outputPath, mkdirCache);
      await writeFile(outputPath, stringify(out), "utf-8");
    }
  );

  console.log(
    `Step 5 done. ${processed} files in ${STEP5_OUTPUT}, ${errors} errors`
  );
}

main();
