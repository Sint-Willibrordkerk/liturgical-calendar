import { applyIncludes } from "./condition";
import { Step1Output } from "./step1";

export type Step2Output = Step1Output;

const WHITESPACE = /\s+/g;

const directoryMappings = {
  cist: "cisterciensis",
  m: "monastica",
  op: "praedicatorum",
  "1570": "1570",
  "1955r": "1955",
  "1960": "1962",
};

function toKebabCase(str: string) {
  const result = str.toLowerCase().trim().replace(WHITESPACE, "-");
  return result.startsWith("-") ? result.slice(1) : result;
}

function splitSuffix(input: string) {
  const parts = input.split(".").at(-2)!.split("\\");
  let file = parts.pop()!.replace("Ferua", "Feria");
  if (file === "Epi1-0") file = "Epi1-0r";
  if (file === "Epi1-0a") file = "Epi1-0";
  return {
    file,
    dir: parts.pop()!,
  };
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
  let output = input.replace("\\horas\\", "\\").replace("\\missa\\", "\\");
  const { file, dir } = splitSuffix(input);

  for (const directory of ["Commune", "Martyrologium", "Sancti", "Tempora"]) {
    if (!dir.startsWith(directory)) continue;

    if (dir !== directory) {
      output = output.replace(`\\${dir}\\`, `\\${directory}\\`);
    }

    if (excludedFiles.includes(file)) break;

    let suffixLength = 0;
    while (
      file[file.length - suffixLength - 1]! < "0" ||
      file[file.length - suffixLength - 1]! > "9"
    ) {
      suffixLength++;
      if (["10-DU"].includes(file)) break;
    }
    if (suffixLength > 0)
      output = output.replace(`${file.slice(-suffixLength)}.yml`, ".yml");
  }
  return output;
}

export function transform(obj: Step1Output, inputFile: string) {
  let { file, dir } = splitSuffix(inputFile);

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

    const mappings = [
      ["-Septem", ["septem-dolorum"]],
      ["Coct", ["cisterciensis", "octava"]],
      ["cist", ["cisterciensis"]],
      ["octt", ["octava", "commemoratio"]],
      ["-oct", ["octava"]],
      ["-sab", ["feria-7"]],
      ["Pasc", ["paschali"]],
      ["sab", ["feria-7"]],
      ["oct", ["octava"]],
      ["bmv", ["1888"]],
      ["def", ["defunctorum"]],
      ["-da", ["1913"]],
      ["cc", ["commemoratio"]],
      ["AV", ["altovadensis"]],
      ["oM", ["monastica"]],
      ["tt", ["transfer", "1570"]],
      ["oc", ["occurentia"]],
      ["da", ["1913"]],
      ["OP", ["praedicatorum"]],
      ["M", ["monastica"]],
      ["q", ["quadragesima"]],
      ["o", ["1888"]],
      ["r", ["1962"]],
      ["n", ["2020"]],
      ["p", ["paschali"]],
      ["t", ["1570"]],
      ["g", ["1913"]],
      ["C", ["cisterciensis"]],
      ["a", ["special"]],
      ["b", ["special"]],
      ["c", ["special"]],
      ["s", ["special"]],
      ["A", ["adventus"]],
      ["N", ["nativitatis"]],
      ["Q", ["septuagesimae"]],
      ["v", ["vigilia"]],
    ] as const;

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

  Object.entries(obj).forEach(([key, value]) => {
    value.forEach((item) => {
      result[key] = applyIncludes(includes, [], item.value, result[key] ?? []);
    });
  });

  return result;
}
