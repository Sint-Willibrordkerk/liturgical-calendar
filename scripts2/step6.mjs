import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP5_INPUT = join(PROJECT_BASE, ".divinum-officium", "step5");
const STEP6_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step6");
const CONCURRENCY = 150;

/**
 * Conditionals step: process inline conditions in array values per Divinum Officium technical docs.
 * https://www.divinumofficium.com/www/horas/Help/technical.html
 * Lines like (sed rubrica 196 aut rubrica 1930) scope the following lines to those rubrics.
 * Output: content split into base key and key/rubric variants (no condition lines in output).
 */

function toKebabCase(str) {
  if (str == null) return "";
  return String(str).trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Check if line is or starts with a condition in parentheses. Returns { condition, rest }
 * or null. Handles one level of parentheses.
 */
function parseConditionLine(line) {
  if (typeof line !== "string") return null;
  const s = line.trim();
  if (!s.startsWith("(")) return null;
  let depth = 0;
  let end = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const condition = s.slice(1, end).trim();
  const rest = s.slice(end + 1).trim();
  return { condition, rest };
}

/**
 * Extract rubric identifiers from condition text.
 * Per technical: rubrica 196, rubrica 1930, rubrica tridentina, etc.
 * Split by " aut " and " et "; extract "rubrica X" or "rubricis X"; nisi = except.
 */
function extractRubricNamesFromCondition(conditionText) {
  if (!conditionText || typeof conditionText !== "string") return [];
  let c = conditionText
    .replace(/\b(?:omittitur|omittuntur|dicitur|dicuntur|semper)\b/gi, " ")
    .replace(/\bnisi\s+/gi, " ")
    .replace(/^\s*(?:sed|vero|atque|attamen|si|deinde)\s+/i, " ")
    .trim();
  const clauses = c.split(/\s+aut\s+|\s+et\s+/i).map((s) => s.trim()).filter(Boolean);
  const names = [];
  const seen = new Set();
  for (const clause of clauses) {
    const rubricaMatch = clause.match(/^(?:rubrica|rubricis)\s+(.+)$/i);
    const name = rubricaMatch ? toKebabCase(rubricaMatch[1]) : toKebabCase(clause);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/**
 * Split array of lines by inline conditions; return { baseKey: lines, "key/rubric": lines }.
 * Condition lines are not included in output. Lines after (condition) go to each listed rubric.
 */
function processArrayWithConditionals(lines, baseKey) {
  const out = { [baseKey]: [] };
  let currentRubrics = null;

  for (const line of lines) {
    const parsed = parseConditionLine(line);
    if (parsed) {
      const rubricNames = extractRubricNamesFromCondition(parsed.condition);
      currentRubrics = rubricNames.length > 0 ? rubricNames : null;
      if (parsed.rest) {
        const target = currentRubrics && currentRubrics.length > 0 ? currentRubrics : [null];
        for (const r of target) {
          const k = r ? `${baseKey}/${r}` : baseKey;
          if (!out[k]) out[k] = [];
          out[k].push(parsed.rest);
        }
      }
      continue;
    }

    if (currentRubrics && currentRubrics.length > 0) {
      for (const r of currentRubrics) {
        const k = `${baseKey}/${r}`;
        if (!out[k]) out[k] = [];
        out[k].push(line);
      }
    } else {
      out[baseKey].push(line);
    }
  }

  return out;
}

/**
 * Transform one object: process array values with processArrayWithConditionals only for
 * base keys (no "/"). Keys that already have a rubric suffix (key/xxx) are copied as-is
 * to avoid double expansion.
 */
function transformObject(input) {
  const result = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === "__preamble") {
      result.__preamble = value;
      continue;
    }
    if (!Array.isArray(value)) {
      result[key] = value;
      continue;
    }

    if (key.includes("/")) {
      result[key] = value;
      continue;
    }

    const segments = processArrayWithConditionals(value, key);

    for (const [k, arr] of Object.entries(segments)) {
      if (arr.length === 0) continue;
      if (!result[k]) result[k] = [];
      result[k].push(...arr);
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
  await rm(STEP6_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP6_OUTPUT, { recursive: true });

  const files = await collectYmlFiles(STEP5_INPUT);
  const mkdirCache = new Set();

  const { processed, errors } = await runBatched(
    files,
    CONCURRENCY,
    async (rel) => {
      const inputPath = join(STEP5_INPUT, rel);
      const outputPath = join(STEP6_OUTPUT, rel);
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

  console.log(`Step 6 (conditionals) done. ${processed} files in ${STEP6_OUTPUT}, ${errors} errors`);
}

main();
