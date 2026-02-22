import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP6_INPUT = join(PROJECT_BASE, ".divinum-officium", "step6");
const STEP7_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step7");
const CONCURRENCY = 150;
const MAX_RESOLVE_DEPTH = 3;

const fileCache = new Map();

function toKebabCase(str) {
  if (str == null) return "";
  return String(str).trim().toLowerCase().replace(/\s+/g, "-");
}

function parseSubstitutions(substStr) {
  if (!substStr || typeof substStr !== "string") return [];
  const result = [];
  const re = /\s*s\/((?:[^/\\]|\\.)*)\/((?:[^/\\]|\\.)*)\/([igms]*)/g;
  let m;
  while ((m = re.exec(substStr)) !== null) {
    result.push({
      pattern: m[1].replace(/\\(.)/g, "$1"),
      replacement: m[2].replace(/\\(.)/g, "$1"),
      flags: m[3] || "",
    });
  }
  return result;
}

function parseReference(str) {
  if (typeof str !== "string" || !str.startsWith("@")) return null;
  const rest = str.slice(1);
  const firstColon = rest.indexOf(":");
  const filePath = firstColon >= 0 ? rest.slice(0, firstColon) : rest;
  const remainder = firstColon >= 0 ? rest.slice(firstColon + 1) : "";
  if (!remainder) {
    return { filePath: filePath.trim(), section: "", lineRange: null, substitutions: [] };
  }
  const parts = remainder.split(":");
  let lineRange = null;
  let substPart = undefined;
  if (parts.length && /^\d(-\d)?$/.test(parts[parts.length - 1])) {
    const lr = parts.pop();
    const [a, b] = lr.split("-").map(Number);
    lineRange = b != null ? { start: a, end: b } : { start: a, end: a };
  }
  if (parts.length && parts[parts.length - 1].trim().startsWith("s/")) {
    substPart = parts.pop();
  }
  const section = parts.join(":").trim();
  const substitutions = substPart ? parseSubstitutions(substPart) : [];
  return {
    filePath: filePath.trim(),
    section: toKebabCase(section) || "",
    lineRange,
    substitutions,
  };
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

function findSectionContent(doc, sectionKey) {
  if (!doc || typeof doc !== "object") return null;
  if (sectionKey) {
    if (Array.isArray(doc[sectionKey])) return doc[sectionKey];
    for (const [k, v] of Object.entries(doc)) {
      if (k !== "__preamble" && (k === sectionKey || k.endsWith("/" + sectionKey)) && Array.isArray(v)) {
        return v;
      }
    }
    // Prefix match: "Ant Vespera" → ant-vespera; key "ant-vespera-3" or "ant-vespera/cisterciensis" also matches
    for (const [k, v] of Object.entries(doc)) {
      if (k === "__preamble" || !Array.isArray(v)) continue;
      if (k === sectionKey || k.startsWith(sectionKey + "-") || k.startsWith(sectionKey + "/")) {
        return v;
      }
    }
    return null;
  }
  for (const [k, v] of Object.entries(doc)) {
    if (k !== "__preamble" && Array.isArray(v)) return v;
  }
  return null;
}

function applySubstitutions(lines, substitutions) {
  if (!substitutions.length) return lines;
  return lines.map((line) => {
    let s = String(line);
    for (const { pattern, replacement, flags } of substitutions) {
      try {
        const re = new RegExp(pattern, flags || "g");
        s = s.replace(re, replacement);
      } catch (_) {}
    }
    return s;
  });
}

async function resolveReference(parsed, currentFileRel, basePath, depth = 0, currentSectionKey = "") {
  if (depth >= MAX_RESOLVE_DEPTH) return null;
  const pathParts = currentFileRel.replace(/\\/g, "/").split("/");
  const isBranch = pathParts[0] === "horas" || pathParts[0] === "missa";
  const branch = isBranch ? pathParts[0] : null;
  const language = isBranch ? pathParts[1] : pathParts[0];
  if (!language) return null;

  // When ref has no section (e.g. @Sancti/12-29), use base of current key for lookup:
  // name/1960 → "name", lectio1/1888 → "lectio1", so we resolve to the base section in the target file
  const rawSection = parsed.section || currentSectionKey || "";
  const sectionKey = rawSection.includes("/") ? rawSection.replace(/\/.*/, "") : rawSection;
  let content = null;
  let doc = null;

  if (parsed.filePath) {
    if (branch) {
      const branchesToTry = branch === "missa" ? ["missa", "horas"] : [branch];
      for (const b of branchesToTry) {
        const targetRel = `${b}/${language}/${parsed.filePath}.yml`;
        doc = await getFileContent(basePath, targetRel);
        if (doc) {
          content = findSectionContent(doc, sectionKey);
          if (content) break;
        }
      }
    } else {
      const targetRel = `${language}/${parsed.filePath}.yml`;
      doc = await getFileContent(basePath, targetRel);
      if (doc) content = findSectionContent(doc, sectionKey);
    }
  } else {
    const currentRel = currentFileRel.replace(/\\/g, "/");
    doc = await getFileContent(basePath, currentRel);
    if (doc) content = findSectionContent(doc, sectionKey);
  }

  if (!content) return null;
  content = [...content];
  if (parsed.lineRange) {
    const { start, end } = parsed.lineRange;
    const from = Math.max(0, start - 1);
    const to = Math.min(content.length, end);
    content = content.slice(from, to);
  }
  content = applySubstitutions(content, parsed.substitutions);
  // If resolved content is a single reference line, resolve it recursively
  if (content.length === 1 && typeof content[0] === "string") {
    const inner = parseReference(content[0]);
    if (inner) {
      const innerResolved = await resolveReference(
        inner,
        currentFileRel,
        basePath,
        depth + 1,
        parsed.section || currentSectionKey
      );
      if (innerResolved) return innerResolved;
    }
  }
  return content;
}

async function transformObject(input, currentFileRel, basePath) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "__preamble") {
      result[key] = value;
      continue;
    }
    if (!Array.isArray(value)) {
      result[key] = value;
      continue;
    }
    const out = [];
    for (const line of value) {
      const parsed = parseReference(line);
      if (!parsed) {
        out.push(line);
        continue;
      }
      const resolved = await resolveReference(parsed, currentFileRel, basePath, 0, key);
      if (resolved) {
        out.push(...resolved);
      } else {
        out.push(line);
      }
    }
    result[key] = out;
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
  await rm(STEP7_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP7_OUTPUT, { recursive: true });

  const files = await collectYmlFiles(STEP6_INPUT);
  const mkdirCache = new Set();

  const { processed, errors } = await runBatched(
    files,
    CONCURRENCY,
    async (rel) => {
      const inputPath = join(STEP6_INPUT, rel);
      const outputPath = join(STEP7_OUTPUT, rel);
      const raw = await readFile(inputPath, "utf-8");
      const obj = parse(raw);
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        throw new Error("Expected object");
      }
      const out = await transformObject(obj, rel, STEP6_INPUT);
      await ensureDir(outputPath, mkdirCache);
      await writeFile(outputPath, stringify(out), "utf-8");
    }
  );

  console.log(`Step 7 done. ${processed} files in ${STEP7_OUTPUT}, ${errors} errors`);
}

main();
