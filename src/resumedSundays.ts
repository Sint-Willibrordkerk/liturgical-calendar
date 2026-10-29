/**
 * The Sundays that outlast the count after Pentecost.
 *
 * Twenty-three Sundays after Pentecost have Masses of their own, and the last
 * Sunday before Advent always says the Mass of the twenty-fourth and last. A
 * year long enough to need more than that fills the gap from the other end of
 * the year: the Sundays after the Epiphany that Septuagesima cut short are
 * resumed here, in their own order, and the earliest of them are the ones left
 * out when there is not room for all.
 */
import type { Calendar, LiturgicalDay } from "./types";
import { calculateAdvent, calculateEaster, dayNumber, eachDay } from "./utils";

const SUNDAY = 0;

/** Sundays after Pentecost that say a Mass of their own number. */
export const NUMBERED_SUNDAYS = 23;

/** The Sundays after the Epiphany the missal carries. */
const EPIPHANY_SUNDAYS = 6;

/** The last Sunday before Advent, whatever its number. */
export const LAST_SUNDAY_MASS = "dominica-xxiv-et-ultima-post-pentecosten";

const ROMAN = ["", "i", "ii", "iii", "iv", "v", "vi"];

/** The Mass of the nth Sunday after the Epiphany, resumed after Pentecost. */
export function resumedSundayMass(n: number): string {
  return `dominica-${ROMAN[n]}-quae-superfuit-post-epiphaniam`;
}

/**
 * The Mass each Sunday after Pentecost says, given how many there are and how
 * many Sundays after the Epiphany were kept before Septuagesima.
 *
 * The list runs from the first Sunday after Pentecost to the last before
 * Advent. A Sunday within the count keeps its own Mass — `undefined`, since
 * nothing needs changing — and the rest are named here.
 */
export function sundayMasses(
  total: number,
  epiphanySundaysKept: number
): (string | undefined)[] {
  const masses: (string | undefined)[] = Array(total).fill(undefined);
  if (total === 0) return masses;
  masses[total - 1] = LAST_SUNDAY_MASS;

  // The Sundays between the numbered ones and the last are the resumed ones.
  const room = Math.max(0, total - 1 - NUMBERED_SUNDAYS);
  const omitted: number[] = [];
  for (let n = epiphanySundaysKept + 1; n <= EPIPHANY_SUNDAYS; n++) {
    omitted.push(n);
  }
  // More omitted than there is room for: the earliest give way.
  const resumed = omitted.slice(Math.max(0, omitted.length - room));
  resumed.forEach((n, i) => {
    masses[NUMBERED_SUNDAYS + i] = resumedSundayMass(n);
  });
  return masses;
}

/**
 * Give the Sundays after Pentecost that outrun the count the Mass they say.
 *
 * A Sunday kept as a feast — Christ the King, say — celebrates the feast, and
 * the Sunday gives way to a commemoration of itself. It is that commemoration
 * that takes the Mass named here: it is the Sunday as such, whose Mass the
 * ferias of its week say.
 *
 * Which Sundays were kept after the Epiphany decides which are left to resume,
 * and those are read in the season they were left in, before Septuagesima.
 * Only the Mass changes: the Sunday is still the twenty-fifth after Pentecost,
 * say, and keeps that name.
 */
export function applyResumedSundays(calendar: Calendar, year: number): void {
  const easter = calculateEaster(year);
  const septuagesima = new Date(easter);
  septuagesima.setDate(septuagesima.getDate() - 63);
  const epiphanySundaysKept = countSundays(new Date(year, 0, 6), septuagesima);

  const firstSunday = new Date(easter);
  firstSunday.setDate(firstSunday.getDate() + 56);
  // Compared as calendar days rather than instants: the two dates are not
  // built in the same way, and an hour of offset between them would take in a
  // Sunday of Advent and shift every Mass along by one.
  const from = dayNumber(firstSunday);
  const until = dayNumber(calculateAdvent(year));

  const sundays: LiturgicalDay[] = [];
  eachDay(year, ({ date, month, day }) => {
    if (date.getDay() !== SUNDAY) return;
    const on = dayNumber(date);
    if (on < from || on >= until) return;
    const entry = calendar[month]?.[day];
    if (entry !== undefined) sundays.push(entry);
  });

  sundayMasses(sundays.length, epiphanySundaysKept).forEach((mass, i) => {
    // The count runs over every Sunday, but a Sunday kept as a feast — Christ
    // the King, say — celebrates the feast; the Sunday it commemorates takes
    // the Mass named here instead.
    const entry = sundays[i]!;
    const sunday =
      entry.type === "dominica"
        ? entry
        : entry.commemorations?.find(
            (commemoration) => commemoration.type === "dominica"
          );
    if (mass === undefined || sunday === undefined) return;
    sunday.proper = { id: mass, season: septuagesima };
  });
}

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
