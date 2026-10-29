import { findAsset, loadAsset } from "./assert/utils";
import type { Language } from "../language";
import {
  resolveMassProper,
  applySeason,
  nameSaint,
  isMassSection,
  selectVariant,
  type FellBack,
  type Stores,
} from "../massPropers";
import type { CalendarData, Officium, RawMassProper } from "../types";
import { buildOfficium, isOfficeSection } from "../officium";
import type { Martyrology, MartyrologyDay } from "../martyrology";

export type { RawMassProper };
import { assertCalendarData } from "./assert/calendarData";

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
export function loadTranslations(languages: Language[]): Record<string, string> {
  const translations: Record<string, string> = {};
  for (const language of languages.toReversed()) {
    for (const data of Object.values(language.assets?.translations ?? {})) {
      if (typeof data === "object" && data !== null) {
        Object.assign(translations, data);
      }
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
  const days: Martyrology["days"] = {};
  let mobile: Martyrology["mobile"] = {};
  let conclusio: Martyrology["conclusio"];

  for (const [name, data] of Object.entries(language.assets?.martyrologium ?? {})) {
    if (typeof data !== "object" || data === null) continue;
    if (/^\d\d-\d\d$/.test(name)) days[name] = data as MartyrologyDay;
    else if (name === "mobile") mobile = data as Martyrology["mobile"];
    else if (name === "conclusio") conclusio = data as Martyrology["conclusio"];
  }

  if (Object.keys(days).length === 0) return undefined;
  return conclusio === undefined ? { days, mobile } : { days, mobile, conclusio };
}

function loadStores(language: Language): Stores {
  const store = (name: string) => language.assets?.masspropers?.[name] ?? {};
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
 * The day filed under an id, holding keys, or undefined.
 *
 * The local calendars named are searched first, in their order — the most
 * particular first — and the general trees after them. Only a local proper's
 * own days name them, so a general day keeps its propers.
 */
function dayById(
  id: string,
  local: readonly string[] = [],
): Record<string, unknown> | undefined {
  // An id is filed as itself; a title is folded to the file it names.
  const fileName = titleToFileName(id);
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
 *
 * With `fallbacks`, a text the language lacks is said in the first of them that
 * has it, and `fellBack` names those sections. A day the language says nothing
 * of is then said entirely in the fallbacks.
 */
function properOf(
  document: Record<string, unknown>,
  language: Language,
  rubrics: ReadonlySet<string>,
  belongs: (key: string) => boolean,
  fallbacks: readonly Language[] = [],
): { proper: Record<string, unknown>; fellBack: FellBack } | undefined {
  const own = Object.fromEntries(
    Object.entries(document).filter(([key]) => belongs(key) || DESIGNATIONS.has(key)),
  );
  const backups = fallbacks
    .filter((other) => other.code !== language.code)
    .map((other) => ({ code: other.code, stores: loadStores(other) }));
  const selected = resolveMassProper(own, rubrics, loadStores(language), backups);
  const says = Object.keys(selected.proper).some(
    (key) => belongs(key) && typeof selectVariant(document[key], rubrics) === "string",
  );
  return says ? selected : undefined;
}

/**
 * The mass proper filed under an id, reduced to the rubric in force and with
 * its texts said in the language.
 *
 * The day is the same in every language and is bundled here, holding keys
 * alone; the language supplies what each key says. A day the language says
 * nothing of has no Mass in it — nor has any day without a language.
 *
 * The `fallbacks` say the texts the language has none for, the first that has
 * one first, and `fallback` on the Mass names the sections they said, by their
 * codes — absent when the Mass is wholly the language's own.
 */
export function loadMassPropersById(
  id: string,
  language: Language,
  rubrics: ReadonlySet<string> = DEFAULT_RUBRICS,
  season?: { date: Date; easter: Date },
  local: readonly string[] = [],
  fallbacks: readonly Language[] = [],
): RawMassProper | undefined {
  const document = dayById(id, local);
  if (document === undefined) return undefined;

  const selected = properOf(document, language, rubrics, isMassSection, fallbacks);
  if (selected === undefined) return undefined;
  const seasonal = season
    ? applySeason(selected.proper, season.date, season.easter)
    : selected.proper;
  // The commons leave the saint's name open; the day supplies it.
  const proper = nameSaint(seasonal);
  if (!Object.keys(proper).some(isMassSection)) return undefined;

  // The season may have set a chant aside; the marker names only what is said.
  const said = Object.fromEntries(
    Object.entries(selected.fellBack).filter(([key]) => key in proper),
  );
  return (Object.keys(said).length > 0 ? { ...proper, fallback: said } : proper) as RawMassProper;
}

/**
 * The propers of the Office filed under an id, Hour by Hour, reduced to the
 * rubric in force and said in the language. Undefined where the language says
 * nothing of the day's Office, and without a language.
 */
export function loadOfficiumById(
  id: string,
  language: Language,
  rubrics: ReadonlySet<string> = DEFAULT_RUBRICS,
  local: readonly string[] = [],
  fallbacks: readonly Language[] = [],
): Officium | undefined {
  const own = dayById(id, local);
  const elsewhere = OFFICE_FILED_WITH[titleToFileName(id)];
  const document = elsewhere === undefined ? own : dayById(elsewhere, local);
  if (document === undefined) return undefined;

  // The collect is the day's own, said at Mass and at the Hours alike.
  const office = { ...document, oratio: own?.oratio ?? document.oratio };
  const selected = properOf(
    office,
    language,
    rubrics,
    (key) => isOfficeSection(key) || key === "oratio",
    fallbacks,
  );
  if (selected === undefined) return undefined;
  return buildOfficium(nameSaint(selected.proper), selected.fellBack);
}

/**
 * A day whose Office the sources keep with another of its Masses. Christmas
 * has three Masses and one Office, which is filed with the first, at midnight;
 * the calendar keeps the day by the third. Its collect is the third Mass's,
 * which the Hours say from Lauds on.
 */
const OFFICE_FILED_WITH: Record<string, string> = {
  "in-die-nativitatis-domini": "in-nativitate-domini",
};
