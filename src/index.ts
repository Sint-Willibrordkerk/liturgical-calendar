import { Commemoration, LiturgicalDay } from "./types";
import {
  eachDay,
  calculateEaster,
  calculateAdvent,
  dayNumber,
} from "./utils";
import { parseCalendarData } from "./parseCalendarData";
import {
  DEFAULT_RUBRICS,
  loadTranslations,
  loadMassPropersByTitle,
  loadOfficiumByTitle,
  loadMartyrology,
} from "./loadAssets";
import {
  applyFerialMass,
  SUNDAY_AFTER_EPIPHANY_MASS,
  SUNDAY_AFTER_PENTECOST_MASS,
  SUNDAY_AFTER_PENTECOST_VARIANT,
} from "./ferias";
import { applyResumedSundays } from "./resumedSundays";
import { applyMartyrology } from "./martyrology";
import { asLanguages, type Language } from "./language";
export { type Language } from "./language";
export type {
  Calendar,
  Color,
  Commemoration,
  LiturgicalDay,
  Martyrologium,
  Officium,
  Season,
} from "./types";

/** Options that shape the calendar beyond the days themselves. */
export type Options = {
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

  delete day.commemorationType;
  delete day.acceptCommemorationTypes;
  // Note: mass field is preserved and not deleted
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
 * for, and the Office, the Martyrology and the translations are its own. The
 * rest say the Mass where it has no words for a text, the first that has them
 * first, and `mass.fallback` names the sections they said by their codes. A
 * Dutch calendar with Latin behind it is `[nl, la]`: the Dutch package carries
 * no Latin, the caller adds it.
 */
export default (
  year: number,
  propers: string[] = [],
  language?: Language | Language[],
  options: Options = {}
) => {
  const [lang, ...fallbacks] = asLanguages(language);
  const translations = loadTranslations(lang);
  const calendar = parseCalendarData(
    year,
    propers,
    lang,
    translations,
    options.officium === true,
    fallbacks
  );

  // A year with more Sundays after Pentecost than the missal numbers resumes
  // the Sundays after the Epiphany that Septuagesima cut short. Which of those
  // were kept decides which are left to resume.
  const easter = calculateEaster(year);
  const septuagesima = new Date(easter);
  septuagesima.setDate(septuagesima.getDate() - 63);
  const epiphanySundaysKept = countSundays(new Date(year, 0, 6), septuagesima);
  applyResumedSundays(
    calendar,
    year,
    easter,
    calculateAdvent(year),
    epiphanySundaysKept,
    (title) =>
      loadMassPropersByTitle(
        title,
        lang,
        undefined,
        { date: septuagesima, easter },
        undefined,
        fallbacks
      ),
    options.officium ? (title) => loadOfficiumByTitle(title, lang) : undefined
  );

  // A fourth-class feria has no Mass of its own; it takes one from the day the
  // rubrics point at, which needs the whole year built first, the resumed
  // Sundays included. The ferias after the First Sundays after the Epiphany and
  // after Pentecost take those Sundays' own Masses, which no day of the calendar
  // carries — the Sundays themselves are kept as the Holy Family and the Holy
  // Trinity.
  const afterTrinity = new Date(easter);
  afterTrinity.setDate(afterTrinity.getDate() + 57);
  applyFerialMass(
    calendar,
    year,
    loadMassPropersByTitle(
      SUNDAY_AFTER_EPIPHANY_MASS,
      lang,
      undefined,
      { date: new Date(year, 0, 12), easter },
      undefined,
      fallbacks
    ),
    loadMassPropersByTitle(
      SUNDAY_AFTER_PENTECOST_MASS,
      lang,
      new Set([...DEFAULT_RUBRICS, SUNDAY_AFTER_PENTECOST_VARIANT]),
      { date: afterTrinity, easter },
      undefined,
      fallbacks
    )
  );

  // The Martyrology follows the date, not the celebration, so it can be laid
  // on once the days are in place.
  if (options.martyrologium) {
    const martyrology = loadMartyrology(lang);
    if (martyrology) applyMartyrology(calendar, year, martyrology, translations);
  }

  // A season and a color are identifiers; the language gives each its name,
  // where it carries one, beside it.
  const nameOf = (key: string | undefined): string | undefined =>
    key === undefined ? undefined : translations[key];

  eachDay(year, ({ month, day }) => {
    const dayData = calendar[month]![day]!;
    const seasonName = nameOf(dayData.season);
    const colorName = nameOf(dayData.color);
    const alternativeColorName = nameOf(dayData.alternativeColor);
    if (seasonName !== undefined) dayData.seasonName = seasonName;
    if (colorName !== undefined) dayData.colorName = colorName;
    if (alternativeColorName !== undefined) {
      dayData.alternativeColorName = alternativeColorName;
    }
    dayData.commemorations = dayData.commemorations.filter(
      (commemoration: Commemoration) =>
        dayData.acceptCommemorationTypes?.includes(
          commemoration.commemorationType!
        )
    );
    deleteFields(dayData);
  });
  return calendar;
};

/** The Sundays falling strictly after `from` and strictly before `until`. */
function countSundays(from: Date, until: Date): number {
  let count = 0;
  const date = new Date(from);
  date.setDate(date.getDate() + 1);
  const last = dayNumber(until);
  for (; dayNumber(date) < last; date.setDate(date.getDate() + 1)) {
    if (date.getDay() === 0) count++;
  }
  return count;
}
