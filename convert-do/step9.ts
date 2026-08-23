import { join } from "path";
import { readFile, writeFile } from "fs/promises";

import { consola } from "consola";
import {
  collectYmlFiles,
  ensureDir,
  runBatched,
  DEFAULT_CONCURRENCY,
} from "./lib/batch";
import { isVariantArray, mapVariants } from "./lib/variants";
import { canonicalizeRef } from "./lib/references.js";
import { STEP_EXT, stripStepExt, parseStep, stringifyStep } from "./lib/serialize.js";

/**
 * Step 9 — structure missa sections (ported from step13).
 *
 * Converts introit/oratio/lectio/graduale/… line arrays into typed objects:
 * - verse:      `{ ref, text }`
 * - prayer:     `{ text, closure }`
 * - antiphonal: `{ antiphon, verse }`
 *
 * A gradual's Alleluia is lifted into its own section (`alleluia`, and
 * `alleluiap` for the paschal form), as `Prefatio=X` is lifted out of `rule`.
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

/**
 * The readings of Matins: `lectio1` … `lectio9`, plus the `…-in-N-loco` forms
 * that place a reading elsewhere in the Office. `lectio` itself (the Mass
 * reading) is covered by the table above, and `lectio-prima` is not a reading.
 */
const MATINS_READING = /^lectio\d+(-in-\d+-loco)?$/;

/** The Mass readings. `offertorium`/`communio` are antiphons, not readings. */
const MASS_READINGS = new Set(["lectio", "evangelium", "ultima-evangelium"]);

/** True for a section holding a reading, at Mass or at Matins. */
export function isReadingSection(key: string): boolean {
  const base = key.split("/")[0]!;
  return MASS_READINGS.has(base) || MATINS_READING.test(base);
}

export function getSectionType(
  key: string
): "antiphonal" | "prayer" | "verse" | null {
  const base = key.split("/")[0]!;
  if (MATINS_READING.test(base)) return "verse";
  return MISSA_SECTION_TYPES[base] ?? null;
}

/** How many reference markers a reading's lines carry. */
function countRefMarkers(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;
  return lines.filter((l) => typeof l === "string" && l.startsWith("!")).length;
}

/**
 * A reference naming a book, chapter and verse (`2 Cor 1:1-5`, `Matt 11:25-30`)
 * rather than a patristic citation (`Sermo 1 de Nativitate Domini`).
 */
const BIBLICAL_REF = /^[1-3]?\s*[A-Za-zÀ-ÿ.]+\.?\s+\d+[:.]\d+/;

/** A line announcing the passage the reference already names. */
const READING_INTRODUCTION =
  /^\s*(Léctio|Lectio|Sequéntia|Sequentia|Incipit|De|Ex)\s+\S/i;

/** A body line opening with its verse number. */
const VERSE_NUMBER = /^\s*\d+\s+(?=\S)/;

export type Reading =
  | { ref: string; verses: string[] }
  | { ref: string; text: string }
  | { text: string };

/**
 * Structure a reading's lines. A biblical reference drops the introduction and
 * splits the body into verses; any other reference keeps its introduction, since
 * there that line names the author; with no reference the lines are kept as
 * text. A reading carrying several references is left to the caller.
 */
export function linesToReading(lines: unknown): Reading {
  if (!Array.isArray(lines) || lines.length === 0) return { text: "" };

  const markerAt = lines.findIndex(
    (l) => typeof l === "string" && l.startsWith("!")
  );
  const body = (from: number) =>
    lines
      .slice(from)
      .map((l) => (typeof l === "string" ? l : String(l)))
      .filter((s) => !s.startsWith("$") && !s.startsWith("!"));

  if (markerAt === -1) {
    return { text: stripLeadingV(body(0).join("\n").trim()) };
  }

  const ref = canonicalizeRef(String(lines[markerAt]).slice(1).trim());
  if (!BIBLICAL_REF.test(ref)) {
    return { ref, text: stripLeadingV(body(0).join("\n").trim()) };
  }

  // Biblical: the line above the marker only announces the passage.
  const before = body(0).slice(0, markerAt);
  const after = body(markerAt + 1);
  const kept =
    before.length && READING_INTRODUCTION.test(before[before.length - 1]!)
      ? before.slice(0, -1)
      : before;

  const verses = [...kept, ...after]
    .map((s) => stripLeadingV(s.replace(VERSE_NUMBER, "").trim()))
    .filter((s) => s !== "");
  return { ref, verses };
}

