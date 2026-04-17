import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const fileCache = new Map();

function toKebabCase(str: string) {
  if (str == null) return "";
  return String(str).trim().toLowerCase().replace(/\s+/g, "-");
}

function parseSubstitutions(substStr: string) {
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

function parseReference(str: string) {
  if (typeof str !== "string" || !str.startsWith("@")) return null;
  const rest = str.slice(1);
  const firstColon = rest.indexOf(":");
  const filePath = firstColon >= 0 ? rest.slice(0, firstColon) : rest;
  const remainder = firstColon >= 0 ? rest.slice(firstColon + 1) : "";
  if (!remainder) {
    return {
      filePath: filePath.trim(),
      section: "",
      lineRange: null,
      substitutions: [],
    };
  }
  const parts = remainder.split(":");
  let lineRange = null;
  let substPart = undefined;
  if (parts.length && /^\d(-\d)?$/.test(parts[parts.length - 1]!)) {
    const lr = parts.pop()!;
    const [a, b] = lr.split("-").map(Number);
    lineRange = b != null ? { start: a, end: b } : { start: a, end: a };
  }
  if (parts.length && parts[parts.length - 1]!.trim().startsWith("s/")) {
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

async function getFileContent(basePath: string, relPath: string) {
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

function findSectionContent(doc: { [key: string]: any }, sectionKey: string) {
  if (!doc || typeof doc !== "object") return null;
  if (sectionKey) {
    if (Array.isArray(doc[sectionKey])) return doc[sectionKey];
    for (const [k, v] of Object.entries(doc)) {
      if (
        k !== "__preamble" &&
        (k === sectionKey || k.endsWith("/" + sectionKey)) &&
        Array.isArray(v)
      ) {
        return v;
      }
    }
    // Prefix match: "Ant Vespera" → ant-vespera; key "ant-vespera-3" or "ant-vespera/cisterciensis" also matches
    for (const [k, v] of Object.entries(doc)) {
      if (k === "__preamble" || !Array.isArray(v)) continue;
      if (
        k === sectionKey ||
        k.startsWith(sectionKey + "-") ||
        k.startsWith(sectionKey + "/")
      ) {
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

function applySubstitutions(
  lines: string[],
  substitutions: { pattern: string; replacement: string; flags: string }[]
) {
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

async function resolveReference(
  parsed: {
    filePath: string;
    section: string;
    lineRange: { start: number; end: number };
    substitutions: { pattern: string; replacement: string; flags: string }[];
  },
  currentFileRel: string,
  basePath: string,
  depth = 0,
  currentSectionKey = ""
): Promise<string[] | null> {
  if (depth >= 5) return null;
  const pathParts = currentFileRel.replace(/\\/g, "/").split("/");
  const isBranch = pathParts[0] === "horas" || pathParts[0] === "missa";
  const branch = isBranch ? pathParts[0] : null;
  const language = isBranch ? pathParts[1] : pathParts[0];
  if (!language) return null;

  // When ref has no section (e.g. @Sancti/12-29), use base of current key for lookup:
  // name/1960 → "name", lectio1/1888 → "lectio1", so we resolve to the base section in the target file
  const rawSection = parsed.section || currentSectionKey || "";
  const sectionKey = rawSection.includes("/")
    ? rawSection.replace(/\/.*/, "")
    : rawSection;
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

async function transformObject(
  input: { [key: string]: any },
  currentFileRel: string,
  basePath: string
) {
  const result: { [key: string]: any } = {};
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
      const resolved = await resolveReference(
        parsed,
        currentFileRel,
        basePath,
        0,
        key
      );
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

/**
 * Transform object by resolving @File:Section references.
 * Exported for streaming pipeline.
 *
 * @param {Object} obj - Sections object
 * @param {{ relPath: string }} context - Context with relative path
 * @param {Map<string, Object>} resolvedFiles - Map of outputKey → transformed data (for lookups)
 * @returns {Promise<Object>} Transformed object with references resolved
 */
export async function transform(
  obj: { [key: string]: any },
  context: { relPath: string },
  resolvedFiles: Map<string, { [key: string]: any }>
) {
  // For streaming: use resolvedFiles as the file cache
  // Clear and populate fileCache from resolvedFiles
  fileCache.clear();
  if (resolvedFiles) {
    for (const [key, value] of resolvedFiles) {
      fileCache.set(key + ".yml", value);
    }
  }
  return transformObject(obj, context.relPath, "");
}

/**
 * Extract references from object for dependency analysis.
 * Exported for streaming pipeline.
 *
 * @param {Object} obj - Sections object
 * @returns {Set<string>} Set of referenced file paths
 */
export function extractDependencies(obj: { [key: string]: any }) {
  const deps = new Set();
  for (const [key, value] of Object.entries(obj)) {
    if (key === "__preamble" || !Array.isArray(value)) continue;
    for (const line of value) {
      const parsed = parseReference(line);
      if (parsed?.filePath) {
        deps.add(parsed.filePath);
      }
    }
  }
  return deps;
}
