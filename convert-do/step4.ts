import { join } from "path";
import { readFile } from "fs/promises";
import { parse } from "yaml";
import { Step3Output } from "./step3";
import { directoryMappings, mappings } from "./step2";
import { splitPath } from "./lib/paths";

export type Step4Output = Step3Output;

export function extractExVideReferences(
  obj: Step3Output,
  inputFile: string
): {
  ex: { path: string; condition: string[] }[];
  vide: { path: string; condition: string[] }[];
} {
  const exReferences: { path: string; condition: string[] }[] = [];
  const videReferences: { path: string; condition: string[] }[] = [];

  obj.__preamble?.forEach((variant) => {
    variant.value.forEach((line) => {
      if (line.startsWith("@")) {
        const path = line.slice(1).split(":")[0]!.trim();
        if (path) exReferences.push({ path, condition: variant.condition });
      }
    });
  });

  obj.rank?.forEach((variant) => {
    variant.value.forEach((line) => {
      const reference = line.split(";;")[3]?.trim();
      if (reference?.startsWith("ex ")) {
        exReferences.push({
          path: reference.slice(3),
          condition: variant.condition,
        });
      } else if (reference?.startsWith("vide ")) {
        videReferences.push({
          path: reference.slice(5),
          condition: variant.condition,
        });
      } else if (reference) {
        throw new Error(`Invalid rank reference: ${line}`);
      }
    });
  });

  obj.rule?.forEach((variant) => {
    variant.value.forEach((line) => {
      if (line.startsWith("ex ")) {
        exReferences.push({
          path: line.slice(3),
          condition: variant.condition,
        });
      } else if (line.startsWith("vide ")) {
        videReferences.push({
          path: line.slice(5),
          condition: variant.condition,
        });
      }
    });
  });

  return {
    ex: cleanReferences(exReferences, inputFile),
    vide: cleanReferences(videReferences, inputFile),
  };
}

function cleanReferences(
  exReferences: { path: string; condition: string[] }[],
  inputFile: string
): { path: string; condition: string[] }[] {
  return exReferences
    .map((item) => {
      let path = item.path
        .replace(";mtv", "")
        .replaceAll(";", "")
        .replaceAll(":", "")
        .replace("sancti/", "Sancti/")
        .trim();
      let condition = item.condition;

      if (path.includes("Feria")) {
        const match = path.match(/(\d+)Feria/);
        path = path.replace("Feria", "");
        condition.push(`feria-${Number(match![1]) + 1}`);
      }

      if (path[0] === "C" && path[1]! >= "0" && path[1]! <= "9") {
        path = `Commune/${path}`;
      }
      if (
        path.startsWith("Quadp") ||
        path.startsWith("Epi") ||
        path.startsWith("Pasc")
      ) {
        path = `Tempora/${path}`;
      }

      for (const [suffix, value] of mappings) {
        if (path.endsWith(suffix)) {
          path = path.slice(0, -suffix.length);
          condition = [...condition, ...value];
          break;
        }
      }

      for (const key of ["Commune", "Martyrologium", "Sancti", "Tempora"]) {
        if (path.startsWith(`${key}`)) {
          for (const [suffix, value] of Object.entries(directoryMappings)) {
            if (
              path
                .toLowerCase()
                .startsWith(`${key}${suffix}`.toLocaleLowerCase())
            ) {
              path = path.replace(new RegExp(`${key}${suffix}`, "i"), `${key}`);
              condition = [...condition, value];
            }
          }
        }
      }

      if (path === "Tempora/Pasc5-4 (rubrica tridentina aut rubrica divino)") {
        path = "Tempora/Pasc5-4";
        condition.push("1570", "1913");
      }
      if (path === "Tempora/Epi4") {
        path = "Tempora/Epi4-0";
      }

      return { path, condition };
    })
    .filter(
      (item) =>
        item.path.split("/").at(-1) !==
        splitPath(inputFile.replace(".yml", "")).at(-1)
    );
}

async function loadReferenceFiles(
  obj: Step3Output,
  inputFile: string
): Promise<Map<string, Step3Output>> {
  const referenceFiles = new Map<string, Step3Output>();
  const fileNames = extractDependencies(obj, inputFile);

  for (const fileName of fileNames) {
    const doc = parse(
      await readFile(
        `${join(splitPath(inputFile).slice(0, -2).join("/"), fileName)}.yml`,
        "utf-8"
      )
    );
    referenceFiles.set(fileName, doc as Step3Output);
  }
  return referenceFiles;
}

/**
 * Transform object by resolving ex/vide references and importing sections.
 * @param readBasePath - Directory tree like `.divinum-officium/step3` (lang/file.yml)
 */
export async function transform(
  obj: Step3Output,
  inputFile: string
): Promise<Step4Output> {
  let result: Step4Output = { ...obj };
  const referenceFiles = await loadReferenceFiles(obj, inputFile);
  const { ex, vide } = extractExVideReferences(obj, inputFile);

  for (const path of [...ex, ...vide]) {
    const file = referenceFiles.get(path.path);
    if (!file) throw new Error(`Reference file not found: ${path.path}`);

    for (let [key, value] of Object.entries(file)) {
      if (
        !ex.includes(path) &&
        !(
          key.startsWith("lectio") ||
          key === "ant-laudes" ||
          key === "ant-vespera" ||
          key.startsWith("versum") ||
          key.startsWith("oratio")
        )
      )
        continue;

      value = value.map((item) => ({
        ...item,
        condition: [...path.condition, ...item.condition],
      }));

      if (!result[key]) {
        result[key] = value;
        continue;
      }

      result[key] = [...result[key], ...value].reduce((acc, curr) => {
        if (
          acc.some(
            (item) =>
              item.condition.length === curr.condition.length &&
              item.condition.every((condition) =>
                curr.condition.includes(condition)
              )
          )
        )
          return acc;
        return [...acc, curr];
      }, [] as Step4Output[string]);
    }
  }

  delete result.__preamble;

  return result;
}

export function extractDependencies(
  obj: Step3Output,
  inputFile: string
): Set<string> {
  const { ex, vide } = extractExVideReferences(obj, inputFile);
  return new Set([
    ...Array.from(ex).map((item) => item.path),
    ...Array.from(vide).map((item) => item.path),
  ]);
}
