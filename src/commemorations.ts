/**
 * Which of the days falling on a date are commemorated with the day kept
 * (nn. 106-114).
 *
 * The rules are the calendar's, not this module's. Each day says how it is
 * commemorated when it gives way, what it admits when it is kept, and on which
 * days it is left out instead; the head of the calendar says what excludes
 * what and in which order the commemorations are said. This reads them and
 * applies them, the same for every day.
 */
import type {
  Calendar,
  Commemoration,
  CommemorationRules,
  LiturgicalDay,
  Matcher,
} from "./types";
import { eachDay } from "./utils";

export type { CommemorationRules };

const many = <T>(value: T | T[] | undefined): T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

/** Whether the day is of the kind the matcher names: every field it names. */
export function matches(day: Commemoration, matcher: Matcher): boolean {
  const types = many(matcher.type);
  const classes = many(matcher.class);
  const commemorated = many(matcher.commemorated);
  const season = matcher["of-the-season"];
  return (
    (types === undefined || (day.type !== undefined && types.includes(day.type))) &&
    (classes === undefined || classes.includes(day.liturgicalClass)) &&
    (commemorated === undefined ||
      (day.commemorated !== undefined && commemorated.includes(day.commemorated))) &&
    (season === undefined || (day.ofTheSeason === true) === season)
  );
}

/** The words of an id that say what a saint was rather than who. */
const TITLES = new Set(
  `episcopi episc ep confessoris conf ecclesiae eccles doctoris doct virginis virgini
  virg vv martyris mart martyrum mm papae pont summorum pontificum abbatis viduae
  apostoli apostolorum evangelistae presbyteri presbyteris regis reginae reg ducis
  imperatoris protomartyris secundo sociorum sociarum matris patris bmv b m v
  archangeli archangelis limange franciae hungariae portugaliae alexandrini
  hierosolymitani magni et ac atque i ii iii iv vi vii x`.split(/\s+/)
);

/**
 * Whom a day honours (n. 112): whom it says, or, for a feast, the saint its id
 * names, with the words that say what he was taken out, and the date some ids
 * carry. A day that is no feast, and says no one, honours no one.
 */
export function honoursOf(day: Pick<Commemoration, "id" | "type" | "honours">): string[] {
  if (day.honours !== undefined) return day.honours;
  if (day.type !== "festum" || day.id === undefined) return [];
  const words = day.id.split("-").filter((word) => !TITLES.has(word) && !/^\d+$/.test(word));
  return [words.length > 0 ? words.join("-") : day.id];
}

/** Whether one rule of n. 112 keeps the two days apart. */
function excludes(
  rule: CommemorationRules["excludes"][number],
  a: Commemoration,
  b: Commemoration
): boolean {
  if (rule === "honours") {
    const honoured = honoursOf(a);
    return honoursOf(b).some((one) => honoured.includes(one));
  }
  const [first, second] = rule;
  return (matches(a, first) && matches(b, second)) || (matches(a, second) && matches(b, first));
}

/**
 * The commemorations of the day kept, from the days given way to it, in the
 * order of precedence: those left out and those excluded taken away, the rest
 * reduced to what the day admits and put in the order they are said.
 */
function commemorationsOf(
  kept: LiturgicalDay,
  others: Commemoration[],
  rules: CommemorationRules
): Commemoration[] {
  // A day never commemorated, or left out on this one (nn. 26, 33).
  const candidates = others.filter(
    (other) =>
      other.commemorated !== "never" &&
      !(other.omittedOn ?? []).some((matcher) => matches(kept, matcher))
  );

  // Excluded by the day kept, or by a commemoration higher in precedence
  // already admitted (n. 112).
  const admitted: Commemoration[] = [];
  for (const candidate of candidates) {
    const excluded = [kept, ...admitted].some((other) =>
      rules.excludes.some((rule) => excludes(rule, other, candidate))
    );
    if (!excluded) admitted.push(candidate);
  }

  // What the day kept admits (n. 111).
  const { count, of, "privileged-first": privilegedFirst } = kept.admits ?? {};
  const allowed = of === undefined ? admitted : admitted.filter((c) => of.some((m) => matches(c, m)));

  // In the order they are said (n. 113); the sort keeps precedence within a rank.
  const rank = (c: Commemoration) => {
    if (privilegedFirst && c.commemorated === "privileged") return -1;
    const index = rules.order.findIndex((entry) => entry !== "precedence" && matches(c, entry));
    return index === -1 ? rules.order.indexOf("precedence") : index;
  };
  const ordered = [...allowed].sort((a, b) => rank(a) - rank(b));

  // Any beyond the count left out (n. 114).
  return count === undefined ? ordered : ordered.slice(0, count);
}

/** Reduce the commemorations of every day of `year` by the calendar's rules. */
export function applyCommemorations(
  calendar: Calendar,
  year: number,
  rules: CommemorationRules
): void {
  eachDay(year, ({ month, day }) => {
    const entry = calendar[month]?.[day];
    if (entry === undefined) return;
    entry.commemorations = commemorationsOf(entry, entry.commemorations, rules);
  });
}
