/**
 * Whether the days say only what the calendar allows.
 *
 * A calendar or a proper is loaded for its shape alone. Once the propers are
 * inserted into the calendar, every day — the calendar's own and those a
 * proper fills its slots with — is checked here against the lists the calendar
 * declares: its types, classes, colors and ways of being commemorated.
 */
import type { CalendarData, Matcher } from "./types";

/** A field as a list, whether it holds one value, several or none. */
function valuesOf<T>(field: T | T[] | undefined): T[] {
  if (field === undefined) return [];
  return Array.isArray(field) ? field : [field];
}

/**
 * The days of the calendar that fall on a date, each with what its groups say
 * of it: one for each day of a `calendar` map, or the group itself where it
 * gives its dates as an `occurence`.
 */
function datedDays(node: CalendarData, inherited: CalendarData = {}): CalendarData[] {
  const { items, calendar, ...own } = node;
  const merged = { ...inherited, ...own };
  if (items?.length) return items.flatMap((item) => datedDays(item, merged));
  if (calendar !== undefined && Object.keys(calendar).length > 0) {
    return Object.values(calendar)
      .flatMap((entries) => valuesOf(entries))
      .map((entry) => (typeof entry === "string" ? { ...merged, id: entry } : { ...merged, ...entry }));
  }
  return merged.occurence === undefined ? [] : [merged];
}

/**
 * What is wrong with the calendar, each problem a line naming the day; nothing
 * where all is well.
 */
export function problemsOf(calendar: CalendarData): string[] {
  const types = calendar["valid-types"] ?? [];
  const classes = calendar["valid-liturgical-classes"] ?? [];
  const colors = calendar["valid-colors"] ?? [];
  const commemorations = calendar["valid-commemorated"] ?? [];

  /** What is wrong with a matcher's values. */
  const matcherProblems = (matcher: Matcher): string[] => [
    ...valuesOf(matcher.type)
      .filter((type) => !types.includes(type))
      .map((type) => `invalid type "${type}" in a matcher`),
    ...valuesOf(matcher.class)
      .filter((c) => !classes.includes(c))
      .map((c) => `invalid class ${c} in a matcher`),
    ...valuesOf(matcher.commemorated)
      .filter((c) => !commemorations.includes(c))
      .map((c) => `invalid commemorated "${c}" in a matcher`),
  ];

  /** What is wrong with one day. */
  const dayProblems = (day: CalendarData): string[] => {
    const { type, "liturgical-class": liturgicalClass, color, commemorated, admits } = day;
    return [
      ...(type === undefined || types.includes(type) ? [] : [`invalid type "${type}"`]),
      ...(liturgicalClass === undefined || classes.includes(liturgicalClass)
        ? []
        : [`invalid class ${liturgicalClass}`]),
      ...(color === undefined || colors.includes(color) ? [] : [`invalid color "${color}"`]),
      // Every day says how it is commemorated and what it admits, itself or by
      // its group: nothing is assumed (nn. 108, 111).
      ...(commemorated === undefined
        ? ["does not say how it is commemorated (n. 108)"]
        : commemorations.includes(commemorated)
          ? []
          : [`invalid commemorated "${commemorated}"`]),
      ...(admits === undefined ? ["does not say what it admits (n. 111)"] : []),
      ...[...(day["omitted-on"] ?? []), ...(admits?.of ?? [])].flatMap(matcherProblems),
    ];
  };

  const nameOf = (day: CalendarData) => day.id ?? `a ${day.type} of class ${day["liturgical-class"]}`;

  const rules = calendar.commemorations;
  const ruleMatchers = [
    ...(rules?.excludes ?? []).filter((rule) => rule !== "honours").flat(),
    ...(rules?.order ?? []).filter((entry) => entry !== "precedence"),
  ];

  return [
    ...ruleMatchers.flatMap(matcherProblems).map((problem) => `the rules of commemoration: ${problem}`),
    ...datedDays(calendar).flatMap((day) => dayProblems(day).map((problem) => `${nameOf(day)}: ${problem}`)),
  ];
}
