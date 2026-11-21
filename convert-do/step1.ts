import { applyCondition } from "./condition";
import { toKebabCase } from "./lib/paths";

/** Section content: array of lines, or when conditional a map condition -> lines (use "" for default). */
export type Step1Output = {
  [key: string]: { value: string[]; condition: string[] }[];
};

const KEY_LINE = /^\[(.+)\](?:\s*\((.*)\))?$/;

// Corrections scoped to individual corrupted source files. Each applies to
// exactly one file rather than as a general rule (see SPEC.md, "Preamble `;;`
// in practice"). Paths are the source stem (no extension), forward-slashed.
//
// This file's rank header is mistyped `d[Rank]`; rewrite it to `[Rank]` so the
// following `;;` line parses as normal rank content instead of falling into
// the preamble.
const RANK_HEADER_TYPO_FILE = "missa/Nederlands/Sancti/09-02";
// This file's only preamble line is an `@`-include with `;;` rank fields
// appended (`@SanctiM/11-14M;;Simplex;;1.1;;vide`); truncate at the first `;;`
// so step 4 sees a clean include reference.
const PREAMBLE_REF_RANK_FILE = "horas/Latin/SanctiOP/11-14M";
// The English movable announcements of the Martyrology keep a stray Latin
// `[Pasc5-3]`, then the English one under a header with a tab after it. Here a
// header may be followed by whitespace, and a section given again replaces what
// came before, as Divinum Officium reads it.
const REPEATED_SECTION_FILE = "horas/English/Martyrologium/Mobile";

function matchesFile(inputFile: string, target: string) {
  return (
    inputFile.replace(/\\/g, "/").replace(/\.[^./]+$/, "") === target ||
    inputFile.replace(/\\/g, "/").replace(/\.[^./]+$/, "").endsWith("/" + target)
  );
}

function trimTrailingEmptyLines(lines: string[]) {
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last?.trim() !== "") break;
    lines.pop();
  }
  return lines;
}

export function transform(lines: string[], inputFile = "") {
  const fixRankHeaderTypo = matchesFile(inputFile, RANK_HEADER_TYPO_FILE);
  const truncatePreambleRef = matchesFile(inputFile, PREAMBLE_REF_RANK_FILE);
  const replaceRepeatedSection = matchesFile(inputFile, REPEATED_SECTION_FILE);

  const result: Step1Output = { __preamble: [] };
  let currentBase = "__preamble";
  let currentCondition: string | null = null;
  let currentLines: string[] = [];

  for (let line of lines) {
    if (fixRankHeaderTypo && line === "d[Rank]") line = "[Rank]";
    const keyLine = KEY_LINE.exec(replaceRepeatedSection ? line.trimEnd() : line);
    if (keyLine) {
      result[currentBase] = applyCondition(
        currentCondition,
        trimTrailingEmptyLines(currentLines),
        result[currentBase]!
      );

      currentBase = toKebabCase(keyLine[1]!);
      currentCondition = keyLine[2] ? toKebabCase(keyLine[2]!) : null;
      currentLines = [];
      if (replaceRepeatedSection) result[currentBase] = [];
      result[currentBase] ??= [];
    } else if (
      truncatePreambleRef &&
      currentBase === "__preamble" &&
      line.includes(";;")
    ) {
      currentLines.push(line.split(";;")[0]!);
    } else {
      currentLines.push(line);
    }
  }
  result[currentBase] = applyCondition(
    currentCondition,
    trimTrailingEmptyLines(currentLines),
    result[currentBase]!
  );
  return Object.fromEntries(
    Object.entries(result)
      .map(
        ([key, value]) =>
          [
            key,
            value.filter(
              (item) => item.value.length > 0 || item.condition.length > 0
            ),
          ] as [string, { value: string[]; condition: string[] }[]]
      )
      .filter(([, value]) => value.length)
  );
}
