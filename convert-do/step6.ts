import { join } from "path";
import { readFile } from "fs/promises";
import { parse } from "yaml";
import { Step5Output } from "./step5";

export type Step6Output = Step5Output;

const fileCache = new Map<string, Step5Output | null>();
const MAX_RESOLVE_DEPTH = 5;

function toKebabCase(str: string) {
  if (str == null) return "";
  return String(str).trim().toLowerCase().replace(/\s+/g, "-");
}

function parseSubstitutions(substStr: string) {
  if (!substStr || typeof substStr !== "string") return [];
  const result: { pattern: string; replacement: string; flags: string }[] = [];
  const re = /\s*s\/((?:[^/\\]|\\.)*)\/((?:[^/\\]|\\.)*)\/([igms]*)/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(substStr)) !== null) {
    const pattern = match[1];
    const replacement = match[2];
    const flags = match[3];
    if (pattern == null || replacement == null) continue;
    result.push({
      pattern: pattern.replace(/\\(.)/g, "$1"),
      replacement: replacement.replace(/\\(.)/g, "$1"),
      flags: flags || "",
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
      lineRange: null as { start: number; end: number } | null,
      substitutions: [] as {
        pattern: string;
        replacement: string;
        flags: string;
      }[],
    };
  }

  const parts = remainder.split(":");
  let lineRange: { start: number; end: number } | null = null;
  let substitutionPart: string | undefined;

  if (parts.length > 0 && /^\d+(?:-\d+)?$/.test(parts[parts.length - 1]!)) {
    const [startStr, endStr] = parts.pop()!.split("-");
    const start = Number(startStr);
    const end = Number(endStr ?? startStr);
    lineRange = { start, end };
  }

  if (parts.length > 0 && parts[parts.length - 1]!.trim().startsWith("s/")) {
    substitutionPart = parts.pop();
  }

  const section = parts.join(":").trim();
  const substitutions = substitutionPart
    ? parseSubstitutions(substitutionPart)
    : [];

  return {
    filePath: filePath.trim(),
    section: toKebabCase(section) || "",
    lineRange,
    substitutions,
  };
}

function getBaseSectionName(sectionKey: string) {
  return sectionKey.includes("/") ? sectionKey.split("/")[0]! : sectionKey;
}

function findSectionContent(doc: Step5Output, sectionKey: string) {
  if (!doc || typeof doc !== "object") return null;

  if (sectionKey) {
    if (Array.isArray(doc[sectionKey])) return doc[sectionKey];

    for (const [key, value] of Object.entries(doc)) {
      if (
        key !== "__preamble" &&
        Array.isArray(value) &&
        (key === sectionKey || key.endsWith(`/${sectionKey}`))
      ) {
        return value as Step5Output[string];
      }
    }

    for (const [key, value] of Object.entries(doc)) {
      if (key === "__preamble" || !Array.isArray(value)) continue;
      if (
        key === sectionKey ||
        key.startsWith(`${sectionKey}-`) ||
        key.startsWith(`${sectionKey}/`)
      ) {
        return value as Step5Output[string];
      }
    }
    return null;
  }

  for (const [key, value] of Object.entries(doc)) {
    if (key !== "__preamble" && Array.isArray(value))
      return value as Step5Output[string];
  }
  return null;
}

function conditionKey(condition: string[]) {
  return [...condition].sort().join("|");
}

function pickVariantLines(
  section: Step5Output[string],
  currentCondition: string[]
): string[] {
  if (!section.length) return [];
  const exact = section.find(
    (item) => conditionKey(item.condition) === conditionKey(currentCondition)
  );
  if (exact) return exact.value;
  const fallback = section.find((item) => item.condition.length === 0);
  return (fallback ?? section[0]!).value;
}

