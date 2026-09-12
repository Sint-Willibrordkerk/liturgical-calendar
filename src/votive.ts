/**
 * The votive Masses named in the general rubrics of the 1960 Missal (§307–389),
 * as a catalog. Each is of a mystery of the Lord (§308), of the Blessed Virgin
 * (§309), or of the angels (§310). Opt-in, since a votive Mass is a matter of
 * local devotion: only the ones a caller names are placed.
 *
 * The rubrics fix a recurring day for only a few (§385a–c, §310b); those carry an
 * `occurrence` and are placed on the calendar. The rest are catalogued and may be
 * enabled, but the rubrics give them no day, so the calendar does not place them —
 * they are said for an occasion the priest chooses, not on a date. The open
 * categories — any saint (§311) and the Masses "for various occasions" (§313) —
 * and the occasion votives of the first and second class (§329, §342: dedications,
 * the rogations, the Forty Hours, weddings, and the rest) are likewise not dated.
 */
import type { Calendar, LiturgicalDay, RawMassProper } from "./types";
import { eachDay } from "./utils";

/** What a votive Mass is of (§307). */
export type VotiveCategory =
  | "mysteries-of-the-lord"
  | "blessed-virgin-mary"
  | "angels";

/** The votive Masses a caller may enable, each named by a Latin slug. */
export type VotiveMassId =
  // Mysteries of the Lord (§308)
  | "sanctissimae-trinitatis"
  | "sanctissimi-nominis-jesu"
  | "sacratissimi-cordis-domini-nostri-jesu-christi"
  | "pretiosissimi-sanguinis-domini-nostri-jesu-christi"
  | "domini-nostri-jesu-christi-regis"
  | "sanctissimi-sacramenti"
  | "domini-nostri-jesu-christi-summi-et-aeterni-sacerdotis"
  | "sanctae-crucis"
  | "passionis-domini-nostri-jesu-christi"
  | "sanctae-familiae-jesu-mariae-joseph"
  | "spiritus-sancti"
  // Blessed Virgin Mary (§309)
  | "immaculati-cordis-beatae-mariae-virginis"
  | "beatae-mariae-virginis-in-sabbato"
  // Angels (§310)
  | "sanctorum-angelorum";

/** Where the rubrics fix a recurring day: the first such weekday, or every one. */
type Occurrence = { cadence: "monthly" | "weekly"; weekday: number };

type VotiveMass = {
  id: VotiveMassId;
  category: VotiveCategory;
  /**
   * The class the rubrics give it in its dated mode; a plain votive of these
   * otherwise falls to the fourth class (§387–389).
   */
  liturgicalClass: 3 | 4;
  /** The rubric that names it. */
  rubric: string;
  /**
   * The propers' slug — a feast's own, where it keeps one. Left off where no
   * proper is filed; the day then shows the id and carries no Mass.
   */
  slug?: string;
  /** Present only where the rubrics fix a day; absent votives are not placed. */
  occurrence?: Occurrence;
};

const MONTHLY = (weekday: number): Occurrence => ({ cadence: "monthly", weekday });
const WEEKLY = (weekday: number): Occurrence => ({ cadence: "weekly", weekday });
const TUE = 2, THU = 4, FRI = 5, SAT = 6;

