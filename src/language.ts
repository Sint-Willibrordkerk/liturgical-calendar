/**
 * A language, and everything the calendar reads in it.
 *
 * The days of the Mass propers are the same in every language: they hold keys,
 * and are carried by this package. What the keys say runs to megabytes per
 * language, so it is not. Each language is published as its own —
 * `@sint-willibrordkerk/liturgical-calendar-la`, `…-nl` — carrying its stores,
 * its translations and its Martyrology, and handed to the generator by whoever
 * wants it, so a caller pays for the languages they ask for and no others.
 *
 * `assets` holds them by kind and then by name: the store the pipeline files
 * as `mass-propers/nl/oratio.yml` is `assets.masspropers.oratio`, the
 * translations filed as `translations/nl/sanctorum.yml` are
 * `assets.translations.sanctorum`, and the Martyrology's dates are
 * `assets.martyrologium["01-21"]`. `code` is the language they are in.
 */
export type Language = {
  code: string;
  assets: {
    masspropers?: Record<string, unknown>;
    translations?: Record<string, Record<string, string>>;
    martyrologium?: Record<string, unknown>;
  };
};

/**
 * A language carrying nothing — the calendar without propers or translations.
 *
 * Days still fall where they fall and are named as the calendar names them;
 * only what a language would supply is absent.
 */
export const NO_LANGUAGE: Language = { code: "la", assets: {} };

/**
 * The language argument, checked, as the list of languages it names.
 *
 * Until version 3 this was the language's code, and the assets of every
 * language were bundled into this package. Passing a code now would silently
 * produce a calendar with no Masses and no translations, so it is refused with
 * the reason rather than accepted.
 *
 * One language or several: the first is the language asked for, and the rest
 * are said in where it has no words for a text, in their order. Without a
 * language, or with an empty list, the calendar has none.
 */
export function asLanguages(
  language: Language[]
): [Language, ...Language[]] {
  const [first = NO_LANGUAGE, ...rest] = language;
  return [first, ...rest];
}
