import { consola } from "consola";
import dotenv from "dotenv";
import { readdir } from "fs/promises";
import { join, relative } from "path";

dotenv.config();

export type Step0Output = string[];

const INPUT_ROOTS = ["horas", "missa"];
export const DIVINUM_OFFICIUM_BASE = process.env.DIVINUM_OFFICIUM_BASE
  ? join(process.env.DIVINUM_OFFICIUM_BASE, "web/www")
  : null;

const LANGUAGE_CODES: [string, string][] = [
  ["Bohemice", "cs"],
  ["Cesky-Schaller", "cs-schaller"],
  ["Dansk", "da"],
  ["Deutsch", "de"],
  ["English", "en"],
  ["Espanol", "es"],
  ["Francais", "fr"],
  ["Italiano", "it"],
  ["Latin-Bea", "la-bea"],
  ["Latin", "la"],
  ["Magyar", "hu"],
  ["Nederlands", "nl"],
  ["Polski-Newer", "pl-new"],
  ["Polski", "pl"],
  ["Portugues", "pt"],
  ["Ukrainian", "uk"],
  ["Vietnamice", "vi"],
];

function fileFilter(relativePath: string) {
  return (
    relativePath.endsWith(".txt") &&
    !relativePath.endsWith("pl.txt") &&
    !relativePath.endsWith("tts.txt") &&
    !relativePath.endsWith("ruler.txt") &&
    !relativePath.endsWith("Linguae.txt") &&
    !relativePath.endsWith("source.txt") &&
    !relativePath.endsWith("sundaytable.txt") &&
    !relativePath.endsWith("Mobile.txt") &&
    !relativePath.endsWith("XPRex.txt") &&
    !relativePath.endsWith("02-02-quadp.txt") &&
    !relativePath.endsWith("dom-oct.txt") &&
    !relativePath.endsWith("Quad5-5Feriarc.txt") &&
    !relativePath.endsWith("Propaganda.txt") &&
    !relativePath.startsWith("Help/") &&
    !relativePath.startsWith("Latin-gabc/") &&
    relativePath.startsWith("Latin/")
  );
}

export async function getInputFiles() {
  if (!DIVINUM_OFFICIUM_BASE) {
    consola.error(
      "DIVINUM_OFFICIUM_BASE environment variable is not set (e.g. path to divinum-officium repo)."
    );
    process.exit(1);
  }

  return Promise.all(
    INPUT_ROOTS.flatMap(async (root) => {
      const rootPath = join(DIVINUM_OFFICIUM_BASE, root);
      return readdir(rootPath, { recursive: true, withFileTypes: true }).then(
        (entries) =>
          entries.reduce(
            (acc, entry) => {
              const relativeDir = relative(rootPath, entry.parentPath).replace(
                /\\/g,
                "/"
              );
              const relativePath = relativeDir
                ? `${relativeDir}/${entry.name}`
                : entry.name;
              const outputPath = `${root}/${relativePath}`;
              if (entry.isDirectory()) {
                acc.directories.push(outputPath);
              } else if (entry.isFile() && fileFilter(relativePath)) {
                acc.files.push(outputPath);
              }
              return acc;
            },
            { directories: [] as string[], files: [] as string[] }
          )
      );
    })
  ).then((results) => ({
    directories: results.flatMap((result) => result.directories),
    files: results.flatMap((result) => result.files),
  }));
}

export function getOutputFile(input: string) {
  input = input.replace(/\.txt$/i, ".yml");

  for (const [lang, code] of LANGUAGE_CODES) {
    if (input.includes(`\\${lang}\\`)) {
      return input.replace(`\\${lang}\\`, `\\${code}\\`);
    }
  }
  if (!input.includes("horas\\Ordinarium"))
    throw new Error(`Unknown language: ${input}`);
  return input;
}

const NEW_LINE = /\r?\n/;

export function transform(input: string) {
  return input.split(NEW_LINE);
}
