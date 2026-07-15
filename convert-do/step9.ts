import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import { parse, stringify } from "yaml";
import { consola } from "consola";
import {
  collectYmlFiles,
  ensureDir,
  runBatched,
  DEFAULT_CONCURRENCY,
} from "./lib/batch";

/**
 * Step 9 — structure missa sections (ported from step13).
 *
 * Converts introit/oratio/lectio/graduale/… line arrays into typed objects:
 * - verse:      `{ ref, text }`
 * - prayer:     `{ text, closure }`
 * - antiphonal: `{ antiphon, verse }` (graduale also carries `alleluia`)
 *
 * Also cleans the `rule` array (drops Gloria/Credo, lifts `Prefatio=X` into a
 * `prefatio` key). Non-missa keys pass through unchanged.
 */
export type Step9Output = { [key: string]: unknown };

const MISSA_SECTION_TYPES: Record<string, "antiphonal" | "prayer" | "verse"> = {
  introitus: "antiphonal",
  oratio: "prayer",
  lectio: "verse",
  graduale: "antiphonal",
  tractus: "antiphonal",
  gradualep: "antiphonal",
  evangelium: "verse",
  offertorium: "verse",
  secreta: "prayer",
  communio: "verse",
  postcommunio: "prayer",
  "ultima-evangelium": "verse",
};

const V_START = /^\s*v\.\s*/i;
const LECTIO_INTRODUCTION = /^\s*(Léctio|Lectio|Sequéntia|Sequentia)\s+.+$/i;
const ALLELUIA_CUE = /\s*,?\s*Allel[uú]ja\s*,?\s*Allel[uú]ja\.?\s*$/i;
const PREFATIO_PREFIX = /^Prefatio\s*=\s*(.+)$/i;

export function getSectionType(
  key: string
): "antiphonal" | "prayer" | "verse" | null {
  return MISSA_SECTION_TYPES[key.split("/")[0]!] ?? null;
}

function stripLeadingV(text: string): string {
  if (!text || typeof text !== "string") return text;
  const lines = text.split("\n");
  if (lines.length === 0) return text;
  lines[0] = lines[0]!.trim().replace(V_START, "").trim();
  return lines.join("\n").trim();
}

export function linesToVerse(lines: unknown): { ref: string; text: string } {
  if (!Array.isArray(lines) || lines.length === 0) return { ref: "", text: "" };
  let ref = "";
  const textParts: string[] = [];
  for (const line of lines) {
    const s = typeof line === "string" ? line : String(line);
    if (s.startsWith("!")) ref = s.slice(1).trim();
    else if (!s.startsWith("$")) textParts.push(s);
  }
  return { ref, text: stripLeadingV(textParts.join("\n").trim()) };
}

export function linesToPrayer(lines: unknown): { text: string; closure: string } {
  if (!Array.isArray(lines) || lines.length === 0)
    return { text: "", closure: "" };
  let closure = "";
  const textParts: string[] = [];
  for (const line of lines) {
    const s = typeof line === "string" ? line : String(line);
    if (s.startsWith("$")) closure = s.slice(1).trim();
    else textParts.push(s);
  }
  return { text: textParts.join("\n").trim(), closure };
}

function splitRefPair(refStr: string): { antiphonRef: string; verseRef: string } {
  if (!refStr || typeof refStr !== "string")
    return { antiphonRef: "", verseRef: "" };
  const parts = refStr
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return { antiphonRef: refStr.trim(), verseRef: "" };
  const first = parts[0]!;
  const bookMatch = first.match(/^(.+?)\s+\d/);
  const book = bookMatch ? bookMatch[1]!.trim() : "";
  const second = parts[1]!;
  const verseRef = /^\d/.test(second) && book ? `${book} ${second}` : second;
  return { antiphonRef: first, verseRef };
}

type RefSegment = { refIndex: number; start: number; end: number };

/** Parse `!ref`-delimited segments from a line array. */
function parseRefSegments(lines: unknown[]): { refs: string[]; segments: RefSegment[] } {
  const refs: string[] = [];
  const segments: RefSegment[] = [];
  let i = 0;
  while (i < lines.length) {
    const s = typeof lines[i] === "string" ? (lines[i] as string) : String(lines[i]);
    if (s.startsWith("!")) {
      refs.push(s.slice(1).trim());
      const seg: RefSegment = { refIndex: refs.length - 1, start: i + 1, end: i + 1 };
      i++;
      while (i < lines.length) {
        const t =
          typeof lines[i] === "string" ? (lines[i] as string) : String(lines[i]);
        if (t.startsWith("!")) break;
        i++;
      }
      seg.end = i;
      segments.push(seg);
    } else {
      i++;
    }
  }
  return { refs, segments };
}

function segmentLines(lines: unknown[], seg: RefSegment | undefined): string[] {
  if (!seg || seg.end <= seg.start) return [];
  return lines.slice(seg.start, seg.end).filter((l) => !String(l).startsWith("&")) as string[];
}

export function linesToAntiphonal(lines: unknown): {
  antiphon: { ref: string; text: string };
  verse: { ref: string; text: string };
} {
  const empty = { ref: "", text: "" };
  if (!Array.isArray(lines) || lines.length === 0) {
    return { antiphon: { ...empty }, verse: { ...empty } };
  }
  const { refs, segments } = parseRefSegments(lines);
  const antiphonLines = segmentLines(lines, segments[0]);
  const verseLines = segmentLines(lines, segments[1]);
  const antiphonText = stripLeadingV(antiphonLines.join("\n").trim());
  let verseText = verseLines.join("\n").trim();
  // If the verse ends by repeating the antiphon (with or without "v."), drop it.
  if (antiphonText) {
    const verseLinesArr = verseText.split("\n");
    while (verseLinesArr.length > 0) {
      const last = verseLinesArr[verseLinesArr.length - 1]!.trim();
      const lastNorm = last.replace(V_START, "").trim();
      if (lastNorm === antiphonText) {
        verseLinesArr.pop();
        verseText = verseLinesArr.join("\n").trim();
      } else break;
    }
  }
  const pair = splitRefPair(refs[0] ?? "");
  return {
    antiphon: { ref: pair.antiphonRef, text: antiphonText },
    verse: { ref: refs[1] ?? pair.verseRef, text: stripLeadingV(verseText) },
  };
}