// The Eternal High Priest is granted the first Thursday or the first Saturday
// (§385a); the Thursday is taken, leaving the first Saturday to the Immaculate
// Heart. No two dated votives share a weekday, so no same-day clash arises.
export const VOTIVE_MASSES: Record<VotiveMassId, VotiveMass> = {
  // Mysteries of the Lord (§308) — dated only where a rubric says so.
  "sanctissimae-trinitatis": {
    id: "sanctissimae-trinitatis",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-1",
  },
  "sanctissimi-nominis-jesu": {
    id: "sanctissimi-nominis-jesu",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-2",
  },
  "sacratissimi-cordis-domini-nostri-jesu-christi": {
    id: "sacratissimi-cordis-domini-nostri-jesu-christi",
    category: "mysteries-of-the-lord",
    liturgicalClass: 3,
    rubric: "385b",
    slug: "sacratissimi-cordis-domini-nostri-jesu-christi-pent02-5",
    occurrence: MONTHLY(FRI),
  },
  "pretiosissimi-sanguinis-domini-nostri-jesu-christi": {
    id: "pretiosissimi-sanguinis-domini-nostri-jesu-christi",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-4",
  },
  "domini-nostri-jesu-christi-regis": {
    id: "domini-nostri-jesu-christi-regis",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-5",
  },
  "sanctissimi-sacramenti": {
    id: "sanctissimi-sacramenti",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-6",
  },
  "domini-nostri-jesu-christi-summi-et-aeterni-sacerdotis": {
    id: "domini-nostri-jesu-christi-summi-et-aeterni-sacerdotis",
    category: "mysteries-of-the-lord",
    liturgicalClass: 3,
    rubric: "385a",
    occurrence: MONTHLY(THU),
  },
  "sanctae-crucis": {
    id: "sanctae-crucis",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-8",
  },
  "passionis-domini-nostri-jesu-christi": {
    id: "passionis-domini-nostri-jesu-christi",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-9",
  },
  "sanctae-familiae-jesu-mariae-joseph": {
    id: "sanctae-familiae-jesu-mariae-joseph",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-10",
  },
  "spiritus-sancti": {
    id: "spiritus-sancti",
    category: "mysteries-of-the-lord",
    liturgicalClass: 4,
    rubric: "308a-11",
  },
  // Blessed Virgin Mary (§309)
  "immaculati-cordis-beatae-mariae-virginis": {
    id: "immaculati-cordis-beatae-mariae-virginis",
    category: "blessed-virgin-mary",
    liturgicalClass: 3,
    rubric: "385c",
    slug: "immaculati-cordis-beatae-mariae-virginis",
    occurrence: MONTHLY(SAT),
  },
  // The Saturday Office of Our Lady (§309a) already occupies the free Saturdays
  // in the base calendar, so this catalog entry carries no occurrence of its own.
  "beatae-mariae-virginis-in-sabbato": {
    id: "beatae-mariae-virginis-in-sabbato",
    category: "blessed-virgin-mary",
    liturgicalClass: 4,
    rubric: "309a",
  },
  // Angels (§310)
  "sanctorum-angelorum": {
    id: "sanctorum-angelorum",
    category: "angels",
    liturgicalClass: 4,
    rubric: "310b",
    occurrence: WEEKLY(TUE),
  },
};

const FERIA = "feria";
const FESTUM = "festum";

/**
 * Whether a votive of the given class may take this day (§317, §384): any votive
 * takes a free fourth-class feria (the Saturday Office of Our Lady included); a
 * third-class votive also takes a third-class feast in its place. Everything else
 * — higher classes, vigils, the privileged ferias of Advent and Lent — it yields.
 */
export function admitsVotive(
  day: LiturgicalDay | undefined,
  votiveClass: 3 | 4
): boolean {
  if (day == null) return false;
  if (day.type === FERIA && day.liturgicalClass === 4) return true;
  return votiveClass === 3 && day.type === FESTUM && day.liturgicalClass === 3;
}

/** The dates in `year` on which a dated votive Mass keeps its weekday. */
function votiveDates(occurrence: Occurrence, year: number): Date[] {
  const dates: Date[] = [];
  const seenMonth = new Set<number>();
  eachDay(year, ({ date, month }) => {
    if (date.getDay() !== occurrence.weekday) return;
    if (occurrence.cadence === "monthly") {
      if (seenMonth.has(month)) return;
      seenMonth.add(month);
    }
    dates.push(new Date(date));
  });
  return dates;
}

/**
 * Place each enabled votive Mass on the days the rubrics give it. A votive with
 * no fixed day is passed over — it is said for an occasion, not on a date. Where
 * a dated votive's propers were not built, `loadProper` returns nothing and the
 * day still becomes the votive, carrying its name but no Mass.
 */
export function applyVotiveMasses(
  calendar: Calendar,
  year: number,
  enabled: readonly VotiveMassId[],
  loadProper: (slug: string, date: Date) => RawMassProper | undefined
): void {
  for (const id of enabled) {
    const votive = VOTIVE_MASSES[id];
    if (!votive?.occurrence) continue;

    for (const date of votiveDates(votive.occurrence, year)) {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const entry = calendar[month]?.[day];
      if (!admitsVotive(entry, votive.liturgicalClass)) continue;

      const mass = votive.slug ? loadProper(votive.slug, date) : undefined;
      entry!.title = mass?.title ?? votive.id;
      entry!.mass = mass;
      entry!.liturgicalClass = votive.liturgicalClass;
    }
  }
}
