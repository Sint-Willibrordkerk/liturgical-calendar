/**
 * The Mass a feria borrows.
 *
 * A fourth-class feria has no Mass of its own. The rubrics say which it takes:
 * in the days after the Circumcision and after the Epiphany it repeats those
 * feasts, and the rest of the year it keeps the Sunday just past — the Sunday
 * as such, even where a feast was kept on it in its place.
 */
import type { Calendar, Commemoration, LiturgicalDay, ProperReference } from "./types";
import { calculateEaster, dayNumber, eachDay } from "./utils";

/**
 * The Mass of the First Sunday after the Epiphany, *In excelso throno*, said on
 * the ferias that follow that Sunday.
 *
 * The Sunday itself is kept as the Holy Family, so its own file gives that Mass
 * instead; the Sunday-as-such Mass is the one the ferias of its week carry, and
 * every day of that week carries the same one.
 */
export const SUNDAY_AFTER_EPIPHANY_MASS =
  "Feria II infra Hebdomadam I post Epiphaniam";

/**
 * The Mass of the First Sunday after Pentecost, *Domine, in tua misericordia*,
 * said on the ferias that follow that Sunday.
 *
 * The Sunday itself is kept as the Holy Trinity, and its file gives the Trinity
 * texts unless asked for the Sunday's own: they are filed as its variant
 * {@link SUNDAY_AFTER_PENTECOST_VARIANT}.
 */
export const SUNDAY_AFTER_PENTECOST_MASS = "Dominica I post Pentecosten";

/** The variant of that Sunday's file that holds the Sunday's own texts. */
export const SUNDAY_AFTER_PENTECOST_VARIANT = "special-a";

/** The Preface of the Epiphany, which those ferias say. */
const EPIPHANY_PREFACE = "epi";

/** The common Preface, which a feria says in place of its Sunday's own. */
const COMMON_PREFACE = "communis";

const FERIA = "feria";
const SUNDAY_TYPE = "dominica";
const SUNDAY = 0;

/**
 * A day that must borrow: a feria with neither a Mass nor a title of its own.
 *
 * A title names the day's own celebration — Our Lady on Saturday, say — and that
 * celebration has a Mass whether or not this build managed to find its file. So
 * a titled day never borrows; where its propers are missing it stays without a
 * Mass rather than saying the wrong one.
 *
 * The class is not asked about. Most ferias that lack a Mass are of the fourth
 * class, but the ferias of Advent are of the second and third and lack one just
 * the same — Lent, whose ferias are also privileged, gives each of them a Mass
 * of its own and so never reaches here.
 */
export function borrowsItsMass(day: LiturgicalDay | undefined): boolean {
  return (
    day != null &&
    day.type === FERIA &&
    day.proper === undefined &&
    day.title === undefined
  );
}

/**
 * The First Sunday after the Epiphany — the first Sunday falling strictly after
 * the sixth of January, which is the Epiphany itself.
 */
export function firstSundayAfterEpiphany(year: number): Date {
  const epiphany = new Date(year, 0, 6);
  const untilSunday = 7 - epiphany.getDay() || 7;
  return new Date(year, 0, 6 + untilSunday);
}

/**
 * Give every fourth-class feria the Mass it says:
 *
 * - **2 to 5 January** — the Mass of the first of January.
 * - **7 to 12 January**, falling before the First Sunday after the Epiphany —
 *   the Mass of the Epiphany; falling after it, the Mass of that Sunday,
 *   *In excelso throno*, with the Preface of the Epiphany.
 * - **otherwise** — the Mass of the Sunday just past, with the common Preface
 *   where that Sunday names a Preface of its own.
 *
 * The Sunday's Mass is the Sunday's own, not that of a feast kept on it. Where
 * a feast took the Sunday — the Holy Trinity, Christ the King, All Saints — the
 * Sunday gave way and is carried as a commemoration, and the ferias of its week
 * say the Mass of that Sunday: Dominica XXII post Pentecosten in the week of
 * Christ the King in 2026, not the Mass of Christ the King. The First Sunday
 * after Pentecost is filed with the Trinity, and the First Sunday after the
 * Epiphany with the Holy Family, so their Masses are read from where the
 * Sunday-as-such is filed. A feast on a Sunday that commemorates no Sunday —
 * Easter, Pentecost — is the Sunday's Mass itself.
 *
 * The Preface a Sunday names is the Sunday's alone. The Sundays after the
 * Epiphany and after Pentecost, and those from Septuagesima to Lent, name the
 * Preface of the Holy Trinity, and the ferias of their weeks say the common
 * Preface instead. A Sunday that names none says the Preface of its season —
 * of Advent, of Easter, of the Ascension — and its ferias, being of the same
 * season, say the same and name none either.
 *
 * What a feria borrows is where the Mass is filed, read in the season of the
 * day it is borrowed from, so it is the same in every language. A feria that
 * already has a Mass, and any day of a higher class, is left as it is. Where
 * the day it would borrow from has no Mass either, it keeps none.
 */
