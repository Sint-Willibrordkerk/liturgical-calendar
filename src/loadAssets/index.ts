import { loadAsset } from "./assert/utils";
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
