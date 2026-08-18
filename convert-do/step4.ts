import { join } from "path";
import { readFile } from "fs/promises";

import { Step3Output } from "./step3";
import { splitPath } from "./lib/paths";
import { STEP_EXT, stripStepExt, parseStep } from "./lib/serialize.js";

export type Step4Output = Step3Output;

/**
 * The Office texts a day takes from its common: the Matins lessons, and the
 * antiphons, versicles and orations of Lauds and Vespers. A `vide` always
 * borrows these.
 */
function isOfficeBorrow(key: string): boolean {
  return (
    key.startsWith("lectio") ||
    key === "ant-laudes" ||
    key === "ant-vespera" ||
    key.startsWith("versum") ||
    key.startsWith("oratio")
  );
}

/**
 * The Mass propers a `vide` borrows only to fill a gap. A day that resolves its
 * own Mass keeps it; one that has none — a commemoration pointing at a common,
 * say — takes the common's rather than being left without.
 */
const MASS_PROPERS = new Set([
  "introitus",
  "graduale",
  "gradualep",
  "tractus",
  "evangelium",
  "offertorium",
  "secreta",
  "communio",
  "postcommunio",
  "ultima-evangelium",
]);

/** True when a section is already resolved, and needs no filling in. */
function hasContent(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * The `step{N}/<lang>` prefix of an output path, used as the base for resolving
 * references (`fileName` values already include the directory below the
 * language). Locating the `step{N}` segment — rather than slicing a fixed
 * number of trailing segments — keeps this correct for files nested more than
 * one directory deep under the language (e.g. `Sancti/Urbis/…`).
 */
function languageBasePath(inputFile: string): string {
  const parts = splitPath(inputFile);
  const stepIndex = parts.findIndex((part) => /^step\d+$/.test(part));
  if (stepIndex >= 0 && stepIndex + 1 < parts.length) {
    return parts.slice(0, stepIndex + 2).join("/");
  }
  return parts.slice(0, -2).join("/");
}

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
        // A bare reference with no `ex`/`vide` keyword (e.g. `C5c`) is a commune
        // pointer; treat it as `vide` — borrow the standard sections — which is
        // its conventional meaning in a rank line.
        videReferences.push({ path: reference, condition: variant.condition });
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

      // Variant-directory and filename rubric suffixes are deliberately NOT
      // stripped here: at this step (before step 5 folds variants) the specific
      // variant file still exists, so the reference resolves directly to it.

      if (path === "Tempora/Pasc5-4 (rubrica tridentina aut rubrica divino)") {
        path = "Tempora/Pasc5-4";
        condition.push("1570", "1913");
      }
      if (path === "Tempora/Epi4") {
        path = "Tempora/Epi4-0";
      }

      return { path, condition };
    })
    .filter((item) => item.path !== ownReferencePath(inputFile));
}

/**
 * The file's own reference path (`<Dir>/<file>` relative to `step{N}/<lang>`),
 * used to drop a self-reference. Comparing the full relative path — not just the
 * filename — keeps a reference to a same-named file in a different directory
 * (e.g. `SanctiOP/11-14M` → `SanctiM/11-14M`) from being mistaken for a
 * self-reference.
 */
function ownReferencePath(inputFile: string): string {
  const parts = splitPath(stripStepExt(inputFile));
  const stepIndex = parts.findIndex((part) => /^step\d+$/.test(part));
  if (stepIndex >= 0) return parts.slice(stepIndex + 2).join("/");
  return parts.slice(-2).join("/");
}

async function loadReferenceFiles(
  obj: Step3Output,
  inputFile: string
): Promise<Map<string, Step3Output>> {
  const referenceFiles = new Map<string, Step3Output>();
  const fileNames = extractDependencies(obj, inputFile);

  for (const fileName of fileNames) {
    const doc = parseStep(
      await readFile(
        `${join(languageBasePath(inputFile), fileName)}${STEP_EXT}`,
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
      if (!ex.includes(path) && !isOfficeBorrow(key)) {
        // A Mass proper travels with a borrow only where normal resolution —
        // the day's own text, and anything an `ex` already included — has left
        // nothing in its place.
        if (!MASS_PROPERS.has(key) || hasContent(result[key])) continue;
      }

      value = value.map((item) => ({
        ...item,
        condition: [...path.condition, ...item.condition],
      }));

      if (!result[key]) {
        result[key] = value;
        continue;
      }

      // What the day already holds is its own proper text and takes precedence;
      // an import only fills a gap. So the day's variants are kept as they are,
      // and an imported one is added only where none of them would already
      // apply in its place — that is, where no existing variant's condition is
      // satisfied whenever the import's is.
      //
      // Matching whole condition sets is not enough. The Assumption gives its
      // own Introit unconditionally, while its rank line includes a common under
      // the 1962 rubric. Imported at `1962` that out-ranks the day's own `[]`
      // wherever 1962 is in force, and the common is sung in place of
      // `Signum magnum`.
      const existing = result[key]!;
      const gaps = value.filter(
        (imported) =>
          !existing.some((own) =>
            own.condition.every((token) => imported.condition.includes(token))
          )
      );
      result[key] = [...existing, ...gaps];
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
