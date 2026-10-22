import { join } from "path";
import { readFile, writeFile } from "fs/promises";

import {
  LINE_RULES,
  createSourcedResolver,
  withBaseRank,
  type BorrowRules,
  type Doc,
  type Load,
  type Variant,
} from "./lib/broad.js";
import { unionDocuments } from "./lib/variants.js";
import { DEFAULT_CONCURRENCY, ensureDir, runBatched } from "./lib/batch.js";
import { BASE_LANGUAGE } from "./lib/rubrics.js";
import { STEP_EXT, parseStep, stringifyStep } from "./lib/serialize.js";
import { collectDocumentFiles } from "./lib/stores.js";

/**
 * Step 4 — inline references.
 *
 * An inline reference (`@File:Section:lineRange:s/…/…/`) assembles a text: it
 * pulls lines from elsewhere — a whole section, some of its lines, or a section
 * with words substituted — in place of the reference line. Its substitutions
 * and line ranges act on exactly what structuring drops (verse numbers,
 * reference markers, introductions), so it is resolved here, on the lines,
 * before step 5 structures them.
 *
 * A target is read as it stands once its own broad references are taken into
 * account, so a section it only borrows from its common is found in it. The
 * broad references themselves are left for step 7.
 */
export type Step4Output = Doc;

const MAX_RESOLVE_DEPTH = 5;

/**
 * Sections whose inline references step 4 leaves for step 7: the preamble's
 * `@File` lines are whole-file includes, and a rank borrowed by reference is
 * resolved after the broad references.
 */
export const DEFERRED_SECTIONS: ReadonlySet<string> = new Set(["__preamble", "rank"]);

type Substitution = { pattern: string; replacement: string; flags: string };

export type ParsedReference = {
  filePath: string;
  section: string;
  lineRange: { start: number; end: number } | null;
  substitutions: Substitution[];
};

function toKebabCase(str: string) {
  if (str == null) return "";
  return String(str).trim().toLowerCase().replace(/\s+/g, "-");
}