/**
 * A reading is only structured when it carries at most one reference marker.
 * With several, structuring it would keep one reference and lose the interior
 * ones, so it keeps its lines and step 10 leaves it inline.
 */
function canStructureReading(lines: unknown): boolean {
  return countRefMarkers(lines) <= 1;
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
    if (s.startsWith("!")) ref = canonicalizeRef(s.slice(1).trim());
    else if (!s.startsWith("$")) textParts.push(s);
  }
  return {
    ref,
    text: stripTrailingAlleluia(stripLeadingV(textParts.join("\n").trim())),
  };
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

/**
 * Strip the `Allelúja` a chant's text trails off with.
 *
 * The Alleluia is the response sung after the words, not part of them, and the
 * sources append it — once, or two and three times over — to antiphons and
 * verses throughout paschaltide. The punctuation that introduced it goes with
 * it, and the sentence is closed off again.
 */
export function stripTrailingAlleluia(text: string): string {
  if (typeof text !== "string" || text === "") return text;
  let t = text.replace(/(?:\s*\ballel[uú]ja\b[\s,.;]*)+$/i, "");
  if (t === text) return text;
  t = t.replace(/[\s,;]+$/, "");
  return t === "" || /[.!?:]$/.test(t) ? t : `${t}.`;
}

/** A line that is nothing but the `Allelúja, allelúja.` opening cue. */
const ALLELUIA_OPENING = /^\s*Allel[uú]ja\s*,?\s*Allel[uú]ja\.?\s*$/i;

export type AlleluiaVerses = { verses: { ref: string; text: string }[] };

/**
 * A marker naming the chant that follows rather than citing its source. It marks
 * where that chant begins, and gives its verse no reference of its own.
 */
const CHANT_LABEL = /^(Tractus|Allel[uú]ja)\.?$/i;

/**
 * Structure an extended Alleluia: the `Allelúja, allelúja.` opening followed by
 * its verses.
 *
 * This is the paschal chant that replaces the Gradual — it is an Alleluia rather
 * than a gradual, so it is a list of verses rather than an antiphon and a verse.
 * A verse opens at its `!ref`, or at a `v.` where the source gives none.
 * The opening is dropped: it is the same words every time, and the section
 * being an Alleluia already says them.
 */
