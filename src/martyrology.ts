/**
 * The Roman Martyrology, as read at Prime.
 *
 * The Martyrology of a date is read on the day before it: at Prime on the 20th
 * of January the reader announces the 21st — "Duodécimo Kaléndas Februárii.
 * Luna secúnda." — and the saints whose day it is. A day here carries the
 * reading printed under its own date, so the 21st carries the 21st's; whoever
 * reads it does so the day before.
 *
 * The text comes from the language's published Martyrology. What the text
 * cannot say is reckoned here: the age of the moon, from the Martyrology's own
 * tables; which movable day is announced, from the date of Easter and Advent;
 * and which date's text is read at all in a leap year.
 */
import type { Calendar, Fallback, Martyrologium } from "./types";
import { calculateAdvent, calculateEaster, eachDay } from "./utils";

/** A date of the Martyrology as published: its date line and its entries. */
export type MartyrologyDay = { titulus?: string; elogia?: string[] };

/** A language's published Martyrology. */
export type Martyrology = {
  /** Keyed by the date it is printed under, `MM-DD`, the leap day `02-29`. */
  days: Record<string, MartyrologyDay>;
  /** The movable days' announcements, keyed as {@link movableDayOf} names them. */
  mobile: Record<string, string[]>;
  conclusio?: { versus: string; responsum: string };
};

const DAY = 86400000;

/** A date as a count of days, free of the hour and the time zone. */
function ordinal(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / DAY);
}

