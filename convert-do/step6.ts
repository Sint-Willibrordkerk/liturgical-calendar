import { applyIncludes } from "./condition";
import { Step5Output } from "./step5";
import { SEP, escapeRegExp, splitPath } from "./lib/paths";
import { directoryMappings, mappings } from "./lib/mappings";
import { STEP_EXT } from "./lib/serialize.js";

export type Step6Output = Step5Output;

const WHITESPACE = /\s+/g;

function toKebabCase(str: string) {
  const result = str.toLowerCase().trim().replace(WHITESPACE, "-");
  return result.startsWith("-") ? result.slice(1) : result;
}

function splitSuffix(input: string) {
  const parts = splitPath(input.split(".").at(-2)!);
  let file = parts.pop()!.replace("Ferua", "Feria");
  if (file === "Epi1-0") file = "Epi1-0r";
  if (file === "Epi1-0a") file = "Epi1-0";
  return {
    file,
    dir: parts.pop()!,
  };
}

/**
 * A filename marking a commemoration kept on a day: `…cc`, and `…octt` for one
 * kept during an octave.
 *
 * A commemoration is a celebration in its own right, with its own collect and
 * lessons — the day it falls on merely keeps it. Its file therefore stays on its
 * own path rather than folding onto the day's, which would merge one saint's
 * texts into another feast's file.
 *
 * Because the file stands alone, it does not carry `commemoratio` as a rubric
 * condition either: the token existed to tell the commemoration's variants apart
 * from the day's once they shared a file, and nothing shares a file now.
 */
export function isCommemorationFile(file: string): boolean {
  return /(?:cc|octt)$/.test(file);
}

const excludedFiles = [
  "Coronatio",
  "10-DU",
  "10-DP",
  "07-DP",
  "11-03sec",
  "00-VB",
  "00-VE",
  "09-DP",
  "09-DT",
];

export function getOutputFile(input: string) {
  // The `horas`/`missa` root has already been stripped by step 2; here we only
  // fold a variant directory onto its base and strip the filename suffix.
  let output = input;
  const { file, dir } = splitSuffix(input);

  for (const directory of ["Commune", "Martyrologium", "Sancti", "Tempora"]) {
    if (!dir.startsWith(directory)) continue;

    if (dir !== directory) {
      output = output.replace(
        new RegExp(`(${SEP})${escapeRegExp(dir)}(${SEP})`),
        `$1${directory}$2`
      );
    }

    if (excludedFiles.includes(file)) break;
    // A commemoration is its own celebration, kept alongside the day rather
    // than part of it. Folding it onto the day's path would merge someone
    // else's collect and lessons into the feast.
    if (isCommemorationFile(file)) break;

    let suffixLength = 0;
    while (
      file[file.length - suffixLength - 1]! < "0" ||
      file[file.length - suffixLength - 1]! > "9"
    ) {
      suffixLength++;
      if (["10-DU"].includes(file)) break;
    }
    if (suffixLength > 0)
      output = output.replace(`${file.slice(-suffixLength)}${STEP_EXT}`, STEP_EXT);
  }
  return output;
}

export function transform(obj: Step5Output, inputFile: string) {
  let { file, dir } = splitSuffix(inputFile);
  const standsAlone = isCommemorationFile(file);

  const result: { [key: string]: { value: any; condition: string[] }[] } = {};
  const includes: string[] = [];

  for (const directory of ["Commune", "Martyrologium", "Sancti", "Tempora"]) {
    if (!dir.startsWith(directory)) continue;

    if (dir !== directory) {
      includes.push(
        directoryMappings[
          toKebabCase(
            dir.replace(directory, "")
          ) as keyof typeof directoryMappings
        ]
      );
    }

    if (excludedFiles.includes(file)) break;

    if (file.includes("Feria")) {
      const match = file.match(/(\d+)Feria/);
      includes.push(`feria-${Number(match![1]) + 1}`);
      file = file.replace("Feria", "");
    }

    let hasChanged;
    do {
      hasChanged = false;
      for (const [suffix, value] of mappings) {
        if (file.endsWith(suffix)) {
          includes.push(...value);
          file = file.slice(0, -suffix.length);
          hasChanged = true;
        }
      }
    } while (hasChanged);

    if (["10-DU"].includes(file)) continue;

    let suffixLength = 0;
    while (
      file[file.length - suffixLength - 1]! < "0" ||
      file[file.length - suffixLength - 1]! > "9"
    ) {
      suffixLength++;
    }

    if (suffixLength > 0) {
      throw new Error(`Suffix is not supported: ${file}`);
    }
  }

  // A commemoration keeps its own path, so the marker lives in the name rather
  // than in a condition no rubric would ever satisfy.
  const tokens = standsAlone
    ? includes.filter((token) => token !== "commemoratio")
    : includes;

  Object.entries(obj).forEach(([key, value]) => {
    value.forEach((item) => {
      // Combine the path-derived tokens with the variant's own condition
      // (from step 1 header conditions) rather than replacing it, so a variant
      // keeps its identity. This keeps the result independent of whether step 2
      // (combine mass and hours) was materialized separately before step 3.
      const condition = [...new Set([...item.condition, ...tokens])];
      result[key] = applyIncludes(condition, [], item.value, result[key] ?? []);
    });
  });

  return result;
}