function applySubstitutions(
  lines: string[],
  substitutions: { pattern: string; replacement: string; flags: string }[]
) {
  if (!substitutions.length) return lines;
  return lines.map((line) => {
    let result = String(line);
    for (const { pattern, replacement, flags } of substitutions) {
      try {
        result = result.replace(new RegExp(pattern, flags || "g"), replacement);
      } catch {}
    }
    return result;
  });
}

async function getFileContent(basePath: string, filePath: string) {
  const cacheKey = `${basePath}::${filePath}`;
  if (fileCache.has(cacheKey)) return fileCache.get(cacheKey)!;

  const targetPath = join(basePath, `${filePath}.yml`);
  try {
    const raw = await readFile(targetPath, "utf-8");
    const parsed = parse(raw) as Step5Output;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fileCache.set(cacheKey, null);
      return null;
    }
    fileCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    fileCache.set(cacheKey, null);
    return null;
  }
}

async function resolveReference(
  parsedRef: {
    filePath: string;
    section: string;
    lineRange: { start: number; end: number } | null;
    substitutions: { pattern: string; replacement: string; flags: string }[];
  },
  basePath: string,
  currentSectionKey: string,
  currentCondition: string[],
  depth = 0
): Promise<string[] | null> {
  if (depth >= MAX_RESOLVE_DEPTH || !parsedRef.filePath) return null;

  const sectionKey = getBaseSectionName(parsedRef.section || currentSectionKey);
  const doc = await getFileContent(basePath, parsedRef.filePath);
  if (!doc) return null;

  const section = findSectionContent(doc, sectionKey);
  if (!section) return null;

  let resolved = [...pickVariantLines(section, currentCondition)];
  if (parsedRef.lineRange) {
    const { start, end } = parsedRef.lineRange;
    resolved = resolved.slice(
      Math.max(0, start - 1),
      Math.min(resolved.length, end)
    );
  }

  resolved = applySubstitutions(resolved, parsedRef.substitutions);

  if (resolved.length === 1 && typeof resolved[0] === "string") {
    const nestedRef = parseReference(resolved[0]);
    if (nestedRef) {
      const nestedResolved = await resolveReference(
        nestedRef,
        basePath,
        parsedRef.section || currentSectionKey,
        currentCondition,
        depth + 1
      );
      if (nestedResolved) return nestedResolved;
    }
  }

  return resolved;
}

function getLanguageBasePath(inputFile: string) {
  const normalized = inputFile.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const stepIndex = parts.findIndex((part) => part === "step5");
  if (stepIndex < 0 || stepIndex + 1 >= parts.length) {
    throw new Error(`Cannot determine language base path for ${inputFile}`);
  }
  return parts.slice(0, stepIndex + 2).join("/");
}

export async function transform(
  obj: Step5Output,
  inputFile: string
): Promise<Step6Output> {
  const basePath = getLanguageBasePath(inputFile);
  const result: Step6Output = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!Array.isArray(value)) {
      result[key] = value;
      continue;
    }

    const baseSection = getBaseSectionName(key);

    result[key] = await Promise.all(
      value.map(async (item) => {
        const out: string[] = [];
        for (const line of item.value) {
          const parsedRef = parseReference(line);
          if (!parsedRef) {
            out.push(line);
            continue;
          }

          const resolved = await resolveReference(
            parsedRef,
            basePath,
            baseSection,
            item.condition
          );
          if (resolved) out.push(...resolved);
          else out.push(line);
        }
        return { ...item, value: out };
      })
    );
  }

  return result;
}

export function extractDependencies(
  obj: Step5Output,
  outputFile: string
): Set<string> {
  const dependencies = new Set<string>();
  for (const section of Object.values(obj)) {
    if (!Array.isArray(section)) continue;
    for (const item of section) {
      for (const line of item.value) {
        const parsedRef = parseReference(line);
        if (
          parsedRef?.filePath &&
          !outputFile.includes(parsedRef.filePath.replace("/", "\\"))
        )
          dependencies.add(parsedRef.filePath);
      }
    }
  }
  return dependencies;
}
