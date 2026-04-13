import { applyCondition } from "./condition";

/** Section content: array of lines, or when conditional a map condition -> lines (use "" for default). */
export type Step1Output = {
  [key: string]: { value: string[]; condition: string[] }[];
};

const WHITESPACE = /\s+/g;
const KEY_LINE = /^\[(.+)\](?:\s*\((.*)\))?$/;

function toKebabCase(str: string) {
  return str.toLowerCase().trim().replace(WHITESPACE, "-");
}

function trimTrailingEmptyLines(lines: string[]) {
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last?.trim() !== "") break;
    lines.pop();
  }
  return lines;
}

export function transform(lines: string[]) {
  const result: Step1Output = { __preamble: [] };
  let currentBase = "__preamble";
  let currentCondition: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const keyLine = KEY_LINE.exec(line);
    if (keyLine) {
      result[currentBase] = applyCondition(
        currentCondition,
        trimTrailingEmptyLines(currentLines),
        result[currentBase]!
      );

      currentBase = toKebabCase(keyLine[1]!);
      currentCondition = keyLine[2] ? toKebabCase(keyLine[2]!) : null;
      currentLines = [];
      result[currentBase] ??= [];
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
