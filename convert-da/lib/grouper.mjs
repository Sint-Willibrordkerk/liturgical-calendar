import { consola } from "consola";
import { join } from "path";
import { readdir } from "fs/promises";

/**
 * Language folder name → 2-letter ISO code (or short variant code).
 */
export const LANGUAGE_CODES = {
  Bohemice: "cs",
  "Cesky-Schaller": "cs-schaller",
  Dansk: "da",
  Deutsch: "de",
  English: "en",
  Espanol: "es",
  Francais: "fr",
  Italiano: "it",
  Latin: "la",
  "Latin-Bea": "la-bea",
  "Latin-gabc": "la-gabc",
  Magyar: "hu",
  Nederlands: "nl",
  Polski: "pl",
  "Polski-Newer": "pl-newer",
  Portugues: "pt",
  Ukrainian: "uk",
  Vietnamice: "vi",
};

/**
 * Rubric/calendar suffixes: strip from stem to get "base" for merging.
 * Order matters: longer suffixes first for correct matching.
 */
const RUBRIC_SUFFIXES = [
  "dat", "oct", "cc", "da", "nt", "ot", "rt", "pt", "qt", "tt",
  "t", "o", "r", "n", "p", "q",
];

/**
 * Directory suffixes to detect variant directories.
 * Order matters: longer suffixes first to match greedily.
 */
const DIR_SUFFIXES = [
  "1955R", "1960", "1570",
  "Cist", "OP", "M",
];

/**
 * Filter function for source .txt files.
 */
function fileFilter(filename) {
  return (
    filename.endsWith(".txt") &&
    !filename.endsWith("pl.txt") &&
    !filename.endsWith("tts.txt")
  );
}

/**
 * Convert language folder name to code.
 */
export function convertLanguage(langFolder) {
  return LANGUAGE_CODES[langFolder] ?? langFolder;
}

/**
 * Get base stem by stripping rubric suffix.
 */
export function getBaseStem(stem) {
  for (const suf of RUBRIC_SUFFIXES) {
    if (stem !== suf && stem.endsWith(suf)) {
      return stem.slice(0, -suf.length);
    }
  }
  return stem;
}

/**
 * Parse directory name into base and suffix.
 * E.g., "Martyrologium1570" → { base: "Martyrologium", suffix: "1570" }
 */
export function parseDirName(dirName) {
  for (const suf of DIR_SUFFIXES) {
    if (dirName.endsWith(suf) && dirName.length > suf.length) {
      return { base: dirName.slice(0, -suf.length), suffix: suf };
    }
  }
  return { base: dirName, suffix: null };
}

/**
 * Compute the output key for a source file path.
 * This combines step 4 (horas+missa), step 5 (rubric variants), and step 6 (dir variants).
 *
 * Input: "horas/Latin/Sancti/01-01t.txt" or "missa/English/SanctiCist/12-25.txt"
 * Output: "la/Sancti/01-01" or "en/Sancti/12-25"
 *
 * @param {string} relPath - Relative path from divinum-officium base (e.g., "horas/Latin/Sancti/01-01t.txt")
 * @returns {{ outputKey: string, root: string, rubricSuffix: string|null, dirSuffix: string|null }}
 */
export function computeOutputKey(relPath) {
  const parts = relPath.replace(/\\/g, "/").split("/");

  // Expected: root/language/category/[subcategory/]file.txt
  // Minimum: root/language/category/file.txt (4 parts)
  if (parts.length < 4) {
    throw new Error(`Invalid path structure: ${relPath}`);
  }

  const root = parts[0]; // "horas" or "missa"
  const langFolder = parts[1];
  const langCode = convertLanguage(langFolder);

  // Middle parts: category (and optional subcategory)
  const middleParts = parts.slice(2, -1);
  const filename = parts[parts.length - 1];

  // Parse directory for variants (e.g., SanctiCist → Sancti + Cist)
  const firstDir = middleParts[0];
  const { base: baseDir, suffix: dirSuffix } = parseDirName(firstDir);
  const normalizedMiddle = [baseDir, ...middleParts.slice(1)];

  // Parse filename for rubric variants (e.g., 01-01t.txt → 01-01 + t)
  const stem = filename.replace(/\.txt$/i, "");
  const baseStem = getBaseStem(stem);
  const rubricSuffix = stem !== baseStem ? stem.slice(baseStem.length) : null;

  // Build output key: langCode/baseDir/[subcategory/]baseStem
  const outputKey = [langCode, ...normalizedMiddle, baseStem].join("/");

  return { outputKey, root, rubricSuffix, dirSuffix };
}

