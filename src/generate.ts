import type { Assets } from "./assets";
import type { Calendar } from "./types";
import { eachDay } from "./utils";
import { parseCalendarData } from "./parseCalendarData";
import {
  loadTranslations,
  loadMassTitles,
  loadMartyrology,
  loadCommemorationRules,
} from "./loadAssets";
import { applyFerialMass } from "./ferias";
import { applyResumedSundays } from "./resumedSundays";
import { applyCommemorations } from "./commemorations";
import { applyPropers } from "./propers";
import { nameDays } from "./naming";
import { applyMartyrology } from "./martyrology";
import { NO_LANGUAGE, languageProblems, type Language } from "./language";
import { publish } from "./publish";

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

/**
 * The generator of calendars from `assets`: the calendar, the local propers
 * and the days of the propers it is to read. The package's default export is
 * this for the assets it is published with; a test hands in its own.
 *
 * What it returns is the liturgical calendar of `year`, in the language given.
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
 *
 * A language's stores must be keyed to the days among the assets: one
 * generated with other days is refused, since its texts would be missing or
 * another day's.
 */
export function calendarOf(assets: Assets) {
  return ({
    year = new Date().getFullYear(),
    propers = [],
    languages = [],
    martyrologium,
    officium,
  }: Options = {}): Calendar => {
    const mismatched = languageProblems(languages, assets.dataVersion);
    if (mismatched.length > 0) throw new Error(mismatched.join("\n"));

    // The days, which are the same in every language: which is kept and which
    // commemorated, and where the Mass of each is filed.
    const calendar = parseCalendarData(assets, year, propers);
    applyResumedSundays(calendar, year);
    applyFerialMass(calendar, year);
    // Of the days given way, those commemorated, by the calendar's rules. After
    // the ferias: a feria takes the Mass of the Sunday as such, which a feast
    // kept on it may exclude from its commemorations.
    applyCommemorations(calendar, year, loadCommemorationRules(assets));

    // What the languages say of them.
    const translations = loadTranslations(languages);
    applyPropers(assets, calendar, year, languages, { officium: officium === true });
    if (martyrologium) {
      const asked = (languages[0] ?? NO_LANGUAGE).code;
      applyMartyrology(calendar, year, martyrologySources(languages), asked);
    }
    nameDays(calendar, year, translations, loadMassTitles(languages));

    // The days as they are published: without what they were settled with.
    const published: Calendar = {};
    eachDay(year, ({ month, day }) => {
      (published[month] ??= {})[day] = publish(calendar[month]![day]!);
    });
    return published;
  };
}

/**
 * The languages that print a Martyrology, each once, in the order asked for,
 * with the translations that name its dates.
 */
function martyrologySources(languages: Language[]) {
  return languages
    .filter((each, i, all) => all.findIndex((other) => other.code === each.code) === i)
    .flatMap((each) => {
      const martyrology = loadMartyrology(each);
      return martyrology
        ? [{ code: each.code, martyrology, translations: loadTranslations([each]) }]
        : [];
    });
}
