/**
 * Placing the votive Masses of `votive.yml` on the calendar.
 *
 * A votive Mass is said outside the order of the office (§306), as a matter of
 * local devotion — so a caller enables the ones observed. The catalog names the
 * votive Masses the general rubrics give (mysteries of the Lord §308, the Blessed
 * Virgin §309, the angels §310); only those the rubrics fix a recurring day for
 * carry an `occurrence` and are placed here. The rest are named but dated to no
 * day, and so placed nowhere: they are said for an occasion, not on a date.
 */
import type {
  Calendar,
  LiturgicalDay,
  RawMassProper,
  VotiveCatalog,
  VotiveMassId,
  VotiveOccurrence,
} from "./types";
import { eachDay } from "./utils";

export type {
  VotiveCatalog,
  VotiveMass,
  VotiveMassId,
  VotiveCategory,
} from "./types";

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
function votiveDates(occurrence: VotiveOccurrence, year: number): Date[] {
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
  catalog: VotiveCatalog,
  enabled: readonly VotiveMassId[],
  loadProper: (slug: string, date: Date) => RawMassProper | undefined
): void {
  for (const id of enabled) {
    const votive = catalog[id];
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
