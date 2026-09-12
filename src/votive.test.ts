import { describe, expect, it } from "vitest";
import {
  admitsVotive,
  applyVotiveMasses,
  VOTIVE_MASSES,
  type VotiveMassId,
} from "./votive";
import type { Calendar, LiturgicalDay, RawMassProper } from "./types";

const feria = (): LiturgicalDay =>
  ({ type: "feria", liturgicalClass: 4, commemorations: [] }) as LiturgicalDay;

const day = (
  type: string,
  liturgicalClass: number,
  extra: Partial<LiturgicalDay> = {}
): LiturgicalDay =>
  ({ type, liturgicalClass, commemorations: [], ...extra }) as LiturgicalDay;

/** A calendar holding only the days named, so a rule is easy to read. */
function calendarOf(days: Record<string, LiturgicalDay>): Calendar {
  const out: Calendar = {} as Calendar;
  for (const [key, d] of Object.entries(days)) {
    const [m, dd] = key.split("-").map(Number) as [number, number];
    out[m] ??= {};
    out[m]![dd] = d;
  }
  return out;
}

const SACRED_HEART = "sacratissimi-cordis-domini-nostri-jesu-christi";
const IMMACULATE_HEART = "immaculati-cordis-beatae-mariae-virginis";
const HIGH_PRIEST = "domini-nostri-jesu-christi-summi-et-aeterni-sacerdotis";
const HOLY_ANGELS = "sanctorum-angelorum";

/** A stub that gives the Sacred Heart its Mass and knows no other. */
const heartMass = { title: "Ssmi Cordis Iesu" } as RawMassProper;
const loadProper = (slug: string): RawMassProper | undefined =>
  slug === VOTIVE_MASSES[SACRED_HEART].slug ? heartMass : undefined;

const apply = (
  calendar: Calendar,
  year: number,
  enabled: VotiveMassId[],
  load = loadProper
) => applyVotiveMasses(calendar, year, enabled, load);

describe("admitsVotive", () => {
  it("is a fourth-class feria, for a votive of either class", () => {
    expect(admitsVotive(feria(), 3)).toBe(true);
    expect(admitsVotive(feria(), 4)).toBe(true);
  });

  it("is a fourth-class feria even where it names a celebration", () => {
    // The Saturday Office of Our Lady: a free day the first-Saturday votive takes.
    expect(admitsVotive(day("feria", 4, { title: "Sanctæ Mariæ" }), 3)).toBe(true);
  });

  it("is a third-class feast, but only for a third-class votive", () => {
    expect(admitsVotive(day("festum", 3), 3)).toBe(true);
    expect(admitsVotive(day("festum", 3), 4)).toBe(false);
  });

  it("is not a privileged feria of the third class, no free day", () => {
    expect(admitsVotive(day("feria", 3), 3)).toBe(false);
  });

  it("is not a day of the first or second class, nor a Sunday", () => {
    expect(admitsVotive(day("festum", 2), 3)).toBe(false);
    expect(admitsVotive(day("festum", 1), 3)).toBe(false);
    expect(admitsVotive(day("dominica", 2), 3)).toBe(false);
  });

  it("is not a vigil of the third class", () => {
    expect(admitsVotive(day("vigilia", 3), 3)).toBe(false);
  });

  it("is not an absent day", () => {
    expect(admitsVotive(undefined, 3)).toBe(false);
  });
});