export function linesToVerses(lines: unknown): AlleluiaVerses {
  if (!Array.isArray(lines)) return { verses: [] };

  const verses: { ref: string; text: string[] }[] = [];
  let current: { ref: string; text: string[] } | undefined;
  let labelledAt = -1;
  const open = (ref: string) => {
    current = { ref, text: [] };
    verses.push(current);
  };

  for (const line of lines) {
    const s = typeof line === "string" ? line : String(line);
    if (s.startsWith("$")) continue;
    if (s.startsWith("!")) {
      const marker = s.slice(1).trim();
      // A label names the chant that follows; the verses before it belong to
      // another chant sharing the section.
      if (CHANT_LABEL.test(marker)) {
        labelledAt = verses.length;
        open("");
      } else open(marker);
      continue;
    }
    if (ALLELUIA_OPENING.test(s)) continue;
    // A blank line — empty or a lone `_` — separates chants rather than
    // belonging to one.
    if (s.trim() === "" || s.trim() === "_") continue;
    if (V_START.test(s)) {
      // A `v.` opens a further verse, unless it only marks the first one.
      if (current && current.text.length) open("");
      else if (!current) open("");
      current!.text.push(s.trim().replace(V_START, "").trim());
      continue;
    }
    if (!current) open("");
    current!.text.push(s);
  }

  // Where a label named the chant, only what follows it belongs to this
  // section; the verses before are another chant sharing the source section.
  const kept = labelledAt >= 0 ? verses.slice(labelledAt) : verses;
  return {
    verses: kept
      .map((v) => ({
        ref: v.ref,
        text: stripTrailingAlleluia(v.text.join("\n").trim()),
      }))
      .filter((v) => v.text !== ""),
  };
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

/**
 * Parse `!ref`-delimited segments from a line array.
 *
 * Text before the first marker forms an opening segment of its own, with no
 * reference: a chant often gives its antiphon and verse before naming a source,
 * and dropping those lines left the antiphon with a reference and no words. The
 * `Allelúja, allelúja.` cue is not such text — it is the same words every time —
 * and is skipped.
 */
function parseRefSegments(lines: unknown[]): { refs: string[]; segments: RefSegment[] } {
  const refs: string[] = [];
  const segments: RefSegment[] = [];
  let i = 0;

  const isMarker = (n: number) => {
    const l = lines[n];
    return typeof l === "string" && l.startsWith("!");
  };
  while (i < lines.length && !isMarker(i) && ALLELUIA_OPENING.test(String(lines[i]))) {
    i++;
  }
  const opening = i;
  let firstMarker = opening;
  while (firstMarker < lines.length && !isMarker(firstMarker)) firstMarker++;
  if (firstMarker > opening) {
    refs.push("");
    segments.push({ refIndex: 0, start: opening, end: firstMarker });
    i = firstMarker;
  }
  while (i < lines.length) {
    const s = typeof lines[i] === "string" ? (lines[i] as string) : String(lines[i]);
    if (s.startsWith("!")) {
      refs.push(canonicalizeRef(s.slice(1).trim()));
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
    antiphon: { ref: pair.antiphonRef, text: stripTrailingAlleluia(antiphonText) },
    verse: {
      ref: refs[1] ?? pair.verseRef,
      text: stripTrailingAlleluia(stripLeadingV(verseText)),
    },
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
  const block = filterGradualeLines(segmentLines(lines, segments[0]));
  const secondBlock = filterGradualeLines(segmentLines(lines, segments[1]));

  // The Alleluia often follows the gradual's verse with no reference of its
  // own, marked only by its `Allelúja, allelúja.` cue. Everything from that cue
  // belongs to the Alleluia; without this it is swallowed into the verse.
  const cueAt = block.findIndex((l) => ALLELUIA_OPENING.test(String(l)));
  const inlineAlleluia = cueAt >= 0 ? block.slice(cueAt + 1) : [];
  const firstBlock = cueAt >= 0 ? block.slice(0, cueAt) : block;

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
  const referenced = isTractus
    ? ""
    : stripLeadingV(secondBlock.join("\n").trim());
  // A referenced Alleluia wins; otherwise take the one the cue introduced.
  const alleluiaText =
    referenced || stripLeadingV(inlineAlleluia.join("\n").trim());
  const verseTextClean = stripLeadingV(verseText).replace(ALLELUIA_CUE, "").trim();
  return {
    antiphon: {
      ref: pair.antiphonRef,
      text: stripTrailingAlleluia(stripLeadingV(antiphonText)),
    },
    verse: { ref: pair.verseRef, text: stripTrailingAlleluia(verseTextClean) },
    alleluia: { ref: alleluiaRef, text: stripTrailingAlleluia(alleluiaText) },
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
    case "verse":
      // A reading carries an introduction and, when biblical, numbered verses;
      // the other verse sections are antiphons and keep `{ ref, text }`.
      return isReadingSection(key) ? linesToReading(value) : linesToVerse(value);
    case "prayer":
      return linesToPrayer(value);
    case "antiphonal":
      if (key === "gradualep" || key === "tractus")
        return linesToVerses(value);
      if (key.startsWith("graduale")) return linesToGraduale(value);
      return linesToAntiphonal(value);
  }
}

/**
 * Where a gradual's Alleluia is lifted to. The Alleluia is a chant in its own
 * right, sung after the Gradual; the paschal form (`gradualep`) replaces the
 * Gradual with two Alleluia verses, and its second one is a different chant
 * again, so each keeps its own section.
 */
const ALLELUIA_OF: Record<string, string> = {
  graduale: "alleluia",
};

/**
 * Sections renamed on the way out. `gradualep` is not a gradual but the extended
 * Alleluia that replaces the Gradual in paschaltide, so it is published as one.
 */
const RENAMED: Record<string, string> = {
  gradualep: "alleluiap",
};

/** True when a value carries an Alleluia worth lifting out. */
function hasAlleluia(value: unknown): boolean {
  if (value == null || typeof value !== "object") return false;
  const a = (value as { alleluia?: { ref?: string; text?: string } }).alleluia;
  return a != null && (Boolean(a.text) || Boolean(a.ref));
}

/** The value without its `alleluia`, which is now a section of its own. */
function withoutAlleluia(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  const { alleluia, ...rest } = value as Record<string, unknown>;
  return rest;
}

/**
 * Structure one document's missa sections. Each section is a rubric-variant
 * list; the structuring is applied to every variant's `value`, keeping its
 * `condition`. Exported for the runner and tests.
 */
export function transform(obj: Record<string, unknown>): Step9Output {
  const result: Step9Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "rule") {
      // `rule` cleanup can lift a `Prefatio=X` line out into a `prefatio` key;
      // do it per variant, keeping conditions aligned.
      if (!isVariantArray(value)) {
        result.rule = transformRule(value).rule;
        continue;
      }
      const ruleVariants: { value: unknown; condition: string[] }[] = [];
      const prefatioVariants: { value: string; condition: string[] }[] = [];
      for (const variant of value) {
        const { rule, prefatio } = transformRule(variant.value);
        ruleVariants.push({ value: rule, condition: variant.condition });
        if (prefatio !== undefined)
          prefatioVariants.push({ value: prefatio, condition: variant.condition });
      }
      result.rule = ruleVariants;
      if (prefatioVariants.length) result.prefatio = prefatioVariants;
      continue;
    }
    const sectionType = getSectionType(key);
    if (!sectionType) {
      result[key] = value;
      continue;
    }
    const isReading = isReadingSection(key);
    const structured = mapVariants(value, (v) =>
      isReading && !canStructureReading(v)
        ? v
        : transformSection(key, v, sectionType)
    );

    // A gradual carries the Alleluia sung after it; lift it into its own
    // section, keeping each variant's condition.
    const alleluiaKey = ALLELUIA_OF[key];
    if (alleluiaKey && isVariantArray(structured)) {
      const alleluia: { value: unknown; condition: string[] }[] = [];
      for (const variant of structured) {
        if (!hasAlleluia(variant.value)) continue;
        alleluia.push({
          value: (variant.value as { alleluia: unknown }).alleluia,
          condition: variant.condition,
        });
      }
      result[key] = structured.map((variant) => ({
        value: withoutAlleluia(variant.value),
        condition: variant.condition,
      }));
      if (alleluia.length) result[alleluiaKey] = alleluia;
      continue;
    }

    result[RENAMED[key] ?? key] = structured;
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
      const obj = parseStep(raw);
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        throw new Error("Expected object");
      }
      const outPath = join(outputDir, rel);
      await ensureDir(outPath, mkdirCache);
      await writeFile(
        outPath,
        stringifyStep(transform(obj as Record<string, unknown>)),
        "utf-8"
      );
    }
  );

  return { written: processed };
}
