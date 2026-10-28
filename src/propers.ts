/**
 * The propers of the days, read in the languages asked for.
 *
 * The days are settled first, the same in every language, and each holds
 * where its Mass is filed. This is the one place they are read from there:
 * the Mass of each day and of each of its commemorations, and the Office of
 * the celebration kept.
 */
import type { Calendar, ProperReference, RawMassProper } from "./types";
import type { Language } from "./language";
import { asLanguages } from "./language";
import { DEFAULT_RUBRICS, loadMassPropersByTitle, loadOfficiumByTitle } from "./loadAssets";
import { calculateEaster, eachDay } from "./utils";

/**
 * Read the propers of every day of `year` in `languages`: the first is the
 * language asked for, the rest say what it has no words for. The Office is
 * read only when asked for, and only of the celebration: a commemoration is a
 * collect added to the Mass, and a borrowed Mass brings no Office with it.
 */
export function applyPropers(
  calendar: Calendar,
  year: number,
  languages: Language[],
  { officium = false }: { officium?: boolean } = {}
): void {
  const [language, ...fallbacks] = asLanguages(languages);
  const easter = calculateEaster(year);

  const massOf = (proper: ProperReference | undefined, date: Date) => {
    if (proper === undefined) return undefined;
    const rubrics =
      proper.variant === undefined ? undefined : new Set([...DEFAULT_RUBRICS, proper.variant]);
    const mass = loadMassPropersByTitle(
      proper.title,
      language,
      rubrics,
      { date: proper.season ?? date, easter },
      proper.local,
      fallbacks
    );
    return mass && withPreface(mass, proper.prefatio);
  };

  eachDay(year, ({ date, month, day }) => {
    const entry = calendar[month]?.[day];
    if (entry === undefined) return;
    const { proper } = entry;

    entry.mass = massOf(proper, date);
    if (officium && proper !== undefined && !proper.borrowed) {
      entry.officium = loadOfficiumByTitle(
        proper.title,
        language,
        undefined,
        proper.local,
        fallbacks
      );
    }
    entry.commemorations.forEach((commemoration) => {
      commemoration.mass = massOf(commemoration.proper, date);
    });
  });
}

/**
 * The Mass with the Preface the day says in its place. Copied rather than set
 * in place, since a Mass may be shared.
 */
function withPreface(
  mass: RawMassProper,
  prefatio: ProperReference["prefatio"]
): RawMassProper {
  if (prefatio === undefined) return mass;
  if (!prefatio.always && mass.prefatio === undefined) return mass;
  return { ...mass, prefatio: prefatio.name };
}
