/**
 * Whether the days say only what the calendar allows.
 *
 * A calendar or a proper is loaded for its shape alone. Once the propers are
 * inserted into the calendar, every day — the calendar's own and those a
 * proper fills its slots with — is checked here against the lists the calendar
 * declares: its types, classes, colors and ways of being commemorated.
 */
import type { CalendarDay, LoadedCalendar, Matcher } from "./types";
import { asList } from "./utils";

/**
 * What is wrong with the calendar, each problem a line naming the day; nothing
 * where all is well.
 */
export function problemsOf(calendar: LoadedCalendar): string[] {
  const types = calendar["valid-types"] ?? [];
  const classes = calendar["valid-liturgical-classes"] ?? [];
  const colors = calendar["valid-colors"] ?? [];
  const commemorations = calendar["valid-commemorated"] ?? [];

  /** What is wrong with a matcher's values. */
  const matcherProblems = (matcher: Matcher): string[] => [
    ...asList(matcher.type)
      .filter((type) => !types.includes(type))
      .map((type) => `invalid type "${type}" in a matcher`),
    ...asList(matcher.class)
      .filter((c) => !classes.includes(c))
      .map((c) => `invalid class ${c} in a matcher`),
    ...asList(matcher.commemorated)
      .filter((c) => !commemorations.includes(c))
      .map((c) => `invalid commemorated "${c}" in a matcher`),
  ];

  /** What is wrong with one day. */
  const dayProblems = (day: CalendarDay): string[] => {
    const { type, liturgicalClass, color, commemorated, admits, omittedOn = [] } = day;
    return [
      ...(types.includes(type) ? [] : [`invalid type "${type}"`]),
      ...(classes.includes(liturgicalClass) ? [] : [`invalid class ${liturgicalClass}`]),
      ...(color === undefined || colors.includes(color) ? [] : [`invalid color "${color}"`]),
      // Every day says how it is commemorated and what it admits, itself or by
      // its group: nothing is assumed (nn. 108, 111).
      ...(commemorated === undefined
        ? ["does not say how it is commemorated (n. 108)"]
        : commemorations.includes(commemorated)
          ? []
          : [`invalid commemorated "${commemorated}"`]),
      ...(admits === undefined ? ["does not say what it admits (n. 111)"] : []),
      ...[...omittedOn, ...(admits?.of ?? [])].flatMap(matcherProblems),
    ];
  };

  const nameOf = (day: CalendarDay) => day.id ?? `a ${day.type} of class ${day.liturgicalClass}`;

  const rules = calendar.commemorations;
  const ruleMatchers = [
    ...(rules?.excludes ?? []).filter((rule) => rule !== "honours").flat(),
    ...(rules?.order ?? []).filter((entry) => entry !== "precedence"),
  ];

  return [
    ...ruleMatchers.flatMap(matcherProblems).map((problem) => `the rules of commemoration: ${problem}`),
    ...calendar.days.flatMap((day) => dayProblems(day).map((problem) => `${nameOf(day)}: ${problem}`)),
  ];
}
