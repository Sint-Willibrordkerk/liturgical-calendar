import { Commemoration, LiturgicalDay } from "./types";
import { eachDay } from "./utils";
import { parseCalendarData } from "./parseCalendarData";
import { loadTranslations, loadMartyrology, loadCommemorationRules } from "./loadAssets";
import { applyFerialMass } from "./ferias";
import { applyResumedSundays } from "./resumedSundays";
import { applyCommemorations } from "./commemorations";
import { applyPropers } from "./propers";
import { nameDays } from "./naming";
import { applyMartyrology } from "./martyrology";
import { asLanguages, type Language } from "./language";
export { type Language } from "./language";
export type {
  Calendar,
  Color,
  Commemoration,
  Fallback,
  LiturgicalDay,
  Martyrologium,
  Officium,
  Season,
} from "./types";

/** Options that shape the calendar beyond the days themselves. */
export type Options = {
  year?: number;
  propers?: string[];
  languages?: Language[];
  /**
   * Give each day the Roman Martyrology printed under its date, in the
   * language passed in where it has one. It is read at Prime on the day
   * before, and runs to a few kilobytes a day, so it is left out unless asked
   * for.
   */
  martyrologium?: boolean;
  /**
   * Give each day the propers of its Office — the Breviary's texts of the day,
   * Hour by Hour — in the language passed in. They run to several kilobytes a
   * day, so they are left out unless asked for.
   */
  officium?: boolean;
};

function deleteFields(day: Partial<LiturgicalDay | Commemoration>) {
  if ("commemorations" in day && day.commemorations) {
    day.commemorations.forEach(deleteFields);
    if (!day.commemorations.length) {
      delete day.commemorations;
    }
  }

  delete day.commemorated;
  delete day.admits;
  delete day.omittedOn;
  delete day.honours;
  delete day.ofTheSeason;
  delete day.proper;
  delete day.naming;
  // Nothing named the day: its id says which it is.
  if (day.title === undefined) delete day.title;
}

/**
 * The liturgical calendar of `year`, in the language given.
 *
 * The language is a package of its own —
 * `@sint-willibrordkerk/liturgical-calendar-la`, `…-nl` — imported and passed
 * in, so a caller carries only the languages they read. Omit it and the
 * calendar comes out with the days in place but no propers and no
 * translations.
 *
 * Several languages may be passed, as a list. The first is the language asked
 * for; the translations are its own. The rest say what it has no words for — a
 * text of the Mass, of the Office, a date of the Martyrology — the first that
 * has it first, and a `fallback` on the part names what they said, by their
 * codes. A Dutch calendar with Latin behind it is `[nl, la]`: the Dutch package
 * carries no Latin, the caller adds it.
 */
export default ({
  year = new Date().getFullYear(),
  propers = [],
  languages = [],
  martyrologium,
  officium,
}: Options = {}) => {
  // The days, which are the same in every language: which is kept and which
  // commemorated, and where the Mass of each is filed.
  const calendar = parseCalendarData(year, propers);
  applyResumedSundays(calendar, year);
  applyFerialMass(calendar, year);
  // Of the days given way, those commemorated, by the calendar's rules. After
  // the ferias: a feria takes the Mass of the Sunday as such, which a feast
  // kept on it may exclude from its commemorations.
  applyCommemorations(calendar, year, loadCommemorationRules());

  // What the languages say of them.
  const translations = loadTranslations(languages);
  applyPropers(calendar, year, languages, { officium: officium === true });
  if (martyrologium) {
    applyMartyrology(calendar, year, martyrologySources(languages), asLanguages(languages)[0].code);
  }
  nameDays(calendar, year, translations);

  eachDay(year, ({ month, day }) => {
    deleteFields(calendar[month]![day]!);
  });
  return calendar;
};

/**
 * The languages that print a Martyrology, each once, in the order asked for,
 * with the translations that name its dates.
 */
function martyrologySources(languages: Language[]) {
  return asLanguages(languages)
    .filter((each, i, all) => all.findIndex((other) => other.code === each.code) === i)
    .flatMap((each) => {
      const martyrology = loadMartyrology(each);
      return martyrology
        ? [{ code: each.code, martyrology, translations: loadTranslations([each]) }]
        : [];
    });
}
