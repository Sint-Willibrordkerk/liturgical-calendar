import { Commemoration, LiturgicalDay } from "./types";
import {
  eachDay,
  calculateEaster,
  calculateAdvent,
  dayNumber,
} from "./utils";
import { parseCalendarData } from "./parseCalendarData";
import { loadTranslations, loadMassPropersByTitle } from "./loadAssets";
import { applyFerialMass, SUNDAY_AFTER_EPIPHANY_MASS } from "./ferias";
import { applyResumedSundays } from "./resumedSundays";
import { applyVotiveMasses, type VotiveMassId } from "./votive";
import { asLanguage, type Language } from "./language";
export { type Language } from "./language";
export { type VotiveMassId } from "./votive";

/** Options that shape the calendar beyond the days themselves. */
export type Options = {
  /**
   * Votive Masses to observe, each named by its Latin slug (see `VotiveMassId`
   * for the catalogue). A votive Mass is a matter of local devotion, so none is
   * placed unless it is named here. Only those the rubrics give a recurring day
   * are placed; a votive named for an occasion rather than a date is recognized
   * but placed nowhere.
   */
  votiveMasses?: VotiveMassId[];
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
 */
export default (
  year: number,
  propers: string[] = [],
  language?: Language,
  options: Options = {}
) => {
  const lang = asLanguage(language);
  const translations = loadTranslations(lang);
  const calendar = parseCalendarData(year, propers, lang, translations);

  // A fourth-class feria has no Mass of its own; it takes one from the day the
  // rubrics point at, which needs the whole year built first. The ferias after
  // the First Sunday after the Epiphany take that Sunday's own Mass, which no
  // day of the calendar carries — the Sunday itself is kept as the Holy Family.
  applyFerialMass(
    calendar,
    year,
    loadMassPropersByTitle(SUNDAY_AFTER_EPIPHANY_MASS, lang, undefined, {
      date: new Date(year, 0, 12),
      easter: calculateEaster(year),
    })
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
      loadMassPropersByTitle(title, lang, undefined, {
        date: septuagesima,
        easter,
      })
  );

  // Votive Masses take the free ferias last of all, once every feast and feria
  // has settled: only a day still of the fourth class is theirs to take.
  if (options.votiveMasses?.length) {
    applyVotiveMasses(
      calendar,
      year,
      options.votiveMasses,
      (slug, date) =>
        loadMassPropersByTitle(slug, lang, undefined, { date, easter })
    );
  }

  eachDay(year, ({ month, day }) => {
    const dayData = calendar[month]![day]!;
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