describe("applyVotiveMasses", () => {
  // February 2026 begins on a Sunday: the first Friday is the 6th, the first
  // Saturday the 7th, the first Thursday the 5th; the Tuesdays are 3, 10, 17, 24.
  it("keeps the Sacred Heart on the first Friday of the month", () => {
    const calendar = calendarOf({ "2-6": feria(), "2-13": feria() });
    apply(calendar, 2026, [SACRED_HEART]);
    expect(calendar[2]![6]!.mass).toBe(heartMass);
    expect(calendar[2]![6]!.title).toBe("Ssmi Cordis Iesu");
    // The second Friday is left as the feria it was.
    expect(calendar[2]![13]!.mass).toBeUndefined();
    expect(calendar[2]![13]!.title).toBeUndefined();
  });

  it("keeps the Immaculate Heart on the first Saturday, over Our Lady's Office", () => {
    const calendar = calendarOf({
      "2-7": day("feria", 4, { title: "Sanctæ Mariæ" }),
    });
    apply(calendar, 2026, [IMMACULATE_HEART]);
    expect(calendar[2]![7]!.title).toBe(IMMACULATE_HEART);
  });

  it("keeps the Eternal High Priest on the first Thursday", () => {
    const calendar = calendarOf({ "2-5": feria(), "2-12": feria() });
    apply(calendar, 2026, [HIGH_PRIEST]);
    expect(calendar[2]![5]!.title).toBe(HIGH_PRIEST);
    expect(calendar[2]![12]!.title).toBeUndefined();
  });

  it("keeps the Holy Angels on every Tuesday", () => {
    const calendar = calendarOf({ "2-3": feria(), "2-10": feria() });
    apply(calendar, 2026, [HOLY_ANGELS]);
    expect(calendar[2]![3]!.title).toBe(HOLY_ANGELS);
    expect(calendar[2]![10]!.title).toBe(HOLY_ANGELS);
  });

  it("takes a third-class feast in the place of a third-class votive", () => {
    // 5 September 2026 is the first Saturday; St Lawrence Justinian, a third-class
    // feast, occurs — the Immaculate Heart is said in its place (§317).
    const calendar = calendarOf({
      "9-5": day("festum", 3, { title: "S. Laurentii Justiniani" }),
    });
    apply(calendar, 2026, [IMMACULATE_HEART]);
    expect(calendar[9]![5]!.title).toBe(IMMACULATE_HEART);
    expect(calendar[9]![5]!.liturgicalClass).toBe(3);
  });

  it("yields a fourth-class votive to a third-class feast", () => {
    const feast = day("festum", 3, { title: "Some Feast" });
    // A Tuesday feast: the Holy Angels, of the fourth class, may not take it.
    const calendar = calendarOf({ "2-10": feast });
    apply(calendar, 2026, [HOLY_ANGELS]);
    expect(calendar[2]![10]).toBe(feast);
    expect(calendar[2]![10]!.title).toBe("Some Feast");
  });

  it("yields to a day of a higher class", () => {
    const feast = day("festum", 2, { title: "Second Class" });
    const calendar = calendarOf({ "2-6": feast });
    apply(calendar, 2026, [SACRED_HEART]);
    expect(calendar[2]![6]).toBe(feast);
    expect(calendar[2]![6]!.title).toBe("Second Class");
  });

  it("becomes the celebration even where no proper is built, with no Mass", () => {
    const calendar = calendarOf({ "2-3": feria() });
    apply(calendar, 2026, [HOLY_ANGELS]);
    expect(calendar[2]![3]!.title).toBe(HOLY_ANGELS);
    expect(calendar[2]![3]!.mass).toBeUndefined();
  });

  it("leaves the calendar untouched where nothing is enabled", () => {
    const calendar = calendarOf({ "2-6": feria() });
    apply(calendar, 2026, []);
    expect(calendar[2]![6]!.title).toBeUndefined();
    expect(calendar[2]![6]!.mass).toBeUndefined();
  });

  it("ignores an unknown id", () => {
    const calendar = calendarOf({ "2-6": feria() });
    apply(calendar, 2026, ["nonesuch" as VotiveMassId]);
    expect(calendar[2]![6]!.title).toBeUndefined();
  });

  it("does not place a votive the rubrics give no day", () => {
    // The Holy Spirit is a votive Mass of the Lord (§308) but has no fixed day.
    const calendar = calendarOf({ "2-2": feria(), "2-6": feria() });
    apply(calendar, 2026, ["spiritus-sancti"]);
    expect(calendar[2]![2]!.title).toBeUndefined();
    expect(calendar[2]![6]!.title).toBeUndefined();
  });
});

describe("VOTIVE_MASSES catalog", () => {
  it("names every dated votive and only those with an occurrence are placed", () => {
    const dated = Object.values(VOTIVE_MASSES).filter((v) => v.occurrence);
    expect(dated.map((v) => v.id).sort()).toEqual(
      [SACRED_HEART, IMMACULATE_HEART, HIGH_PRIEST, HOLY_ANGELS].sort()
    );
  });

  it("catalogues the mysteries of the Lord, Our Lady, and the angels", () => {
    const categories = new Set(
      Object.values(VOTIVE_MASSES).map((v) => v.category)
    );
    expect(categories).toEqual(
      new Set(["mysteries-of-the-lord", "blessed-virgin-mary", "angels"])
    );
  });
});