/**
 * @typedef {Object} SourceFile
 * @property {string} relPath - Original relative path from divinum-officium base
 * @property {string} root - "horas" or "missa"
 * @property {string|null} rubricSuffix - e.g., "t", "n", "da", or null for base
 * @property {string|null} dirSuffix - e.g., "Cist", "1570", or null for base
 */

/**
 * @typedef {Object} SourceGroup
 * @property {string} outputKey - The normalized output key
 * @property {SourceFile[]} horasFiles - Source files from horas/
 * @property {SourceFile[]} missaFiles - Source files from missa/
 */

/**
 * Scan source files and group them by output key.
 *
 * @param {string} divinumOfficiumBase - Path to divinum-officium/web/www
 * @returns {Promise<Map<string, SourceGroup>>} Map of outputKey → SourceGroup
 */
export async function scanSourceFiles(divinumOfficiumBase) {
  const groups = new Map();
  const roots = ["horas", "missa"];

  for (const root of roots) {
    const rootPath = join(divinumOfficiumBase, root);
    let entries;
    try {
      entries = await readdir(rootPath, { recursive: true });
    } catch (err) {
      consola.warn(`Could not read ${rootPath}: ${err.message}`);
      continue;
    }

    const txtFiles = entries.filter(fileFilter);

    for (const entry of txtFiles) {
      const relPath = `${root}/${entry.replace(/\\/g, "/")}`;

      let parsed;
      try {
        parsed = computeOutputKey(relPath);
      } catch {
        // Skip files that don't match expected structure
        continue;
      }

      const { outputKey, rubricSuffix, dirSuffix } = parsed;

      if (!groups.has(outputKey)) {
        groups.set(outputKey, {
          outputKey,
          horasFiles: [],
          missaFiles: [],
        });
      }

      const group = groups.get(outputKey);
      const sourceFile = { relPath, root, rubricSuffix, dirSuffix };

      if (root === "horas") {
        group.horasFiles.push(sourceFile);
      } else {
        group.missaFiles.push(sourceFile);
      }
    }
  }

  // Sort files within each group: base files first (null suffix), then variants
  for (const group of groups.values()) {
    const sortFn = (a, b) => {
      // Base files (both null) first
      const aIsBase = a.rubricSuffix === null && a.dirSuffix === null;
      const bIsBase = b.rubricSuffix === null && b.dirSuffix === null;
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      // Then by suffix for consistent ordering
      const aSuf = `${a.dirSuffix ?? ""}${a.rubricSuffix ?? ""}`;
      const bSuf = `${b.dirSuffix ?? ""}${b.rubricSuffix ?? ""}`;
      return aSuf.localeCompare(bSuf);
    };
    group.horasFiles.sort(sortFn);
    group.missaFiles.sort(sortFn);
  }

  return groups;
}

/**
 * Get the suffix key for a file based on its rubric and dir suffixes.
 * Used when merging variant files.
 *
 * @param {SourceFile} sourceFile
 * @returns {string|null}
 */
export function getSuffixKey(sourceFile) {
  const { rubricSuffix, dirSuffix } = sourceFile;
  if (rubricSuffix === null && dirSuffix === null) {
    return null;
  }
  // Combine: dirSuffix first if present, then rubricSuffix
  const parts = [];
  if (dirSuffix) parts.push(dirSuffix.toLowerCase());
  if (rubricSuffix) parts.push(rubricSuffixToKey(rubricSuffix));
  return parts.join("-") || null;
}

/**
 * Map rubric suffix to a descriptive key.
 */
const SUFFIX_TO_KEY = {
  t: "tridentine",
  o: "1888",
  r: "1960",
  n: "1960-new",
  da: "divino-afflatu",
  p: "paschaltide",
  q: "lent",
  cc: "simplex-impeded",
  oct: "octave",
  nt: "1960-transfer",
  ot: "1888-transfer",
  rt: "1960-transfer",
  pt: "paschaltide-transfer",
  qt: "lent-transfer",
  tt: "tridentine-transfer",
  dat: "divino-afflatu-transfer",
};

function rubricSuffixToKey(suffix) {
  return SUFFIX_TO_KEY[suffix] ?? suffix;
}