function filterGradualeLines(lines: string[]): string[] {
  return lines.filter((l) => String(l).trim() !== "_");
}

export function linesToGraduale(lines: unknown): {
  antiphon: { ref: string; text: string };
  verse: { ref: string; text: string };
  alleluia: { ref: string; text: string };
} {
  const empty = { ref: "", text: "" };
  if (!Array.isArray(lines) || lines.length === 0) {
    return { antiphon: { ...empty }, verse: { ...empty }, alleluia: { ...empty } };
  }
  const { refs, segments } = parseRefSegments(lines);
  const firstBlock = filterGradualeLines(segmentLines(lines, segments[0]));
  const secondBlock = filterGradualeLines(segmentLines(lines, segments[1]));
  const firstText = firstBlock.join("\n").trim();
  const vIdx = firstBlock.findIndex((l) => V_START.test(String(l).trim()));
  let antiphonText = "";
  let verseText = "";
  if (vIdx < 0) {
    antiphonText = stripLeadingV(firstText);
  } else {
    antiphonText = firstBlock.slice(0, vIdx).join("\n").trim();
    const verseBlock = firstBlock.slice(vIdx);
    if (verseBlock.length) {
      verseBlock[0] = String(verseBlock[0]).trim().replace(V_START, "").trim();
      verseText = verseBlock.join("\n").trim();
    }
  }
  const pair = splitRefPair(refs[0] ?? "");
  const secondRef = refs[1] ?? "";
  const isTractus = /^Tractus/i.test(secondRef);
  const alleluiaRef = isTractus ? "" : secondRef;
  const alleluiaText = isTractus
    ? ""
    : stripLeadingV(secondBlock.join("\n").trim());
  const verseTextClean = stripLeadingV(verseText).replace(ALLELUIA_CUE, "").trim();
  return {
    antiphon: { ref: pair.antiphonRef, text: stripLeadingV(antiphonText) },
    verse: { ref: pair.verseRef, text: verseTextClean },
    alleluia: { ref: alleluiaRef, text: alleluiaText },
  };
}

/** Drop Gloria/Credo; lift `Prefatio=X` out as a lowercase `prefatio` value. */
export function transformRule(value: unknown): {
  rule: unknown;
  prefatio: string | undefined;
} {
  if (!Array.isArray(value)) return { rule: value, prefatio: undefined };
  let prefatio: string | undefined = undefined;
  const rule = value.filter((item) => {
    const s = typeof item === "string" ? item : String(item);
    if (s === "Gloria" || s === "Credo") return false;
    const m = s.match(PREFATIO_PREFIX);
    if (m) {
      prefatio = m[1]!.trim().toLowerCase();
      return false;
    }
    return true;
  });
  return { rule, prefatio };
}

function stripLectioIntroduction(text: string): string {
  if (!text || typeof text !== "string") return text;
  const lines = text.split("\n").map((l) => l.trimEnd());
  if (lines.length > 0 && LECTIO_INTRODUCTION.test(lines[0]!)) {
    return lines.slice(1).join("\n").trim();
  }
  return text;
}

function transformSection(
  key: string,
  value: unknown,
  sectionType: "antiphonal" | "prayer" | "verse"
): unknown {
  if (!Array.isArray(value)) return value;
  switch (sectionType) {
    case "verse": {
      const out = linesToVerse(value);
      if (
        key === "lectio" ||
        key.startsWith("lectio/") ||
        key === "evangelium" ||
        key.startsWith("evangelium/")
      ) {
        out.text = stripLectioIntroduction(out.text);
      }
      return out;
    }
    case "prayer":
      return linesToPrayer(value);
    case "antiphonal":
      if (key === "graduale" || key.startsWith("graduale"))
        return linesToGraduale(value);
      return linesToAntiphonal(value);
  }
}

/** Structure one document's missa sections. Exported for the runner and tests. */
export function transform(obj: Record<string, unknown>): Step9Output {
  const result: Step9Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "rule" || key.startsWith("rule/")) {
      const { rule, prefatio } = transformRule(value);
      result[key] = rule;
      if (prefatio !== undefined) {
        const prefatioKey =
          key === "rule" ? "prefatio" : "prefatio/" + key.slice("rule/".length);
        result[prefatioKey] = prefatio;
      }
      continue;
    }
    const sectionType = getSectionType(key);
    result[key] = sectionType ? transformSection(key, value, sectionType) : value;
  }
  return result;
}

/** Batch runner: structures every `.yml` under `inputDir` into `outputDir`. */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const files = await collectYmlFiles(inputDir);
  const mkdirCache = new Set<string>();

  const { processed } = await runBatched(
    files,
    DEFAULT_CONCURRENCY,
    async (rel) => {
      const raw = await readFile(join(inputDir, rel), "utf-8");
      const obj = parse(raw);
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        throw new Error("Expected object");
      }
      const outPath = join(outputDir, rel);
      await ensureDir(outPath, mkdirCache);
      await writeFile(outPath, stringify(transform(obj)), "utf-8");
    }
  );

  return { written: processed };
}
