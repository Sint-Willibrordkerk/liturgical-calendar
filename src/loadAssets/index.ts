import { loadAsset, tryLoadAsset } from "./assert/utils";
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

export type RawMassProper = {
  name?: string;
  introitus?: {
    antiphon?: { ref?: string; text?: string };
    verse?: { ref?: string; text?: string };
  };
  oratio?: { text?: string; closure?: string };
  lectio?: { ref?: string; text?: string };
  graduale?: {
    antiphon?: { ref?: string; text?: string };
    verse?: { ref?: string; text?: string };
    alleluia?: { ref?: string; text?: string };
  };
  tractus?: { verses?: string[] };
  evangelium?: { ref?: string; text?: string };
  offertorium?: { ref?: string; text?: string };
  secreta?: { text?: string; closure?: string };
  communio?: { ref?: string; text?: string };
  postcommunio?: { text?: string; closure?: string };
};

const MASS_PROPER_FIELDS = [
  "name",
  "introitus",
  "oratio",
  "lectio",
  "graduale",
  "alleluia",
  "tractus",
  "evangelium",
  "offertorium",
  "secreta",
  "communio",
  "postcommunio",
] as const;

export function loadMassPropersByTitle(
  title: string,
  language: string
): RawMassProper | undefined {
  const sanctiPath = `divinum-officium/${language}/Sancti/${title}.yml`;
  const temporaPath = `divinum-officium/${language}/Tempora/${title}.yml`;

  let data = tryLoadAsset(sanctiPath);
  if (!data) {
    data = tryLoadAsset(temporaPath);
  }

  if (!data || typeof data !== "object") {
    return undefined;
  }

  const result: RawMassProper = {};
  for (const field of MASS_PROPER_FIELDS) {
    if (field in data) {
      (result as any)[field] = data[field];
    }
  }

  if (Object.keys(result).length === 0) {
    return undefined;
  }

  return result;
}
