import { consola } from "consola";
import { join } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP12_INPUT = join(PROJECT_BASE, ".divinum-officium", "step12");
const STEP13_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step13");
const CONCURRENCY = 150;

const MISSA_SECTION_TYPES = {
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
/** First line of lectio/evangelium that is the title/introduction (e.g. "Léctio Epístolæ...", "Sequéntia sancti Evangélii...") */
const LECTIO_INTRODUCTION = /^\s*(Léctio|Lectio|Sequéntia|Sequentia)\s+.+$/i;
/** Trailing "Allelúja, allelúja" cue before the alleluia section (may be omitted) */
const ALLELUIA_CUE = /\s*,?\s*Allel[uú]ja\s*,?\s*Allel[uú]ja\.?\s*$/i;

function getSectionType(key) {
  const base = key.split("/")[0];
  return MISSA_SECTION_TYPES[base] || null;
}

function stripLeadingV(text) {
  if (!text || typeof text !== "string") return text;
  const lines = text.split("\n");
  if (lines.length === 0) return text;
  lines[0] = lines[0].trim().replace(V_START, "").trim();
  return lines.join("\n").trim();
}

function linesToVerse(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return { ref: "", text: "" };
  let ref = "";
  const textParts = [];
  for (const line of lines) {
    const s = typeof line === "string" ? line : String(line);
    if (s.startsWith("!")) ref = s.slice(1).trim();
    else if (!s.startsWith("$")) textParts.push(s);
  }
  return { ref, text: stripLeadingV(textParts.join("\n").trim()) };
}

function linesToPrayer(lines) {
  if (!Array.isArray(lines) || lines.length === 0)
    return { text: "", closure: "" };
  let closure = "";
  const textParts = [];
  for (const line of lines) {
    const s = typeof line === "string" ? line : String(line);
    if (s.startsWith("$")) closure = s.slice(1).trim();
    else textParts.push(s);
  }
  return { text: textParts.join("\n").trim(), closure };
}

function splitRefPair(refStr) {
  if (!refStr || typeof refStr !== "string")
    return { antiphonRef: "", verseRef: "" };
  const parts = refStr
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return { antiphonRef: refStr.trim(), verseRef: "" };
  const first = parts[0];
  const bookMatch = first.match(/^(.+?)\s+\d/);
  const book = bookMatch ? bookMatch[1].trim() : "";
  const second = parts[1];
  const verseRef = /^\d/.test(second) && book ? `${book} ${second}` : second;
  return { antiphonRef: first, verseRef };
}

function linesToAntiphonal(lines) {
  const empty = { ref: "", text: "" };
  if (!Array.isArray(lines) || lines.length === 0) {
    return { antiphon: { ...empty }, verse: { ...empty } };
  }
  // Split by ref positions: first ref = antiphon ref, lines until second ref = antiphon text, second ref = verse ref, rest = verse text
  const refs = [];
  const segments = []; // [{ refIndex, start, end }] for content between refs
  let i = 0;
  while (i < lines.length) {
    const s = typeof lines[i] === "string" ? lines[i] : String(lines[i]);
    if (s.startsWith("!")) {
      refs.push(s.slice(1).trim());
      segments.push({ refIndex: refs.length - 1, start: i + 1 });
      i++;
      while (i < lines.length) {
        const t = typeof lines[i] === "string" ? lines[i] : String(lines[i]);
        if (t.startsWith("!")) break; // next ref only; & stays in same segment
        i++;
      }
      if (segments[segments.length - 1]) segments[segments.length - 1].end = i;
    } else {
      i++;
    }
  }
  const antiphonLines =
    segments.length > 0 && segments[0].end > segments[0].start
      ? lines
          .slice(segments[0].start, segments[0].end)
          .filter((l) => !String(l).startsWith("&"))
      : [];
  const verseLines =
    segments.length > 1 && segments[1].end > segments[1].start
      ? lines
          .slice(segments[1].start, segments[1].end)
          .filter((l) => !String(l).startsWith("&"))
      : [];
  const antiphonText = stripLeadingV(antiphonLines.join("\n").trim());
  let verseText = verseLines.join("\n").trim();
  // If the verse ends with the antiphon repeated (with or without "v."), leave it out
  if (antiphonText) {
    const verseLinesArr = verseText.split("\n");
    while (verseLinesArr.length > 0) {
      const last = verseLinesArr[verseLinesArr.length - 1].trim();
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

/** Filter out standalone "_" lines (placeholders) from graduale content. */
function filterGradualeLines(lines) {
  return lines.filter((l) => String(l).trim() !== "_");
}

/** Graduale (and gradualep): same ref/segment parsing, but second segment = alleluia (ref + text), first segment = antiphon + verse split by V. "!Tractus" = no alleluia. */
function linesToGraduale(lines) {
  const empty = { ref: "", text: "" };
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      antiphon: { ...empty },
      verse: { ...empty },
      alleluia: { ...empty },
    };
  }
  const refs = [];
  const segments = [];
  let i = 0;
  while (i < lines.length) {
    const s = typeof lines[i] === "string" ? lines[i] : String(lines[i]);
    if (s.startsWith("!")) {
      refs.push(s.slice(1).trim());
      segments.push({ refIndex: refs.length - 1, start: i + 1 });
      i++;
      while (i < lines.length) {
        const t = typeof lines[i] === "string" ? lines[i] : String(lines[i]);
        if (t.startsWith("!")) break;
        i++;
      }
      if (segments[segments.length - 1]) segments[segments.length - 1].end = i;
    } else {
      i++;
    }
  }
  const firstBlock =
    segments.length > 0 && segments[0].end > segments[0].start
      ? filterGradualeLines(
          lines.slice(segments[0].start, segments[0].end).filter((l) => !String(l).startsWith("&"))
        )
      : [];
  const secondBlock =
    segments.length > 1 && segments[1].end > segments[1].start
      ? filterGradualeLines(
          lines.slice(segments[1].start, segments[1].end).filter((l) => !String(l).startsWith("&"))
        )
      : [];
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
  const alleluiaText = isTractus ? "" : stripLeadingV(secondBlock.join("\n").trim());
  // Remove trailing "Allelúja, allelúja" cue from gradual verse (it only signals the alleluia follows)
  const verseTextClean = stripLeadingV(verseText)
    .replace(ALLELUIA_CUE, "")
    .trim();
  return {
    antiphon: { ref: pair.antiphonRef, text: stripLeadingV(antiphonText) },
    verse: { ref: pair.verseRef, text: verseTextClean },
    alleluia: { ref: alleluiaRef, text: alleluiaText },
  };
}

const PREFATIO_PREFIX = /^Prefatio\s*=\s*(.+)$/i;

/** Transform rule array: drop Gloria/Credo, extract Prefatio=X as prefatio key (value lowercase). */
function transformRule(value) {
  if (!Array.isArray(value)) return { rule: value, prefatio: undefined };
  let prefatio = undefined;
  const rule = value.filter((item) => {
    const s = typeof item === "string" ? item : String(item);
    if (s === "Gloria" || s === "Credo") return false;
    const m = s.match(PREFATIO_PREFIX);
    if (m) {
      prefatio = m[1].trim().toLowerCase();
      return false;
    }
    return true;
  });
  return { rule, prefatio };
}

function stripLectioIntroduction(text) {
  if (!text || typeof text !== "string") return text;
  const lines = text.split("\n").map((l) => l.trimEnd());
  if (lines.length > 0 && LECTIO_INTRODUCTION.test(lines[0])) {
    return lines.slice(1).join("\n").trim();
  }
  return text;
}

function transformSection(key, value, sectionType) {
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
    default:
      return value;
  }
}

function transformObject(obj, rel) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "rule" || key.startsWith("rule/")) {
      const { rule: ruleArr, prefatio: prefatioVal } = transformRule(value);
      result[key] = ruleArr;
      if (prefatioVal !== undefined) {
        const prefatioKey =
          key === "rule"
            ? "prefatio"
            : "prefatio/" + key.replace(/^rule\//, "");
        result[prefatioKey] = prefatioVal;
      }
      continue;
    }
    const sectionType = getSectionType(key);
    if (sectionType) {
      result[key] = transformSection(key, value, sectionType);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Transform object by converting sections to structured format.
 * Exported for streaming pipeline.
 *
 * @param {Object} obj - Sections object
 * @param {{ relPath: string }} context - Context with relative path
 * @returns {Object} Transformed object with structured sections
 */
export function transform(obj, context) {
  return transformObject(obj, context?.relPath ?? "");
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
        consola.error(`Error processing ${item}:`, err.message);
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
  await rm(STEP13_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP13_OUTPUT, { recursive: true });

  const files = await collectYmlFiles(STEP12_INPUT);
  const mkdirCache = new Set();

  const { processed, errors } = await runBatched(
    files,
    CONCURRENCY,
    async (rel) => {
      const inputPath = join(STEP12_INPUT, rel);
      const outputPath = join(STEP13_OUTPUT, rel);
      const raw = await readFile(inputPath, "utf-8");
      const obj = parse(raw);
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        throw new Error("Expected object");
      }
      const out = transformObject(obj, rel);
      await ensureDir(outputPath, mkdirCache);
      await writeFile(outputPath, stringify(out), "utf-8");
    }
  );

  consola.log(
    `Step 13 done. ${processed} files in ${STEP13_OUTPUT}, ${errors} errors`
  );
}

const isMainModule = import.meta.url.endsWith("step13.mjs") &&
  process.argv[1]?.replace(/\\/g, "/").endsWith("step13.mjs");
if (isMainModule) {
  main();
}
