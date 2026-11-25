// The assets as they are read from the folders they are kept in: by the build
// of the calendar, by the build of each language, by the script that copies
// the generated propers into place, and by the tests. One reader, so the tests
// read what the builds bundle.
import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

const YAML = /\.ya?ml$/;

/** The folder the generated propers are filed in, below a package's assets. */
const PROPERS = "mass-propers";

/**
 * The file that names the days the propers beside it were generated with. It
 * is written as they are copied into place, beside the days in the calendar's
 * assets and beside the stores in each language's.
 */
export const DATA_VERSION_FILE = "data-version";

const HOW_TO_GENERATE =
  "The propers are generated, and filed with the version of their days: run\n" +
  "  pnpm pipeline\n  pnpm copy-mass-propers";

/** Every file below `dir`, by its path below it, with forward slashes, in order. */
function filesBelow(dir, base = "") {
  return readdirSync(dir)
    .sort()
    .flatMap((item) => {
      const path = base ? `${base}/${item}` : item;
      return statSync(join(dir, item)).isDirectory()
        ? filesBelow(join(dir, item), path)
        : [path];
    });
}

/**
 * Every YAML file below `dir`, parsed, by its path below it.
 *
 * @param {string} dir
 * @returns {Record<string, unknown>}
 */
export function readYamlTree(dir) {
  return Object.fromEntries(
    filesBelow(dir)
      .filter((path) => YAML.test(path))
      .map((path) => [path, parse(readFileSync(join(dir, path), "utf-8"))])
  );
}

/**
 * The version of the days in `trees`: a digest of every file in them and the
 * name it is filed under. The days hold keys, and a language's stores say what
 * the keys mean, so stores are right for the days they were generated with and
 * for no others; this is how each says which those were.
 *
 * @param {string[]} trees
 * @returns {string}
 */
export function daysVersion(trees) {
  const hash = createHash("sha256");
  for (const tree of trees) {
    for (const path of filesBelow(tree)) {
      hash.update(`${path}\0`).update(readFileSync(join(tree, path))).update("\0");
    }
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

/** The version filed in `dir`, or undefined where none is. */
function dataVersionIn(dir) {
  const file = join(dir, DATA_VERSION_FILE);
  return existsSync(file) ? readFileSync(file, "utf-8").trim() : undefined;
}

/**
 * What the calendar is built from, as the calendar takes it: every YAML below
 * `assetsDir` by its path, and the version of the days among them.
 *
 * With `days: false` the days of the propers are left out, for what needs the
 * calendar alone: they are some fourteen hundred files.
 *
 * @param {string} assetsDir
 * @param {{ days?: boolean }} [options]
 * @returns {{ files: Record<string, unknown>, dataVersion?: string }}
 */
export function calendarAssets(assetsDir, { days = true } = {}) {
  const all = readYamlTree(assetsDir);
  const isDay = (path) => path.startsWith(`${PROPERS}/`);
  if (!days) {
    return { files: Object.fromEntries(Object.entries(all).filter(([path]) => !isDay(path))) };
  }
  const dataVersion = dataVersionIn(join(assetsDir, PROPERS));
  if (dataVersion === undefined) {
    if (Object.keys(all).some(isDay)) {
      throw new Error(`${join(assetsDir, PROPERS)} has days and no version. ${HOW_TO_GENERATE}`);
    }
    return { files: all };
  }
  return { files: all, dataVersion };
}

/**
 * A language's assets as its package carries them: by kind, then by name.
 *
 * On disk they are filed as the pipeline lays them out,
 * `mass-propers/nl/antiphona.yml`; in the package that is
 * `assets.masspropers.antiphona`. The language segment is dropped, since the
 * package's `code` already names it, and so is the extension.
 *
 * @param {string} assetsDir
 * @param {string} code
 * @returns {Record<string, Record<string, any>>}
 */
export function languageAssets(assetsDir, code) {
  const assets = {};
  for (const kind of readdirSync(assetsDir)) {
    const dir = join(assetsDir, kind, code);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const named = {};
    for (const file of readdirSync(dir)) {
      if (!YAML.test(file)) continue;
      named[file.replace(YAML, "")] = parse(readFileSync(join(dir, file), "utf-8"));
    }
    if (Object.keys(named).length > 0) assets[kind.replace(/-/g, "")] = named;
  }
  return assets;
}

/**
 * The language of the package at `packageDir`, as the calendar takes it: its
 * code, its assets, and the version of the days its stores are keyed to. A
 * language with no stores carries no version: what else it has — its
 * translations, its Martyrology — holds for any days.
 *
 * @param {string} packageDir
 * @returns {{ code: string, dataVersion?: string, assets: Record<string, Record<string, any>> }}
 */
export function readLanguage(packageDir) {
  const { name, liturgicalLanguage: code } = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf-8")
  );
  if (!code) throw new Error(`${name} has no "liturgicalLanguage" in its package.json`);

  const assetsDir = join(packageDir, "assets");
  const assets = existsSync(assetsDir) ? languageAssets(assetsDir, code) : {};
  if (assets.masspropers === undefined) return { code, assets };

  const dataVersion = dataVersionIn(join(assetsDir, PROPERS));
  if (dataVersion === undefined) {
    throw new Error(`${name} has stores and no version of their days. ${HOW_TO_GENERATE}`);
  }
  return { code, dataVersion, assets };
}