export function applyFerialMass(calendar: Calendar, year: number): void {
  const epiphanySunday = firstSundayAfterEpiphany(year);
  const trinity = calculateEaster(year);
  trinity.setDate(trinity.getDate() + 56);
  const afterTrinity = new Date(trinity);
  afterTrinity.setDate(afterTrinity.getDate() + 1);
  const ownOn = (month: number, day: number) =>
    borrowedFrom(calendar[month]?.[day], new Date(year, month - 1, day));

  // Those ferias say the Preface of the Epiphany, whatever the Mass itself
  // names.
  const afterEpiphanySunday: ProperReference = {
    title: SUNDAY_AFTER_EPIPHANY_MASS,
    season: new Date(year, 0, 12),
    prefatio: { name: EPIPHANY_PREFACE, always: true },
    borrowed: true,
  };
  const afterPentecostSunday: ProperReference = {
    title: SUNDAY_AFTER_PENTECOST_MASS,
    variant: SUNDAY_AFTER_PENTECOST_VARIANT,
    season: afterTrinity,
    borrowed: true,
  };

  let precedingSunday: ProperReference | undefined;

  eachDay(year, ({ date, month, day }) => {
    const entry = calendar[month]?.[day];
    if (entry === undefined) return;

    if (borrowsItsMass(entry)) {
      const inEpiphanyDays = month === 1 && day >= 7 && day <= 12;
      const borrowed =
        month === 1 && day >= 2 && day <= 5
          ? ownOn(1, 1)
          : inEpiphanyDays && date < epiphanySunday
            ? ownOn(1, 6)
            : inEpiphanyDays
              ? afterEpiphanySunday
              : precedingSunday;
      if (borrowed !== undefined) entry.proper = borrowed;
    }

    // Recorded after the day is settled, so a Sunday never takes its own Mass
    // from the week before it.
    if (date.getDay() === SUNDAY) {
      const sunday =
        dayNumber(date) === dayNumber(trinity)
          ? afterPentecostSunday
          : borrowedFrom(sundayAsSuch(entry), date);
      if (sunday !== undefined) precedingSunday = asSaidOnItsFerias(sunday);
    }
  });
}

/**
 * Where the Mass of a day on `date` is filed, as another day borrows it: in
 * that day's season, and without its Office.
 */
function borrowedFrom(
  entry: Commemoration | undefined,
  date: Date
): ProperReference | undefined {
  const proper = entry?.proper;
  if (proper === undefined) return undefined;
  return { ...proper, season: proper.season ?? date, borrowed: true };
}

/**
 * A Sunday's Mass as its ferias say it: with the common Preface where the
 * Sunday names one of its own.
 */
function asSaidOnItsFerias(sunday: ProperReference): ProperReference {
  return { ...sunday, prefatio: { name: COMMON_PREFACE, always: false } };
}

/**
 * The Sunday as such: the day itself, or, where a feast was kept on it, the
 * Sunday it commemorates. A feast that commemorates no Sunday stands for the
 * Sunday itself.
 */
function sundayAsSuch(entry: LiturgicalDay): Commemoration {
  if (entry.type === SUNDAY_TYPE) return entry;
  const commemorated = entry.commemorations?.find(
    (commemoration) => commemoration.type === SUNDAY_TYPE
  );
  return commemorated ?? entry;
}
