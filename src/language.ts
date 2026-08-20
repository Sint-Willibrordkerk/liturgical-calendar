/**
 * A language, and everything the calendar reads in it.
 *
 * The propers of a day run to megabytes per language, so they are not carried
 * by this package. Each language is published as its own —
 * `@sint-willibrordkerk/liturgical-calendar-la`, `…-nl` — and handed to the
 * generator by whoever wants it, so a caller pays for the languages they ask
 * for and no others.
 *
 * `assets` is keyed by the path the asset is filed under, exactly as the
 * pipeline lays it out: `mass-propers/nl/Sancti/antonii-abbatis.yml`,
 * `translations/nl/sanctorum.yml`. `code` is the segment those paths use.
 */
export type Language = {
  code: string;
  assets: Record<string, unknown>;
};

/**
 * A language carrying nothing — the calendar without propers or translations.
 *
 * Days still fall where they fall and are named as the calendar names them;
 * only what a language would supply is absent.
 */
export const NO_LANGUAGE: Language = { code: "la", assets: {} };

/**
 * The language argument, checked.
 *
 * Until version 3 this was the language's code, and the assets of every
 * language were bundled into this package. Passing a code now would silently
 * produce a calendar with no Masses and no translations, so it is refused with
 * the reason rather than accepted.
 */
export function asLanguage(language: Language | string | undefined): Language {
  if (language === undefined) return NO_LANGUAGE;
  if (typeof language === "string") {
    throw new TypeError(
      `Expected a language package, not the code "${language}". ` +
        `Each language is published separately now: ` +
        `import ${language} from "@sint-willibrordkerk/liturgical-calendar-${language}" ` +
        `and pass it in.`
    );
  }
  return language;
}
