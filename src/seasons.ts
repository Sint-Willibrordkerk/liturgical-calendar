/**
 * The seasons of the year, and the color each day wears.
 *
 * The 1960 rubrics divide the year into seasons (rubricae generales nn. 71–78)
 * and assign the vestments their color (nn. 117–134). Most days wear the color
 * of their season; a feast wears its own, which the calendar data names where
 * it is not white.
 */
import type { Color, Season } from "./types";

const DAY = 86_400_000;

/** Septuagesima Sunday, the ninth Sunday before Easter. */
const SEPTUAGESIMA = -63;
/** Ash Wednesday, the start of Lent. */
const ASH_WEDNESDAY = -46;
/** The First Sunday of the Passion, a fortnight before Easter. */
const PASSION_SUNDAY = -14;
/** The Ascension, forty days after Easter. */
const ASCENSION = 39;
/** Pentecost, fifty days after Easter; its octave runs through the Saturday. */
const PENTECOST = 49;
/** Gaudete Sunday, the third of Advent. */
const GAUDETE = 14;
/** Laetare Sunday, the fourth of Lent. */
const LAETARE = -21;

/**
 * A day of the year as a number of days, by the local date it shows. The days
 * of the year are built as local dates.
 */
function ofDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * A reckoned date — Easter, Advent — as a number of days, by the UTC date it
 * was built on. Those are reckoned in UTC, and reading them locally would move
 * them across midnight in a timezone west of Greenwich.
 */
function ofReckoned(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
}

/** Whole days from the reckoned date `from` to `date`; negative before it. */
function daysFrom(date: Date, from: Date): number {
  return Math.round((ofDay(date) - ofReckoned(from)) / DAY);
}

/**
 * The season `date` falls in.
 *
 * - **adventus** — the First Sunday of Advent to the Vigil of the Nativity.
 * - **nativitatis** — Christmas Day to the fifth of January.
 * - **epiphaniae** — the Epiphany to the thirteenth of January.
 * - **per-annum** — the fourteenth of January to the Saturday before
 *   Septuagesima, and Trinity Sunday to the Saturday before Advent.
 * - **septuagesimae** — Septuagesima Sunday to Shrove Tuesday.
 * - **quadragesimae** — Ash Wednesday to the Saturday before Passion Sunday.
 * - **passionis** — Passion Sunday to Holy Saturday, Holy Week included.
 * - **paschatis** — Easter Sunday to the Vigil of the Ascension.
 * - **ascensionis** — the Ascension to the Vigil of Pentecost.
 * - **pentecostes** — Pentecost and its octave, through the Saturday.
 *
 * The rubrics divide the day itself — a season ends at None and the next
 * begins at First Vespers — but a calendar deals in whole days, and each day is
 * given to the season its Mass belongs to. The one departure is the Vigil of
 * Pentecost, whose Mass opens the octave while its office closes Ascensiontide:
 * it is kept in Ascensiontide, and its own entry in the calendar says red.
 */
export function seasonOf(date: Date, easter: Date, advent: Date): Season {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if ((month === 12 && day >= 25) || (month === 1 && day <= 5)) {
    return "nativitatis";
  }
  if (month === 1 && day <= 13) return "epiphaniae";
  if (daysFrom(date, advent) >= 0) return "adventus";

  const fromEaster = daysFrom(date, easter);
  if (fromEaster < SEPTUAGESIMA) return "per-annum";
  if (fromEaster < ASH_WEDNESDAY) return "septuagesimae";
  if (fromEaster < PASSION_SUNDAY) return "quadragesimae";
  if (fromEaster < 0) return "passionis";
  if (fromEaster < ASCENSION) return "paschatis";
  if (fromEaster < PENTECOST) return "ascensionis";
  if (fromEaster < PENTECOST + 7) return "pentecostes";
  return "per-annum";
}

/** The color the Masses of the season wear (nn. 123–126). */
export const SEASON_COLORS: Readonly<Record<Season, Color>> = {
  adventus: "violet",
  nativitatis: "white",
  epiphaniae: "white",
  "per-annum": "green",
  septuagesimae: "violet",
  quadragesimae: "violet",
  passionis: "violet",
  paschatis: "white",
  ascensionis: "white",
  pentecostes: "red",
};

/** The seasons from Easter to the end of the octave of Pentecost (n. 77). */
const PASCHALTIDE: ReadonlySet<Season> = new Set([
  "paschatis",
  "ascensionis",
  "pentecostes",
]);

/**
 * The color a day wears when its calendar entry names none.
 *
 * A feast is white (n. 123): the martyrs, the apostles and the feasts of the
 * Passion that are red say so in the calendar. A vigil is violet, unless it
 * falls in paschaltide (n. 126 b). Anything else — a Sunday, a feria, a day of
 * an octave — wears the color of its season.
 */
export function defaultColor(type: string | undefined, season: Season): Color {
  if (type === "festum") return "white";
  if (type === "vigilia" && !PASCHALTIDE.has(season)) return "violet";
  return SEASON_COLORS[season];
}

/**
 * True on Gaudete and Laetare Sunday, when rose may be worn in place of violet
 * (n. 127). Only the Sunday itself: the ferias that repeat its Mass keep violet.
 */
export function mayWearRose(date: Date, easter: Date, advent: Date): boolean {
  return (
    daysFrom(date, advent) === GAUDETE || daysFrom(date, easter) === LAETARE
  );
}
