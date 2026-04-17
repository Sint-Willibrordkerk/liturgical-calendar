import { consola } from "consola";
import dotenv from "dotenv";
import { readdir } from "fs/promises";
import { join } from "path";

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

function fileFilter(filename: string) {
  return (
    filename.endsWith(".txt") &&
    !filename.endsWith("pl.txt") &&
    !filename.endsWith("tts.txt") &&
    !filename.endsWith("ruler.txt") &&
    !filename.endsWith("Linguae.txt") &&
    !filename.endsWith("source.txt") &&
    !filename.endsWith("sundaytable.txt") &&
    !filename.endsWith("Mobile.txt") &&
    !filename.endsWith("XPRex.txt") &&
    !filename.endsWith("02-02-quadp.txt") &&
    !filename.endsWith("dom-oct.txt") &&
    !filename.endsWith("Quad5-5Feriarc.txt") &&
    !filename.endsWith("Propaganda.txt") &&
    !filename.startsWith("Help\\") &&
    !filename.startsWith("Latin-gabc\\") &&
    filename.startsWith("Latin\\")
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
              if (entry.isDirectory()) {
                acc.directories.push(entry.name);
              } else if (entry.isFile() && fileFilter(entry.name)) {
                acc.files.push(`${root.replaceAll("\\", "/")}/${entry.name}`);
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
