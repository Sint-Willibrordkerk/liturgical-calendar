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
 *
 * `dataVersion` names the days the stores are keyed to. The days hold keys and
 * the stores say what the keys mean, so a language is right for the days it was
 * generated with and for no others: the calendar refuses stores keyed to other
 * days than its own. A language without stores needs none.
 */
export type Language = {
  code: string;
  dataVersion?: string;
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
 * Why `languages` cannot be read against the days of version `dataVersion`,
 * each reason a line; nothing where they can.
 *
 * Only stores are keyed to the days, so a language without them is taken
 * whatever the days. Days that carry no version — a test's own — are read with
 * whatever stores they are given.
 */
export function languageProblems(
  languages: readonly Language[],
  dataVersion: string | undefined
): string[] {
  if (dataVersion === undefined) return [];
  return languages
    .filter(({ assets, dataVersion: theirs }) => assets?.masspropers !== undefined && theirs !== dataVersion)
    .map(({ code, dataVersion: theirs }) => {
      const keyedTo =
        theirs === undefined
          ? "say nothing of the days they are keyed to"
          : `are keyed to the days of version ${theirs}`;
      return (
        `The stores of the language "${code}" ${keyedTo}, and this calendar's days are of ` +
        `version ${dataVersion}: its texts would be missing or wrong. Install ` +
        `@sint-willibrordkerk/liturgical-calendar and ` +
        `@sint-willibrordkerk/liturgical-calendar-${code} at the same version.`
      );
    });
}
