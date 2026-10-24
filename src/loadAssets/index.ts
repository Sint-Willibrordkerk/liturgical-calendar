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
import type { CalendarData, Officium, RawMassProper } from "../types";
import { buildOfficium, isOfficeSection } from "../officium";
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
    hymns: store("hymnus") as Stores["hymns"],
    chapters: store("capitulum") as Stores["chapters"],
    responsories: store("responsorium") as Stores["responsories"],
    versicles: store("versus") as Stores["versicles"],
  };
}

/**
 * The day filed under a liturgical title, holding keys, or undefined.
 *
 * The local calendars named are searched first, in their order — the most
 * particular first — and the general trees after them. Only a local proper's
 * own days name them, so a general day keeps its propers.
 */
function dayByTitle(
  title: string,
  local: readonly string[] = []
): Record<string, unknown> | undefined {
  const fileName = titleToFileName(title);
  const at = (tree: string) => findAsset(`mass-propers/${tree}/${fileName}.yml`);
  const data =
    local.map((calendar) => at(`Sancti/${calendar}`)).find((day) => day !== undefined) ??
    at("Sancti") ??
    at("Tempora");
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
}

/** Keys that name the celebration, kept with its Mass. */
const DESIGNATIONS = new Set(["title", "name", "prefatio"]);

/**
 * The sections of a day `belongs` selects, reduced to the rubric in force and
 * with their texts said in the language; undefined where the language has words
 * for none of them, whatever empty section the day carries inline.
 */
function properOf(
  document: Record<string, unknown>,
  language: Language,
  rubrics: ReadonlySet<string>,
  belongs: (key: string) => boolean
): Record<string, unknown> | undefined {
  const own = Object.fromEntries(
    Object.entries(document).filter(([key]) => belongs(key) || DESIGNATIONS.has(key))
  );
  const selected = selectMassProper(own, rubrics, loadStores(language));
  const says = Object.keys(selected).some(
    (key) => belongs(key) && typeof selectVariant(document[key], rubrics) === "string"
  );
  return says ? selected : undefined;
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
  season?: { date: Date; easter: Date },
  local: readonly string[] = []
): RawMassProper | undefined {
  const document = dayByTitle(title, local);
  if (document === undefined) return undefined;

  const selected = properOf(document, language, rubrics, isMassSection);
  if (selected === undefined) return undefined;
  const seasonal = season
    ? applySeason(selected, season.date, season.easter)
    : selected;
  // The commons leave the saint's name open; the day supplies it.
  const proper = nameSaint(seasonal);

  return Object.keys(proper).some(isMassSection)
    ? (proper as RawMassProper)
    : undefined;
}

/**
 * The propers of the Office for a liturgical title, Hour by Hour, reduced to the
 * rubric in force and said in the language. Undefined where the language says
 * nothing of the day's Office, and without a language.
 */
export function loadOfficiumByTitle(
  title: string,
  language: Language,
  rubrics: ReadonlySet<string> = DEFAULT_RUBRICS,
  local: readonly string[] = []
): Officium | undefined {
  const own = dayByTitle(title, local);
  const elsewhere = OFFICE_FILED_WITH[titleToFileName(title)];
  const document = elsewhere === undefined ? own : dayByTitle(elsewhere, local);
  if (document === undefined) return undefined;

  // The collect is the day's own, said at Mass and at the Hours alike.
  const office = { ...document, oratio: own?.oratio ?? document.oratio };
  const selected = properOf(
    office,
    language,
    rubrics,
    (key) => isOfficeSection(key) || key === "oratio"
  );
  if (selected === undefined) return undefined;
  return buildOfficium(nameSaint(selected));
}

/**
 * A day whose Office the sources keep with another of its Masses. Christmas
 * has three Masses and one Office, which is filed with the first, at midnight;
 * the calendar keeps the day by the third. Its collect is the third Mass's,
 * which the Hours say from Lauds on.
 */
const OFFICE_FILED_WITH: Record<string, string> = {
  "in-die-nativitatis-domini": "In Nativitate Domini",
};
