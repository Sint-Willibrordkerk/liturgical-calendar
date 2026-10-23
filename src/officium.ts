/**
 * The propers of the Office — what a day says at the Hours of its own, or takes
 * from its common.
 *
 * A day's file holds its Office beside its Mass, keyed alike, in the sections
 * Divinum Officium names them by. The calendar reads them Hour by Hour. The
 * psalter, the ordinary and the rubrics that assemble the Hours are not here:
 * an Hour lacking a text of the day's says the psalter's.
 */
import type {
  Antiphona,
  Capitulum,
  Hymnus,
  LectioMatutini,
  Nocturnus,
  Officium,
  Psalmodia,
  RawReading,
  Responsorium,
  Versus,
} from "./types";

/** The antiphons of the Office, filed in the chant store with the Mass's. */
export const OFFICE_ANTIPHON_SECTIONS = new Set([
  "invit",
  "ant-1",
  "ant-2",
  "ant-3",
  "ant-matutinum",
  "ant-laudes",
  "ant-vespera",
  "ant-vespera-3",
]);

export const HYMN_SECTIONS = new Set([
  "hymnus-matutinum",
  "hymnus-laudes",
  "hymnus-vespera",
  "hymnus-vespera-3",
]);

/** The chapters, and the short lesson of Prime, which is one in all but name. */
export const CHAPTER_SECTIONS = new Set([
  "capitulum-laudes",
  "capitulum-tertia",
  "capitulum-sexta",
  "capitulum-nona",
  "capitulum-vespera",
  "lectio-prima",
]);

const LESSONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The responsories of Matins, after each lesson but the last, and the short ones. */
export const RESPONSORY_SECTIONS = new Set([
  ...LESSONS.slice(0, 8).map((n) => `responsory${n}`),
  "responsory-breve-tertia",
  "responsory-breve-sexta",
  "responsory-breve-nona",
]);

export const VERSICLE_SECTIONS = new Set([
  "versum-1",
  "versum-2",
  "versum-3",
  "versum-tertia",
  "versum-sexta",
  "versum-nona",
  "nocturn-1-versum",
  "nocturn-2-versum",
  "nocturn-3-versum",
]);

/**
 * The lessons of Matins, filed with the readings of the Mass, and the saint's
 * legend in one lesson, which the 1960 rubrics read as the last.
 */
export const LESSON_SECTIONS = new Set([...LESSONS.map((n) => `lectio${n}`), "lectio94"]);

/**
 * Every section of the Office a day publishes, in the order of the Hours: first
 * Vespers, Matins nocturn by nocturn, Lauds, the small Hours and second Vespers.
 * The collect, `oratio`, is the Mass's.
 */
export const OFFICE_SECTIONS: readonly string[] = [
  "ant-1",
  "versum-1",
  "invit",
  "hymnus-matutinum",
  "ant-matutinum",
  ...[1, 2, 3].flatMap((nocturn) => [
    `nocturn-${nocturn}-versum`,
    ...[1, 2, 3].flatMap((i) => {
      const n = (nocturn - 1) * 3 + i;
      return n < 9 ? [`lectio${n}`, `responsory${n}`] : [`lectio${n}`];
    }),
  ]),
  "lectio94",
  "ant-laudes",
  "capitulum-laudes",
  "hymnus-laudes",
  "versum-2",
  "ant-2",
  "lectio-prima",
  ...["tertia", "sexta", "nona"].flatMap((hour) => [
    `capitulum-${hour}`,
    `responsory-breve-${hour}`,
    `versum-${hour}`,
  ]),
  "ant-vespera",
  "ant-vespera-3",
  "capitulum-vespera",
  "hymnus-vespera",
  "hymnus-vespera-3",
  "versum-3",
  "ant-3",
];

const OFFICE = new Set(OFFICE_SECTIONS);

/** True when `key` is a section of the Office. */
export function isOfficeSection(key: string): boolean {
  return OFFICE.has(key);
}

