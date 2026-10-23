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
 * A day's Office, Hour by Hour, from its sections as the language says them.
 * Undefined where the day says nothing of the Office.
 *
 * The sources give Vespers once for both: the antiphons and the hymn are said
 * at first and second Vespers alike unless the day gives second Vespers their
 * own; and second Vespers, given no versicle or antiphon at the *Magnificat*,
 * say first Vespers'.
 */
export function buildOfficium(proper: Record<string, unknown>): Officium | undefined {
  const at = <T>(key: string) => proper[key] as T | undefined;

  const nocturni: Nocturnus[] = [];
  for (const nocturn of [1, 2, 3]) {
    const lectiones: LectioMatutini[] = [];
    for (const n of LESSONS.slice((nocturn - 1) * 3, nocturn * 3)) {
      const lectio = at<LectioMatutini["lectio"]>(`lectio${n}`);
      if (lectio === undefined) continue;
      const responsorium = at<Responsorium>(`responsory${n}`);
      lectiones.push(
        responsorium === undefined ? { numerus: n, lectio } : { numerus: n, lectio, responsorium }
      );
    }
    const versus = at<Versus>(`nocturn-${nocturn}-versum`);
    if (lectiones.length > 0 || versus !== undefined) {
      nocturni.push(versus === undefined ? { lectiones } : { versus, lectiones });
    }
  }

  const minor = (hour: string) =>
    present({
      capitulum: at<Capitulum>(`capitulum-${hour}`),
      responsorium: at<Responsorium>(`responsory-breve-${hour}`),
      versus: at<Versus>(`versum-${hour}`),
    });

  const hours = present<Omit<Officium, "oratio">>({
    primaeVesperae: present({
      psalmodia: at<Psalmodia>("ant-vespera"),
      capitulum: at<Capitulum>("capitulum-vespera"),
      hymnus: at<Hymnus>("hymnus-vespera"),
      versus: at<Versus>("versum-1"),
      magnificat: at<Antiphona>("ant-1"),
    }),
    matutinum: present({
      invitatorium: at<Antiphona>("invit"),
      hymnus: at<Hymnus>("hymnus-matutinum"),
      psalmodia: at<Psalmodia>("ant-matutinum"),
      nocturni: nocturni.length > 0 ? nocturni : undefined,
      legenda: at<RawReading>("lectio94"),
    }),
    laudes: present({
      psalmodia: at<Psalmodia>("ant-laudes"),
      capitulum: at<Capitulum>("capitulum-laudes"),
      hymnus: at<Hymnus>("hymnus-laudes"),
      versus: at<Versus>("versum-2"),
      benedictus: at<Antiphona>("ant-2"),
    }),
    prima: present({ lectioBrevis: at<Capitulum>("lectio-prima") }),
    tertia: minor("tertia"),
    sexta: minor("sexta"),
    nona: minor("nona"),
    vesperae: present({
      psalmodia: at<Psalmodia>("ant-vespera-3") ?? at<Psalmodia>("ant-vespera"),
      capitulum: at<Capitulum>("capitulum-vespera"),
      hymnus: at<Hymnus>("hymnus-vespera-3") ?? at<Hymnus>("hymnus-vespera"),
      versus: at<Versus>("versum-3") ?? at<Versus>("versum-1"),
      magnificat: at<Antiphona>("ant-3") ?? at<Antiphona>("ant-1"),
    }),
  });
  // The collect is the Mass's too, so on its own it says nothing of the Office.
  if (hours === undefined) return undefined;
  const oratio = proper.oratio as Officium["oratio"];
  return oratio === undefined ? hours : { ...hours, oratio };
}
