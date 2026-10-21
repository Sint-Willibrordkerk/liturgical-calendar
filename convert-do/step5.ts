import { join } from "path";
import { readFile } from "fs/promises";

import { Step4Output } from "./step4";
import { STEP_EXT, parseStep } from "./lib/serialize.js";

export type Step5Output = Step4Output;

const fileCache = new Map<string, Step4Output | null>();
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

function findSectionContent(doc: Step4Output, sectionKey: string) {
  if (!doc || typeof doc !== "object") return null;

  if (sectionKey) {
    if (Array.isArray(doc[sectionKey])) return doc[sectionKey];

    for (const [key, value] of Object.entries(doc)) {
      if (
        key !== "__preamble" &&
        Array.isArray(value) &&
        (key === sectionKey || key.endsWith(`/${sectionKey}`))
      ) {
        return value as Step4Output[string];
      }
    }

    for (const [key, value] of Object.entries(doc)) {
      if (key === "__preamble" || !Array.isArray(value)) continue;
      if (
        key === sectionKey ||
        key.startsWith(`${sectionKey}-`) ||
        key.startsWith(`${sectionKey}/`)
      ) {
        return value as Step4Output[string];
      }
    }
    return null;
  }

  for (const [key, value] of Object.entries(doc)) {
    if (key !== "__preamble" && Array.isArray(value))
      return value as Step4Output[string];
  }
  return null;
}

function conditionKey(condition: string[]) {
  return [...condition].sort().join("|");
}

function pickVariantLines(
  section: Step4Output[string],
  currentCondition: string[]
): string[] {
  if (!section.length) return [];
  const exact = section.find(
    (item) => conditionKey(item.condition) === conditionKey(currentCondition)
  );
  if (exact) return exact.value;
  // The most specific variant the current condition already includes: under
  // `1962` and `monastica`, the target's `1962` wording.
  const included = section
    .filter(
      (item) =>
        item.condition.length > 0 &&
        includesAll(currentCondition, item.condition)
    )
    .sort((a, b) => b.condition.length - a.condition.length)[0];
  if (included) return included.value;
  const fallback = section.find((item) => item.condition.length === 0);
  return (fallback ?? section[0]!).value;
}

/** True for a day of the Martyrology, whose sections are its entries. */
function isMartyrology(path: string) {
  return path.startsWith("Martyrologium/");
}

function includesAll(condition: string[], tokens: string[]) {
  return tokens.every((token) => condition.includes(token));
}

/**
 * The conditions a reference's target varies by, as far as that target can be
 * read: those of the section it names, and of what that section in turn refers
 * to, where it is itself no more than a reference.
 */
async function targetConditions(
  parsedRef: NonNullable<ReturnType<typeof parseReference>>,
  basePath: string,
  currentSectionKey: string,
  depth = 0
): Promise<string[][]> {
  if (depth >= MAX_RESOLVE_DEPTH || !parsedRef.filePath) return [];
  const doc = await getFileContent(basePath, parsedRef.filePath);
  if (!doc) return [];
  const section = findSectionContent(
    doc,
    getBaseSectionName(parsedRef.section || currentSectionKey)
  );
  if (!section) return [];
  const conditions = section.map((item) => item.condition);
  for (const item of section) {
    if (item.value.length !== 1) continue;
    const nested = parseReference(item.value[0]!);
    if (!nested) continue;
    conditions.push(
      ...(await targetConditions(
        nested,
        basePath,
        parsedRef.section || currentSectionKey,
        depth + 1
      ))
    );
  }
  return conditions;
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

  const targetPath = join(basePath, `${filePath}${STEP_EXT}`);
  try {
    const raw = await readFile(targetPath, "utf-8");
    const parsed = parseStep(raw) as Step4Output;
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
  const stepIndex = parts.findIndex((part) => /^step\d+$/.test(part));
  if (stepIndex < 0 || stepIndex + 1 >= parts.length) {
    throw new Error(`Cannot determine language base path for ${inputFile}`);
  }
  return parts.slice(0, stepIndex + 2).join("/");
}

export async function transform(
  obj: Step4Output,
  inputFile: string
): Promise<Step5Output> {
  const basePath = getLanguageBasePath(inputFile);
  // The current file's own path relative to the language root, used to resolve
  // references whose `File` part is omitted (`@:Section`) against this file.
  const selfPath = inputFile
    .replace(/\\/g, "/")
    .slice(basePath.length)
    .replace(/^\/+/, "")
    .replace(new RegExp(`\\${STEP_EXT}$`, "i"), "");
  const result: Step5Output = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!Array.isArray(value)) {
      result[key] = value;
      continue;
    }

    const baseSection = getBaseSectionName(key);
    const references = (lines: string[]) =>
      lines.flatMap((line) => {
        const parsedRef = parseReference(line);
        if (!parsedRef) return [];
        return [parsedRef.filePath ? parsedRef : { ...parsedRef, filePath: selfPath }];
      });

    const resolveUnder = async (lines: string[], condition: string[]) => {
      const out: string[] = [];
      for (const line of lines) {
        const parsedRef = parseReference(line);
        if (!parsedRef) {
          out.push(line);
          continue;
        }

        const resolved = await resolveReference(
          parsedRef.filePath ? parsedRef : { ...parsedRef, filePath: selfPath },
          basePath,
          baseSection,
          condition
        );
        if (resolved) out.push(...resolved);
        else out.push(line);
      }
      return out;
    };

    const resolvedItems = await Promise.all(
      value.map(async (item) => ({
        ...item,
        value: await resolveUnder(item.value, item.condition),
      }))
    );

    // In the Martyrology, the rubrics the entries vary by and a variant of the
    // list does not name: each gets a copy of that variant, resolved under both
    // conditions, unless the list already has a variant at least as specific
    // for it. Elsewhere a day's Mass and Office share a file, so a target's
    // variant may be the Office's wording rather than another rubric's.
    const written = new Set(value.map((item) => conditionKey(item.condition)));
    const extra: typeof resolvedItems = [];
    for (const item of isMartyrology(selfPath) ? value : []) {
      for (const ref of references(item.value)) {
        for (const target of await targetConditions(ref, basePath, baseSection)) {
          if (target.length === 0 || includesAll(item.condition, target)) continue;
          const combined = [...new Set([...item.condition, ...target])].sort();
          const label = conditionKey(combined);
          if (written.has(label)) continue;
          const ownVariant = value.some(
            (other) =>
              other !== item &&
              includesAll(other.condition, item.condition) &&
              other.condition.length > item.condition.length &&
              includesAll(combined, other.condition)
          );
          if (ownVariant) continue;
          written.add(label);
          extra.push({
            ...item,
            value: await resolveUnder(item.value, combined),
            condition: combined,
          });
        }
      }
    }

    result[key] = [...resolvedItems, ...extra];
  }

  return result;
}

export function extractDependencies(
  obj: Step4Output,
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
