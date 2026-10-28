/**
 * The days as a language names them.
 *
 * The calendar writes a day's title once, for every language: a slug to look
 * up, or a title with `$count` and `$day` still to fill. Which name it is shown
 * by is the language's to say, and is said once the days are settled and their
 * Masses read, since a slug the language has no name for takes its Mass's.
 */
import type { Calendar, Commemoration, LiturgicalDay, RawMassProper } from "./types";
import { ordinals, days, feriae } from "./ordinals";
import { eachDay } from "./utils";

type Translations = Record<string, string>;

/** A filing slug — all lowercase, digits and hyphens — not a name to show. */
const IS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A slug, or a slug with `$count`/`$day`/`$feria` still to be filled in. */
const IS_SLUG_TEMPLATE = /^[a-z0-9$]+(?:-[a-z0-9$]+)*$/;

/** A value spliced into a slug, kept lowercase and hyphenated so it stays one. */
function slugPart(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function translate(str: string, translations?: Translations): string;
function translate(str: string | undefined, translations?: Translations): string | undefined;
function translate(str: string | undefined, translations?: Translations) {
  if (!str || !translations) return str;
  return translations[str] || str;
}

/**
 * The title the propers of the `count`th day of `template` on `date` are filed
 * under — always the Latin, whatever the language. `$feria` spells the
 * weekday's ordinal out, which is how the propers are filed; `$day` gives the
 * Roman numeral the calendar reads by.
 */
export function filedAs(template: string, count: number, date: Date): string {
  return template
    .replace("$count", ordinals[count as keyof typeof ordinals] || "")
    .replace("$day", days[(date.getDay() + 1) as keyof typeof days] || "")
    .replace("$feria", feriae[(date.getDay() + 1) as keyof typeof feriae] || "");
}

/**
 * The name of the `count`th day of `template` on `date`, in the language of
 * `translations`, or as the calendar writes it without them.
 *
 * A slug stays a slug — `$count` spliced in lowercase so
 * `dominica-$count-adventus` becomes `dominica-i-adventus`, still a lookup
 * key; a translated or written title takes the ordinary weekday name and
 * numeral. `$feria` exists only to file the propers, so it is never shown: the
 * day is called by its weekday like any other.
 */
export function nameDay(
  template: string,
  count: number,
  date: Date,
  translations?: Translations
): string {
  const latinOrdinal = ordinals[count as keyof typeof ordinals] || "";
  const latinDay = days[(date.getDay() + 1) as keyof typeof days] || "";
  const latinFeria = feriae[(date.getDay() + 1) as keyof typeof feriae] || "";
  const ordinal = translate(ordinals[count as keyof typeof ordinals], translations);
  const day = translate(days[(date.getDay() + 1) as keyof typeof days], translations);

  const original = translate(template, translations);
  const intoSlug = IS_SLUG_TEMPLATE.test(original);
  return translate(
    original
      .replace("$count", intoSlug ? slugPart(latinOrdinal) : ordinal!)
      .replace("$day", intoSlug ? slugPart(latinDay) : day!)
      .replace("$feria", intoSlug ? slugPart(latinFeria) : day!),
    translations
  );
}

/**
 * Name a day or commemoration in the language.
 *
 * A slug is a lookup key, not a name. Where the day read a Mass, that Mass
 * carries the real Latin title (from its officium), so the reader sees
 * `Festum Sanctissimæ Trinitatis` rather than `festum-sanctissimae-trinitatis`.
 * A translated title has already become a name and is left alone; so is a day
 * with no Mass to draw on, such as Holy Saturday, and a written title like a
 * numbered Sunday the calendar spells out rather than files under a slug.
 */
function name(entry: Commemoration, date: Date, translations: Translations): void {
  if (entry.naming === undefined) return;
  const title = nameDay(entry.naming.template, entry.naming.count, date, translations);
  const mass = entry.mass as RawMassProper | undefined;
  entry.title = mass?.title && IS_SLUG.test(title) ? mass.title : title;
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
