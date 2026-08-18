import { loadAsset, tryLoadAsset } from "./assert/utils";
import {
  selectMassProper,
  applySeason,
  nameSaint,
  type Stores,
} from "../massPropers";
import type { RawMassProper } from "../types";

export type { RawMassProper };
import { assertSanctorum } from "./assert/sanctorum";
import { assertCalendarData } from "./assert/calendarData";
import { assertMassPropers, type MassPropersData } from "./assert/massPropers";

// Access bundled assets from global scope (injected by tsup)
declare const bundledAssets: Record<string, any>;

export function loadCalendarData() {
  const calendarData = loadAsset("calendar1962.yml");
  assertCalendarData(calendarData);
  return calendarData;
}

export function loadSanctorum() {
  const sanctorum = loadAsset("sanctorum.yml");
  assertSanctorum(sanctorum);
  return sanctorum;
}

export function loadPropers(name: string) {
  const propers = loadAsset(`propers/${name}.yml`);
  assertCalendarData(propers);
  return propers;
}

export function loadMassPropers(): MassPropersData {
  const massPropers = loadAsset("mass-propers/index.yml");
  assertMassPropers(massPropers);
  return massPropers;
}

export function loadTranslations(lang: string): Record<string, string> {
  const translations: Record<string, string> = {};

  // Get all bundled assets that are in the translations/{lang}/ folder
  const translationPrefix = `translations/${lang}/`;

  // Access bundledAssets from the global scope (injected by tsup)
  if (typeof bundledAssets !== "undefined") {
    Object.keys(bundledAssets).forEach((path) => {
      const normalizedPath = path.replace(/\\/g, "/");
      if (
        normalizedPath.startsWith(translationPrefix) &&
        (normalizedPath.endsWith(".yml") || normalizedPath.endsWith(".yaml"))
      ) {
        try {
          const translationData =
            bundledAssets[path] || bundledAssets[normalizedPath];

          if (typeof translationData === "object" && translationData !== null) {
            Object.assign(translations, translationData);
          }
        } catch {
          // Ignore if file can't be processed
        }
      }
    });
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

function loadStores(language: string): Stores {
  return {
    readings: (tryLoadAsset(`mass-propers/${language}/lectio.yml`) ??
      {}) as Stores["readings"],
    prayers: (tryLoadAsset(`mass-propers/${language}/oratio.yml`) ??
      {}) as Stores["prayers"],
    chants: (tryLoadAsset(`mass-propers/${language}/antiphona.yml`) ??
      {}) as Stores["chants"],
  };
}

/**
 * The mass proper for a liturgical title, reduced to the rubric in force and
 * with its readings resolved against the store.
 */
export function loadMassPropersByTitle(
  title: string,
  language: string,
  rubrics: ReadonlySet<string> = DEFAULT_RUBRICS,
  season?: { date: Date; easter: Date }
): RawMassProper | undefined {
  const fileName = titleToFileName(title);
  const data =
    tryLoadAsset(`mass-propers/${language}/Sancti/${fileName}.yml`) ??
    tryLoadAsset(`mass-propers/${language}/Tempora/${fileName}.yml`);

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
