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
import { dayNumber, eachDay } from "./utils";

const SUNDAY = 0;

/** Sundays after Pentecost that say a Mass of their own number. */
export const NUMBERED_SUNDAYS = 23;

/** The Sundays after the Epiphany the missal carries. */
const EPIPHANY_SUNDAYS = 6;

/** The last Sunday before Advent, whatever its number. */
export const LAST_SUNDAY_MASS = "Dominica XXIV et ultima post Pentecosten";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];

/** The Mass of the nth Sunday after the Epiphany, resumed after Pentecost. */
export function resumedSundayMass(n: number): string {
  return `Dominica ${ROMAN[n]} quæ superfuit post Epiphaniam`;
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
 * `massFor` reads a Mass by title, so this stays a question of which Mass a day
 * says rather than of how one is loaded.
 */
export function applyResumedSundays(
  calendar: Calendar,
  year: number,
  easter: Date,
  advent: Date,
  epiphanySundaysKept: number,
  massFor: (title: string) => LiturgicalDay["mass"]
): void {
  const firstSunday = new Date(easter);
  firstSunday.setDate(firstSunday.getDate() + 56);
  // Compared as calendar days rather than instants: the two dates are not
  // built in the same way, and an hour of offset between them would take in a
  // Sunday of Advent and shift every Mass along by one.
  const from = dayNumber(firstSunday);
  const until = dayNumber(advent);

  const sundays: LiturgicalDay[] = [];
  eachDay(year, ({ date, month, day }) => {
    if (date.getDay() !== SUNDAY) return;
    const on = dayNumber(date);
    if (on < from || on >= until) return;
    const entry = calendar[month]?.[day];
    if (entry !== undefined) sundays.push(entry);
  });

  sundayMasses(sundays.length, epiphanySundaysKept).forEach((title, i) => {
    const entry = sundays[i]!;
    // The count runs over every Sunday, but a Sunday kept as a feast — Christ
    // the King, say — celebrates the feast; only a Sunday still observed as one
    // takes the Mass named here.
    if (title === undefined || entry.type !== "dominica") return;
    const mass = massFor(title);
    if (mass !== undefined) {
      entry.title = title;
      entry.mass = mass;
    }
  });
}