function parseSubstitutions(substStr: string): Substitution[] {
  if (!substStr || typeof substStr !== "string") return [];
  const result: Substitution[] = [];
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

/**
 * Read a reference line. The substitution runs from the first `:s/` (a space
 * may stand before the `s`) to the end
 * of the line — its text may hold a colon of its own — and a line range is read
 * from what precedes it.
 */
export function parseReference(str: string): ParsedReference | null {
  if (typeof str !== "string" || !str.startsWith("@")) return null;
  const rest = str.slice(1);
  const substMatch = /:\s*s\//.exec(rest);
  const head = substMatch ? rest.slice(0, substMatch.index) : rest;
  const substPart = substMatch ? rest.slice(substMatch.index + 1) : "";

  const [filePath = "", ...parts] = head.split(":");
  let lineRange: ParsedReference["lineRange"] = null;
  const last = parts[parts.length - 1]?.trim();
  if (last !== undefined && /^\d+(?:-\d+)?$/.test(last)) {
    parts.pop();
    const [startStr, endStr] = last.split("-");
    const start = Number(startStr);
    lineRange = { start, end: Number(endStr ?? startStr) };
  }

  return {
    filePath: filePath.trim(),
    section: toKebabCase(parts.join(":")),
    lineRange,
    substitutions: parseSubstitutions(substPart),
  };
}

function getBaseSectionName(sectionKey: string) {
  return sectionKey.includes("/") ? sectionKey.split("/")[0]! : sectionKey;
}

function findSectionContent(doc: Doc, sectionKey: string): Variant[] | null {
  if (sectionKey) {
    if (Array.isArray(doc[sectionKey])) return doc[sectionKey] as Variant[];

    for (const [key, value] of Object.entries(doc)) {
      if (
        key !== "__preamble" &&
        Array.isArray(value) &&
        (key === sectionKey || key.endsWith(`/${sectionKey}`))
      ) {
        return value as Variant[];
      }
    }

    for (const [key, value] of Object.entries(doc)) {
      if (key === "__preamble" || !Array.isArray(value)) continue;
      if (
        key === sectionKey ||
        key.startsWith(`${sectionKey}-`) ||
        key.startsWith(`${sectionKey}/`)
      ) {
        return value as Variant[];
      }
    }
    return null;
  }

  for (const [key, value] of Object.entries(doc)) {
    if (key !== "__preamble" && Array.isArray(value)) return value as Variant[];
  }
  return null;
}

function conditionKey(condition: string[]) {
  return [...condition].sort().join("|");
}

/** The target variant for a condition: an exact match, else the default, else the first. */
function pickVariantLines(section: Variant[], currentCondition: string[]): string[] | null {
  if (!section.length) return [];
  const exact = section.find(
    (item) => conditionKey(item.condition) === conditionKey(currentCondition)
  );
  // The most specific variant the current condition already includes: under
  // `1962` and `monastica`, the target's `1962` wording.
  const included = section
    .filter(
      (item) =>
        item.condition.length > 0 && includesAll(currentCondition, item.condition)
    )
    .sort((a, b) => b.condition.length - a.condition.length)[0];
  const chosen =
    exact ??
    included ??
    section.find((item) => item.condition.length === 0) ??
    section[0]!;
  return Array.isArray(chosen.value) ? (chosen.value as string[]) : null;
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
function targetConditions(
  reference: ParsedReference,
  contextPath: string,
  lookup: Load,
  currentSectionKey: string,
  depth = 0
): string[][] {
  if (depth >= MAX_RESOLVE_DEPTH) return [];
  const filePath = reference.filePath || contextPath;
  const doc = lookup(filePath);
  if (!doc) return [];
  const section = findSectionContent(
    doc,
    getBaseSectionName(reference.section || currentSectionKey)
  );
  if (!section) return [];
  const conditions = section.map((item) => item.condition);
  for (const item of section) {
    if (!Array.isArray(item.value) || item.value.length !== 1) continue;
    const nested = parseReference(item.value[0] as string);
    if (!nested) continue;
    conditions.push(
      ...targetConditions(
        nested,
        filePath,
        lookup,
        reference.section || currentSectionKey,
        depth + 1
      )
    );
  }
  return conditions;
}

function applySubstitutions(lines: string[], substitutions: Substitution[]) {
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

/**
 * The lines a reference names, or null where it cannot be resolved. A reference
 * omitting its file names `contextPath` — the file it was found in.
 */
function resolveReference(
  reference: ParsedReference,
  contextPath: string,
  lookup: Load,
  currentSectionKey: string,
  currentCondition: string[],
  depth = 0
): string[] | null {
  if (depth >= MAX_RESOLVE_DEPTH) return null;

  const filePath = reference.filePath || contextPath;
  const sectionKey = getBaseSectionName(reference.section || currentSectionKey);
  const doc = lookup(filePath);
  if (!doc) return null;

  const section = findSectionContent(doc, sectionKey);
  if (!section) return null;

  const picked = pickVariantLines(section, currentCondition);
  if (picked === null) return null;
  let resolved = [...picked];
  if (reference.lineRange) {
    const { start, end } = reference.lineRange;
    resolved = resolved.slice(Math.max(0, start - 1), Math.min(resolved.length, end));
  }

  resolved = applySubstitutions(resolved, reference.substitutions);

  if (resolved.length === 1 && typeof resolved[0] === "string") {
    const nested = parseReference(resolved[0]);
    if (nested) {
      const nestedResolved = resolveReference(
        nested,
        filePath,
        lookup,
        reference.section || currentSectionKey,
        currentCondition,
        depth + 1
      );
      if (nestedResolved) return nestedResolved;
    }
  }

  return resolved;
}

/**
 * Replace every inline reference line with the lines it names. `ownPath` is the
 * document's path below the language root; `lookup` reads a target as its broad
 * references leave it. Only the sections `keys` selects are resolved — by
 * default every one but the preamble and the rank, which step 7 resolves.
 */
export function transform(
  obj: Doc,
  ownPath: string,
  lookup: Load,
  keys: ReadonlySet<string> = new Set(
    Object.keys(obj).filter((key) => !DEFERRED_SECTIONS.has(key))
  )
): Step4Output {
  const result: Step4Output = {};

  for (const [key, value] of Object.entries(obj)) {
    // The preamble's `@File` lines are whole-file includes, for step 7. A rank
    // that is a reference is resolved there too, after the broad references:
    // borrowed by reference, it says how the day is kept, and the borrowings it
    // names are the other day's, not this one's.
    if (!keys.has(key) || !Array.isArray(value)) {
      result[key] = value;
      continue;
    }

    const baseSection = getBaseSectionName(key);
    const resolveUnder = (lines: string[], condition: string[]) => {
      const out: string[] = [];
      for (const line of lines) {
        const reference = parseReference(line);
        if (!reference) {
          out.push(line);
          continue;
        }
        const resolved = resolveReference(reference, ownPath, lookup, baseSection, condition);
        if (resolved) out.push(...resolved);
        else out.push(line);
      }
      return out;
    };

    const variants = value as Variant[];
    const resolvedItems = variants.map((item) =>
      Array.isArray(item.value)
        ? { ...item, value: resolveUnder(item.value as string[], item.condition) }
        : item
    );

    // In the Martyrology, the rubrics the entries vary by and a variant of the
    // list does not name: each gets a copy of that variant, resolved under both
    // conditions, unless the list already has a variant at least as specific
    // for it. Elsewhere a day's Mass and Office are separate documents, so a
    // target's variant may be the Office's wording rather than another rubric's.
    const written = new Set(variants.map((item) => conditionKey(item.condition)));
    const extra: Variant[] = [];
    for (const item of isMartyrology(ownPath) ? variants : []) {
      if (!Array.isArray(item.value)) continue;
      const references = (item.value as string[]).flatMap((line) => {
        const reference = parseReference(line);
        return reference ? [reference] : [];
      });
      for (const reference of references) {
        for (const target of targetConditions(reference, ownPath, lookup, baseSection)) {
          if (target.length === 0 || includesAll(item.condition, target)) continue;
          const combined = [...new Set([...item.condition, ...target])].sort();
          const label = conditionKey(combined);
          if (written.has(label)) continue;
          const ownVariant = variants.some(
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
            value: resolveUnder(item.value as string[], combined),
            condition: combined,
          });
        }
      }
    }

    result[key] = [...resolvedItems, ...extra];
  }

  return result;
}

/**
 * The sources a day is held in from step 2 to step 7, lowest priority first:
 * its Office and its Mass. Where both give a section under one condition, the
 * Mass's wins.
 */
export const SOURCES = ["horas", "missa"] as const;

/** One language's documents, by source and by path below the source. */
export type LanguageTree = Map<string, Map<string, Doc>>;

/**
 * Where a document sits: its language, its source and its path below that,
 * without extension — `la/missa/Sancti/01-01.json` is `la`, `missa`,
 * `Sancti/01-01`.
 */
export function locate(relPath: string): { language: string; source: string; path: string } {
  const [language = "", source = "", ...rest] = relPath.split(/[/\\]/);
  if (!(SOURCES as readonly string[]).includes(source)) {
    throw new Error(`Not filed under a source (${SOURCES.join(", ")}): ${relPath}`);
  }
  return {
    language,
    source,
    path: rest.join("/").replace(new RegExp(`\\${STEP_EXT}$`, "i"), ""),
  };
}

/**
 * Read a whole tree into memory, by language, source and path. Steps 4 and 7
 * look any document of a language up by its path.
 */
export async function readTree(inputDir: string): Promise<Map<string, LanguageTree>> {
  const tree = new Map<string, LanguageTree>();
  const files = (await collectDocumentFiles(inputDir)).sort();
  await runBatched(files, DEFAULT_CONCURRENCY, async (rel) => {
    const { language, source, path } = locate(rel);
    const doc = parseStep(await readFile(join(inputDir, rel), "utf-8")) as Doc;
    if (!tree.has(language)) tree.set(language, new Map());
    const bySource = tree.get(language)!;
    if (!bySource.has(source)) bySource.set(source, new Map());
    bySource.get(source)!.set(path, doc);
  });
  return tree;
}

/**
 * A resolver over one language's documents, each given the base language's rank
 * where it has none of its own — the rank of the base language's day, its Mass
 * and its Office together.
 */
export function languageResolver(
  tree: Map<string, LanguageTree>,
  language: string,
  rules: BorrowRules
) {
  const own = tree.get(language) ?? new Map<string, Map<string, Doc>>();
  const base = language === BASE_LANGUAGE ? undefined : tree.get(BASE_LANGUAGE);
  const baseDay = (path: string): Doc | undefined => {
    let combined: Doc | undefined;
    for (const source of SOURCES) {
      const doc = base?.get(source)?.get(path);
      if (doc) combined = combined === undefined ? doc : unionDocuments(combined, doc);
    }
    return combined;
  };
  return createSourcedResolver(
    (source, path) => withBaseRank(own.get(source)?.get(path), baseDay(path)),
    SOURCES,
    rules
  );
}

/** Every document of a language, in a fixed order: source, then path. */
export function documentsOf(languageTree: LanguageTree): { source: string; path: string; doc: Doc }[] {
  return SOURCES.flatMap((source) => {
    const docs = languageTree.get(source) ?? new Map<string, Doc>();
    return [...docs.keys()].sort().map((path) => ({ source, path, doc: docs.get(path)! }));
  });
}

/** Batch runner: resolves the inline references of every document. */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const tree = await readTree(inputDir);
  const mkdirCache = new Set<string>();
  let written = 0;

  for (const [language, languageTree] of tree) {
    // A target is read as its broad references leave it, its Mass and Office
    // together.
    const { view } = languageResolver(tree, language, LINE_RULES);
    // Visited in a fixed order: which side of a borrowing cycle sees the other
    // depends on which is reached first.
    const { processed } = await runBatched(
      documentsOf(languageTree),
      DEFAULT_CONCURRENCY,
      async ({ source, path, doc }) => {
        const out = transform(doc, path, view);
        const outPath = join(outputDir, language, source, path + STEP_EXT);
        await ensureDir(outPath, mkdirCache);
        await writeFile(outPath, stringifyStep(out), "utf-8");
      }
    );
    written += processed;
  }

  return { written };
}