/** A UTC date, such as Easter or Advent, as a count of days. */
function ordinalOf(date: Date): number {
  return ordinal(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The date whose text is read on a day, `MM-DD`.
 *
 * In a leap year the extra day is the 24th of February, the sixth day before
 * the Kalends of March said twice: it reads the text the sources keep as
 * `02-29`, and each later day of February reads the text of the day before it.
 */
export function martyrologyDateOf(year: number, month: number, day: number): string {
  if (isLeapYear(year) && month === 2) {
    if (day === 24) return "02-29";
    if (day > 24) return `02-${pad(day - 1)}`;
  }
  return `${pad(month)}-${pad(day)}`;
}

/**
 * The Martyrology's letters, in the order its lunar table runs; `R` is the
 * black `F` of the tables.
 */
const LETTERS = "abcdefghiklmnpqrstuABCDERFGHMNP";

/**
 * The letter of each golden number, for the stretch of years it holds for. The
 * epacts shift with the solar and lunar equations, so the letters do too.
 */
const LETTERS_OF_GOLDEN_NUMBERS: [until: number, letters: string][] = [
  [1700, "amDdqGgtNkBbnEerHhu"],
  [1900, "PlCcpFfsMiAamDdqGgt"],
  [2200, "NkBbnEerHhuPlCcpRfs"],
  [2300, "MiAamDdqGgtNkBbnEer"],
];

/** The moon's age in the Martyrology's table, for a day of a common year. */
function lunaTable(yday: number, letter: string): number {
  const position = LETTERS.indexOf(letter) + 1;
  const length = yday < 36 ? 30 : ((yday - 35) % 59 || 59) < 29 ? 29 : 30;
  let i = yday % 59 < 36 ? position : position - 1;
  if (yday % 59 < 36) {
    if (position > 25) i -= 1;
    if (position === 25 && yday % 59 === 35) i += 1;
  } else if (position > 25) {
    i -= 2;
  }
  if (yday > 58) {
    if (position > 25 && yday % 59 < 5) i -= 1;
    if (position === 26 && yday % 59 === 5) i -= 1;
  }
  return ((i - 1 + (yday % 59)) % length) + 1;
}

/**
 * The age of the moon announced for a day, 1 to 30, as the Martyrology's
 * tables reckon it; undefined outside 1582–2299, the years they cover.
 *
 * The table is of a common year, and is read at the date whose text is read:
 * so in a leap year the 24th and 25th of February, both the sixth day before
 * the Kalends, have the same moon, "et eadem Luna", as the Martyrology directs.
 */
export function lunaOf(year: number, month: number, day: number): number | undefined {
  if (year < 1582) return undefined;
  const letters = LETTERS_OF_GOLDEN_NUMBERS.find(([until]) => year < until)?.[1];
  if (letters === undefined) return undefined;

  const goldenNumber = (year % 19) + 1;
  const letter = letters[goldenNumber - 1]!;
  const [m, d] = martyrologyDateOf(year, month, day)
    .replace("02-29", "02-24")
    .split("-")
    .map(Number) as [number, number];
  const yday = ordinal(2001, m, d) - ordinal(2001, 1, 1) + 1;

  let luna = lunaTable(yday, letter);
  if (
    goldenNumber === 1 &&
    m === 1 &&
    letter !== "P" &&
    d + lunaTable(1, letter) < 32
  ) {
    luna -= 1;
  }
  return luna;
}

/**
 * The movable day a date is, as the sources key its announcement: the week of
 * the year it falls in and its weekday (`adv1-0`, `quadp3-3`, `pasc0-1`,
 * `pent02-5`), `10-du` for Christ the King, or `nat1-0` and `nat2-0` for the
 * Holy Name and the Holy Family. Most days so named have no announcement; the
 * Martyrology decides which do. Undefined where the weeks are not counted: in
 * Christmastide, and between the Epiphany and Septuagesima.
 */
export function movableDayOf(year: number, month: number, day: number): string | undefined {
  const t = ordinal(year, month, day);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  // The Sundays of January the calendar keeps feasts on.
  if (month === 1 && weekday === 0) {
    if (day >= 2 && day <= 5) return "nat1-0";
    if (day >= 7 && day <= 13) return "nat2-0";
  }
  // The Holy Name falls on the 2nd where no Sunday comes between the 2nd and the 5th.
  if (month === 1 && day === 2) {
    const sundayIn2To5 = [2, 3, 4, 5].some(
      (d) => new Date(Date.UTC(year, 0, d)).getUTCDay() === 0
    );
    if (!sundayIn2To5) return "nat1-0";
  }
  // Christ the King, the last Sunday of October.
  if (month === 10 && weekday === 0 && day >= 25) return "10-du";

  const advent = ordinalOf(calculateAdvent(year));
  const christmas = ordinal(year, 12, 25);
  if (t >= advent) {
    return t < christmas ? `adv${1 + Math.floor((t - advent) / 7)}-${weekday}` : undefined;
  }

  const easter = ordinalOf(calculateEaster(year));
  if (t < easter - 63) return undefined;
  if (t < easter - 42) return `quadp${1 + Math.floor((t - (easter - 63)) / 7)}-${weekday}`;
  if (t < easter) return `quad${1 + Math.floor((t - (easter - 42)) / 7)}-${weekday}`;
  if (t < easter + 56) return `pasc${Math.floor((t - easter) / 7)}-${weekday}`;
  const week = Math.floor((t - (easter + 49)) / 7);
  return week < 23 ? `pent${pad(week)}-${weekday}` : undefined;
}

/** A language's Martyrology, with the language's code and its names for the moon. */
export type MartyrologySource = {
  code: string;
  martyrology: Martyrology;
  translations: Record<string, string>;
};

/**
 * Give each day of the year the Martyrology printed under its date. A day whose
 * date none of the languages' Martyrologies carries is left without one.
 *
 * `sources` are the languages in order, the language asked for first. A date is
 * read from the first that prints it, whole, so a reading stays in one language;
 * what that language lacks of it — the name of the moon, the announcement of a
 * movable day, the conclusion — is taken from the next that has it. Whatever is
 * said in a language other than `asked` is named in the reading's `fallback`.
 */
export function applyMartyrology(
  calendar: Calendar,
  year: number,
  sources: readonly MartyrologySource[],
  asked: string
): void {
  eachDay(year, ({ month, day }) => {
    const liturgicalDay = calendar[month]?.[day];
    const date = martyrologyDateOf(year, month, day);
    const printedIn = sources.find(({ martyrology }) => martyrology.days[date]?.titulus !== undefined);
    if (liturgicalDay === undefined || printedIn === undefined) return;
    const printed = printedIn.martyrology.days[date]!;

    // The language the date is printed in first, then the others as given.
    const order = [printedIn, ...sources.filter((source) => source !== printedIn)];
    const fallback: Fallback = {};
    const said = <T>(field: string, find: (source: MartyrologySource) => T | undefined): T | undefined => {
      for (const source of order) {
        const found = find(source);
        if (found === undefined) continue;
        if (source.code !== asked) fallback[field] = source.code;
        return found;
      }
      return undefined;
    };

    const reading: Martyrologium = { titulus: printed.titulus!, elogia: printed.elogia ?? [] };
    if (printedIn.code !== asked) {
      fallback.titulus = printedIn.code;
      if (reading.elogia.length > 0) fallback.elogia = printedIn.code;
    }

    const luna = lunaOf(year, month, day);
    if (luna !== undefined) {
      reading.luna = luna;
      const lunaName = said("lunaName", ({ translations }) => translations[`luna-${luna}`]);
      if (lunaName !== undefined) reading.lunaName = lunaName;
    }
    const movable = movableDayOf(year, month, day);
    const mobile =
      movable === undefined
        ? undefined
        : said("mobile", ({ martyrology }) => martyrology.mobile[movable]);
    if (mobile !== undefined) reading.mobile = mobile;
    const conclusio = said("conclusio", ({ martyrology }) => martyrology.conclusio);
    if (conclusio !== undefined) reading.conclusio = conclusio;
    if (Object.keys(fallback).length > 0) reading.fallback = fallback;

    liturgicalDay.martyrologium = reading;
  });
}
