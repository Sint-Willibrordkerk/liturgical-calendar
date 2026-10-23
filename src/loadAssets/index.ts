import { findAsset, loadAsset } from "./assert/utils";
import type { Language } from "../language";
import {
  selectMassProper,
  applySeason,
  nameSaint,
  isMassSection,
  selectVariant,
  type Stores,
} from "../massPropers";
import type { CalendarData, RawMassProper } from "../types";
import type { Martyrology, MartyrologyDay } from "../martyrology";

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

/**
 * What a local proper may say — the types, classes, commemoration types and
 * colors the base calendar declares valid. A proper is read on its own, so it
 * is checked against the calendar it will be merged into rather than against
 * nothing.
 */
function validity(): Partial<CalendarData> {
  const base = loadCalendarData();
  return {
    "valid-types": base["valid-types"],
    "valid-liturgical-classes": base["valid-liturgical-classes"],
    "valid-commemoration-types": base["valid-commemoration-types"],
    "valid-colors": base["valid-colors"],
  };
}

export function loadPropers(name: string) {
  const propers = loadAsset(`propers/${name}.yml`);
  assertCalendarData(propers, validity());
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

/**
 * The language's Martyrology, or undefined where it carries none: the dates it
 * prints, the movable days' announcements and the conclusion.
 */
export function loadMartyrology(language: Language): Martyrology | undefined {
  const prefix = `martyrologium/${language.code}/`;
  const days: Martyrology["days"] = {};
  let mobile: Martyrology["mobile"] = {};
  let conclusio: Martyrology["conclusio"];

  for (const [path, data] of Object.entries(language.assets ?? {})) {
    const normalized = path.replace(/\\/g, "/");
    if (!normalized.startsWith(prefix) || typeof data !== "object" || data === null) {
      continue;
    }
    const name = normalized.slice(prefix.length).replace(/\.ya?ml$/, "");
    if (/^\d\d-\d\d$/.test(name)) days[name] = data as MartyrologyDay;
    else if (name === "mobile") mobile = data as Martyrology["mobile"];
    else if (name === "conclusio") conclusio = data as Martyrology["conclusio"];
  }

  if (Object.keys(days).length === 0) return undefined;
  return conclusio === undefined ? { days, mobile } : { days, mobile, conclusio };
}

function loadStores(language: Language): Stores {
  const store = (file: string) =>
    fromLanguage(language, `mass-propers/${language.code}/${file}.yml`) ?? {};
  return {
    readings: store("lectio") as Stores["readings"],
    prayers: store("oratio") as Stores["prayers"],
    chants: store("antiphona") as Stores["chants"],
    names: store("nomen") as Stores["names"],
  };
}

/**
 * The mass proper for a liturgical title, reduced to the rubric in force and
 * with its texts said in the language.
 *
 * The day is the same in every language and is bundled here, holding keys
 * alone; the language supplies what each key says. A day the language says
 * nothing of has no Mass in it — nor has any day without a language.
 */
export function loadMassPropersByTitle(
  title: string,
  language: Language,
  rubrics: ReadonlySet<string> = DEFAULT_RUBRICS,
  season?: { date: Date; easter: Date }
): RawMassProper | undefined {
  const fileName = titleToFileName(title);
  const at = (tree: string) => findAsset(`mass-propers/${tree}/${fileName}.yml`);
  const data = at("Sancti") ?? at("Tempora");

  if (!data || typeof data !== "object") {
    return undefined;
  }

  const document = data as Record<string, unknown>;
  const selected = selectMassProper(document, rubrics, loadStores(language));
  // The day holds keys, and the language's words for them are its Mass. Where
  // it has words for none, the language has no Mass for the day, whatever
  // empty section the day carries inline.
  const says = Object.keys(selected).some(
    (key) =>
      isMassSection(key) && typeof selectVariant(document[key], rubrics) === "string"
  );
  if (!says) return undefined;
  const seasonal = season
    ? applySeason(selected, season.date, season.easter)
    : selected;
  // The commons leave the saint's name open; the day supplies it.
  const proper = nameSaint(seasonal);

  return Object.keys(proper).some(isMassSection)
    ? (proper as RawMassProper)
    : undefined;
}
