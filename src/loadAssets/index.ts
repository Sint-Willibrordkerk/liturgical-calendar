import { loadAsset } from "./assert/utils";
import type { Language } from "../language";
import {
  selectMassProper,
  applySeason,
  nameSaint,
  type Stores,
} from "../massPropers";
import type { RawMassProper } from "../types";

export type { RawMassProper };
import { assertCalendarData } from "./assert/calendarData";

/**
 * An asset the language carries, or `undefined` where it carries none.
 *
 * A language is handed in rather than bundled here, so this is the only way the
 * calendar reaches anything language-specific. Paths are matched with either
 * separator, since a packager may have written them in the platform's own.
 */
function fromLanguage(language: Language, path: string): unknown {
  const assets = language.assets;
  if (assets == null) return undefined;
  return assets[path] ?? assets[path.replace(/\//g, "\\")];
}

export function loadCalendarData() {
  const calendarData = loadAsset("calendar1962.yml");
  assertCalendarData(calendarData);
  return calendarData;
}

export function loadPropers(name: string) {
  const propers = loadAsset(`propers/${name}.yml`);
  assertCalendarData(propers);
  return propers;
}

/** Every translation the language carries, read as one table. */
export function loadTranslations(language: Language): Record<string, string> {
  const translations: Record<string, string> = {};
  const prefix = `translations/${language.code}/`;

  for (const [path, data] of Object.entries(language.assets ?? {})) {
    const normalized = path.replace(/\\/g, "/");
    if (!normalized.startsWith(prefix)) continue;
    if (!normalized.endsWith(".yml") && !normalized.endsWith(".yaml")) continue;
    if (typeof data === "object" && data !== null) {
      Object.assign(translations, data);
    }
  }

  return translations;
}

/**
 * The rubric the shipped calendar is generated under. `calendar1962.yml` is the
 * 1962 calendar, so its propers are read under the 1962 rubric.
 */
export const DEFAULT_RUBRICS = new Set(["1962"]);

/**
 * A liturgical title as the propers are filed under it. This must match, byte
 * for byte, the filename step 7 derives from the same title (`toKebabFileName`),
 * or a day fails to find its file: accents folded, the ligatures written out,
 * dots and commas dropped, any other run a single hyphen, and a leading
 * `s`/`ss`/`b`/`bb` honorific segment removed.
 */
export function titleToFileName(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, "")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(ss?|bb?)-/, "");
}

function loadStores(language: Language): Stores {
  const store = (file: string) =>
    fromLanguage(language, `mass-propers/${language.code}/${file}.yml`) ?? {};
  return {
    readings: store("lectio") as Stores["readings"],
    prayers: store("oratio") as Stores["prayers"],
    chants: store("antiphona") as Stores["chants"],
  };
}

/**
 * The mass proper for a liturgical title, reduced to the rubric in force and
 * with its readings resolved against the store.
 */
export function loadMassPropersByTitle(
  title: string,
  language: Language,
  rubrics: ReadonlySet<string> = DEFAULT_RUBRICS,
  season?: { date: Date; easter: Date }
): RawMassProper | undefined {
  const fileName = titleToFileName(title);
  const at = (tree: string) =>
    fromLanguage(language, `mass-propers/${language.code}/${tree}/${fileName}.yml`);
  const data = at("Sancti") ?? at("Tempora");

  if (!data || typeof data !== "object") {
    return undefined;
  }

  const selected = selectMassProper(
    data as Record<string, unknown>,
    rubrics,
    loadStores(language)
  );
  const seasonal = season
    ? applySeason(selected, season.date, season.easter)
    : selected;
  // The commons leave the saint's name open; the day supplies it.
  const proper = nameSaint(seasonal);

  return Object.keys(proper).length === 0
    ? undefined
    : (proper as RawMassProper);
}