/** An object without the fields that say nothing, or undefined where none says anything. */
function present<T extends object>(fields: T): T | undefined {
  const kept = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as T;
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * What a section holds is only published as the shape its type declares. The
 * sources are not all so tidy: a text may be left as the lines the pipeline
 * could not make sense of, a rubric may leave a section empty, and a directive
 * of Divinum Officium (`@File:Section`, `&Gloria`, `$Deo gratias`, `!heading`)
 * may stand unresolved. Such a text says nothing here, and its Hour is said from
 * the psalter, as for any text the day does not give.
 */
type Guard<T> = (value: unknown) => value is T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A directive's mark at the head of a line, where a text has a line of words. */
const DIRECTIVE = /^\s*[@!$&#~]/m;

/** A string with words in it and no unresolved directive. */
const isWords = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && !DIRECTIVE.test(value);

const isOptionalWords = (value: unknown): boolean => value === undefined || isWords(value);

/** The psalm an antiphon is said with: `109`, `116`; not a run of them left as the source joins them, `10.;;11.`. */
const isPsalmNumbers = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && !/[;_]/.test(value) && !DIRECTIVE.test(value);

const isVersus: Guard<Versus> = (value): value is Versus =>
  isRecord(value) && isWords(value.versus) && isWords(value.responsum);

const isAntiphona: Guard<Antiphona> = (value): value is Antiphona =>
  isRecord(value) && isWords(value.text);

/** A versicle, or where an antiphon stands in its place, as at Easter. */
const isVersusOrAntiphona: Guard<Versus | Antiphona> = (value): value is Versus | Antiphona =>
  isVersus(value) || isAntiphona(value);

const isPsalmodia: Guard<Psalmodia> = (value): value is Psalmodia =>
  isRecord(value) &&
  Array.isArray(value.antiphonae) &&
  value.antiphonae.length > 0 &&
  value.antiphonae.every(
    (entry) =>
      isVersus(entry) ||
      (isRecord(entry) &&
        (entry.text !== undefined || entry.psalmus !== undefined) &&
        isOptionalWords(entry.text) &&
        (entry.psalmus === undefined || isPsalmNumbers(entry.psalmus)))
  );

const isHymnus: Guard<Hymnus> = (value): value is Hymnus =>
  isRecord(value) &&
  Array.isArray(value.strophae) &&
  value.strophae.length > 0 &&
  value.strophae.every(
    (strophe) => Array.isArray(strophe) && strophe.length > 0 && strophe.every(isWords)
  ) &&
  (value.doxologia === undefined ||
    (Array.isArray(value.doxologia) && value.doxologia.length > 0 && value.doxologia.every(isWords)));

const isCapitulum: Guard<Capitulum> = (value): value is Capitulum =>
  isRecord(value) && isWords(value.text) && isOptionalWords(value.ref);

const isResponsorium: Guard<Responsorium> = (value): value is Responsorium =>
  isRecord(value) &&
  isWords(value.responsum) &&
  isWords(value.versus) &&
  isOptionalWords(value.repetitio) &&
  isOptionalWords(value.gloria);

/** A reading with words, or verses; not the lines of one the pipeline left whole. */
const isReading: Guard<RawReading> = (value): value is RawReading =>
  isRecord(value) &&
  isOptionalWords(value.ref) &&
  (isWords(value.text) ||
    (Array.isArray(value.verses) && value.verses.length > 0 && value.verses.every(isWords)));

const isLectio: Guard<LectioMatutini["lectio"]> = (value): value is LectioMatutini["lectio"] =>
  isReading(value) &&
  (!("evangelium" in value) || isReading((value as { evangelium?: unknown }).evangelium));

/**
 * The collect, without a commemoration's heading and reference that a source
 * leaves where it asks for one — they are the Mass's to resolve.
 */
function oratioOf(value: unknown): Officium["oratio"] {
  if (!isRecord(value) || typeof value.text !== "string") return undefined;
  const text = value.text
    .split("\n")
    .filter((line) => !/^\s*[@!]/.test(line))
    .join("\n")
    .trim();
  if (text === "") return undefined;
  return typeof value.closure === "string" && value.closure.trim() !== ""
    ? { text, closure: value.closure }
    : { text };
}

/**
 * A day's Office, Hour by Hour, from its sections as the language says them.
 * Undefined where the day says nothing of the Office.
 *
 * The sources give Vespers once for both: the antiphons and the hymn are said
 * at first and second Vespers alike unless the day gives second Vespers their
 * own; and second Vespers, given no versicle or antiphon at the *Magnificat*,
 * say first Vespers'.
 */
export function buildOfficium(proper: Record<string, unknown>): Officium | undefined {
  /** What a section holds, where it holds the shape `guard` says. */
  const at = <T>(key: string, guard: Guard<T>): T | undefined =>
    guard(proper[key]) ? (proper[key] as T) : undefined;

  const nocturni: Nocturnus[] = [];
  for (const nocturn of [1, 2, 3]) {
    const lectiones: LectioMatutini[] = [];
    for (const n of LESSONS.slice((nocturn - 1) * 3, nocturn * 3)) {
      const lectio = at(`lectio${n}`, isLectio);
      if (lectio === undefined) continue;
      const responsorium = at(`responsory${n}`, isResponsorium);
      lectiones.push(
        responsorium === undefined ? { numerus: n, lectio } : { numerus: n, lectio, responsorium }
      );
    }
    const versus = at(`nocturn-${nocturn}-versum`, isVersus);
    if (lectiones.length > 0 || versus !== undefined) {
      nocturni.push(versus === undefined ? { lectiones } : { versus, lectiones });
    }
  }

  const minor = (hour: string) =>
    present({
      capitulum: at(`capitulum-${hour}`, isCapitulum),
      responsorium: at(`responsory-breve-${hour}`, isResponsorium),
      versus: at(`versum-${hour}`, isVersusOrAntiphona),
    });

  const hours = present<Omit<Officium, "oratio">>({
    primaeVesperae: present({
      psalmodia: at("ant-vespera", isPsalmodia),
      capitulum: at("capitulum-vespera", isCapitulum),
      hymnus: at("hymnus-vespera", isHymnus),
      versus: at("versum-1", isVersusOrAntiphona),
      magnificat: at("ant-1", isAntiphona),
    }),
    matutinum: present({
      invitatorium: at("invit", isAntiphona),
      hymnus: at("hymnus-matutinum", isHymnus),
      psalmodia: at("ant-matutinum", isPsalmodia),
      nocturni: nocturni.length > 0 ? nocturni : undefined,
      legenda: at("lectio94", isReading),
    }),
    laudes: present({
      psalmodia: at("ant-laudes", isPsalmodia),
      capitulum: at("capitulum-laudes", isCapitulum),
      hymnus: at("hymnus-laudes", isHymnus),
      versus: at("versum-2", isVersusOrAntiphona),
      benedictus: at("ant-2", isAntiphona),
    }),
    prima: present({ lectioBrevis: at("lectio-prima", isCapitulum) }),
    tertia: minor("tertia"),
    sexta: minor("sexta"),
    nona: minor("nona"),
    vesperae: present({
      psalmodia: at("ant-vespera-3", isPsalmodia) ?? at("ant-vespera", isPsalmodia),
      capitulum: at("capitulum-vespera", isCapitulum),
      hymnus: at("hymnus-vespera-3", isHymnus) ?? at("hymnus-vespera", isHymnus),
      versus: at("versum-3", isVersusOrAntiphona) ?? at("versum-1", isVersusOrAntiphona),
      magnificat: at("ant-3", isAntiphona) ?? at("ant-1", isAntiphona),
    }),
  });
  // The collect is the Mass's too, so on its own it says nothing of the Office.
  if (hours === undefined) return undefined;
  const oratio = oratioOf(proper.oratio);
  return oratio === undefined ? hours : { ...hours, oratio };
}
