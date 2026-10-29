/**
 * The days as a language names them.
 *
 * The calendar gives each day an id, once, for every language: a slug such as
 * `dominica-$count-adventus`, its count and weekday filled in by date. What the
 * day is called is the language's to say, and is said once the days are
 * settled and their Masses read, since a day the language has no name for is
 * called by the Latin title of its Mass.
 */
import type { Calendar, Commemoration, LiturgicalDay, RawMassProper } from "./types";
import { ordinals, days, feriae } from "./ordinals";
import { eachDay } from "./utils";

type Translations = Record<string, string>;

/** A slug, or a slug with `$count`/`$day`/`$feria` still to be filled in. */
const IS_SLUG_TEMPLATE = /^[a-z0-9$]+(?:-[a-z0-9$]+)*$/;

/** A value spliced into a slug, kept lowercase and hyphenated so it stays one. */
function slugPart(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

/** The Latin words a template is filled with on `date`, as the `count`th of its days. */
function latinWords(count: number, date: Date) {
  return {
    count: ordinals[count as keyof typeof ordinals] || "",
    day: days[(date.getDay() + 1) as keyof typeof days] || "",
    feria: feriae[(date.getDay() + 1) as keyof typeof feriae] || "",
  };
}

/** A slug template filled in: `dominica-$count-adventus` becomes `dominica-i-adventus`. */
function fillSlug(template: string, count: number, date: Date): string {
  const words = latinWords(count, date);
  return template
    .replace("$count", slugPart(words.count))
    .replace("$day", slugPart(words.day))
    .replace("$feria", slugPart(words.feria));
}

/**
 * The id of the `count`th day of `template` on `date`: the template with its
 * count and weekday filled in, still a slug. `$day` gives the Roman numeral of
 * the weekday, `$feria` spells its ordinal out, as the propers are filed.
 */
export function idOf(template: string, count: number, date: Date): string {
  return fillSlug(template, count, date);
}

/**
 * What the language calls the `count`th day of `template` on `date`, or
 * nothing where it has no name for it.
 *
 * The language names the day itself — `dominica-i-adventus` — or names the
 * template, which is then filled in with its own numerals and weekdays:
 * `$count zondag na Pinksteren`. `$feria` exists only to file the propers, so
 * it is never shown: the day is called by its weekday like any other.
 */
export function nameDay(
  template: string,
  count: number,
  date: Date,
  translations: Translations = {}
): string | undefined {
  const own = translations[template];
  if (own === undefined) return translations[fillSlug(template, count, date)];
  // A template the language maps to another id is named as that day is.
  if (IS_SLUG_TEMPLATE.test(own)) return translations[fillSlug(own, count, date)];

  const words = latinWords(count, date);
  const ordinal = translations[words.count] || words.count;
  const day = translations[words.day] || words.day;
  const filled = own.replace("$count", ordinal).replace("$day", day).replace("$feria", day);
  return translations[filled] || filled;
}

/**
 * Name a day or commemoration in the language: as the language calls it, or,
 * where it has no name for the day, by the Latin title of the Mass said, so
 * the reader sees `Festum Sanctissimæ Trinitatis` rather than an id. A day with
 * neither has no title: its id still says which day it is.
 */
function name(entry: Commemoration, date: Date, translations: Translations): void {
  if (entry.naming === undefined) return;
  const named = nameDay(entry.naming.template, entry.naming.count, date, translations);
  const title = named ?? (entry.mass as RawMassProper | undefined)?.title;
  if (title !== undefined) entry.title = title;
}

/**
 * Name every day of `year` and its commemorations in the language, and its
 * season and colors beside their identifiers, where the language names them.
 */
export function nameDays(calendar: Calendar, year: number, translations: Translations): void {
  const nameOf = (key: string | undefined): string | undefined =>
    key === undefined ? undefined : translations[key];

  eachDay(year, ({ date, month, day }) => {
    const entry: LiturgicalDay | undefined = calendar[month]?.[day];
    if (entry === undefined) return;
    name(entry, date, translations);
    entry.commemorations.forEach((commemoration) => name(commemoration, date, translations));

    const seasonName = nameOf(entry.season);
    const colorName = nameOf(entry.color);
    const alternativeColorName = nameOf(entry.alternativeColor);
    if (seasonName !== undefined) entry.seasonName = seasonName;
    if (colorName !== undefined) entry.colorName = colorName;
    if (alternativeColorName !== undefined) entry.alternativeColorName = alternativeColorName;
  });
}
