/**
 * The Mass a feria borrows.
 *
 * A fourth-class feria has no Mass of its own. The rubrics say which it takes:
 * in the days after the Circumcision and after the Epiphany it repeats those
 * feasts, and the rest of the year it keeps the Sunday just past.
 */
import type { Calendar, LiturgicalDay } from "./types";
import { eachDay } from "./utils";

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

/** The Preface of the Epiphany, which those ferias say. */
const EPIPHANY_PREFACE = "epi";

const FERIA = "feria";
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
    day.mass === undefined &&
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
 * - **otherwise** — the Mass of the Sunday just past.
 *
 * A feria that already has a Mass, and any day of a higher class, is left as it
 * is. Where the day it would borrow from has no Mass either, it keeps none.
 */
export function applyFerialMass(
  calendar: Calendar,
  year: number,
  sundayAfterEpiphany?: LiturgicalDay["mass"]
): void {
  const epiphanySunday = firstSundayAfterEpiphany(year);
  const massOn = (month: number, day: number) => calendar[month]?.[day]?.mass;

  // Those ferias say the Preface of the Epiphany, whatever the Mass itself
  // carries. Copied rather than set in place, since the Mass is shared with the
  // days that own it.
  const afterEpiphanySunday =
    sundayAfterEpiphany === undefined
      ? undefined
      : ({
          ...sundayAfterEpiphany,
          prefatio: EPIPHANY_PREFACE,
        } as LiturgicalDay["mass"]);

  let precedingSunday: LiturgicalDay["mass"];

  eachDay(year, ({ date, month, day }) => {
    const entry = calendar[month]?.[day];
    if (entry === undefined) return;

    if (borrowsItsMass(entry)) {
      const inEpiphanyDays = month === 1 && day >= 7 && day <= 12;
      const borrowed =
        month === 1 && day >= 2 && day <= 5
          ? massOn(1, 1)
          : inEpiphanyDays && date < epiphanySunday
            ? massOn(1, 6)
            : inEpiphanyDays
              ? afterEpiphanySunday
              : precedingSunday;
      if (borrowed !== undefined) entry.mass = borrowed;
    }

    // Recorded after the day is settled, so a Sunday never takes its own Mass
    // from the week before it.
    if (date.getDay() === SUNDAY && entry.mass !== undefined) {
      precedingSunday = entry.mass;
    }
  });
}
