import { describe, expect, it } from "vitest";
import {
  applyFerialMass,
  borrowsItsMass,
  firstSundayAfterEpiphany,
  SUNDAY_AFTER_EPIPHANY_MASS,
  SUNDAY_AFTER_PENTECOST_MASS,
  SUNDAY_AFTER_PENTECOST_VARIANT,
} from "./ferias";
import type { Calendar, LiturgicalDay, ProperReference } from "./types";
import { calculateEaster } from "./utils";

const feria = (): LiturgicalDay =>
  ({
    type: "feria",
    liturgicalClass: 4,
    commemorations: [],
    season: "per-annum",
    color: "green",
  }) as LiturgicalDay;

const withProper = (
  type: string,
  liturgicalClass: number,
  proper: ProperReference | undefined
): LiturgicalDay =>
  ({ type, liturgicalClass, proper, commemorations: [] }) as never;

/** A calendar holding only the days named, so a rule is easy to read. */
function calendarOf(days: Record<string, LiturgicalDay>): Calendar {
  const out: Calendar = {} as Calendar;
  for (const [key, day] of Object.entries(days)) {
    const [m, d] = key.split("-").map(Number) as [number, number];
    out[m] ??= {};
    out[m]![d] = day;
  }
  return out;
}

/** The title a day's Mass is read from. */
const titleOf = (day: LiturgicalDay | undefined) => day?.proper?.title;

describe("borrowsItsMass", () => {
  it("is a fourth-class feria with no Mass of its own", () => {
    expect(borrowsItsMass(feria())).toBe(true);
  });

  it("is not a feria that already has one", () => {
    expect(borrowsItsMass(withProper("feria", 4, { title: "x" }))).toBe(false);
  });

  it("is not a feria that names a celebration of its own", () => {
    const titled = feria();
    titled.title = "sanctæ-mariæ-sabbato";
    expect(borrowsItsMass(titled)).toBe(false);
  });

  it("is a feria of any class, the ferias of Advent being privileged", () => {
    expect(borrowsItsMass(withProper("feria", 3, undefined))).toBe(true);
    expect(borrowsItsMass(withProper("feria", 2, undefined))).toBe(true);
  });

  it("is not a day that is not a feria", () => {
    expect(borrowsItsMass(withProper("festum", 4, undefined))).toBe(false);
    expect(borrowsItsMass(withProper("dominica", 2, undefined))).toBe(false);
    expect(borrowsItsMass(withProper("octava", 1, undefined))).toBe(false);
  });
});

describe("firstSundayAfterEpiphany", () => {
  it("is the first Sunday after the sixth of January", () => {
    // 6 January 2026 is a Tuesday.
    expect(firstSundayAfterEpiphany(2026).getDate()).toBe(11);
    // 6 January 2027 is a Wednesday.
    expect(firstSundayAfterEpiphany(2027).getDate()).toBe(10);
  });

  it("is the Sunday after, where the Epiphany is itself a Sunday", () => {
    // 6 January 2030 is a Sunday; the First Sunday after it is the 13th.
    expect(firstSundayAfterEpiphany(2030).getDate()).toBe(13);
  });
});

describe("applyFerialMass", () => {
  const circumcision = { title: "In Circumcisione Domini" };
  const epiphany = { title: "In Epiphania Domini" };
  const sunday = { title: "Dominica" };

  it("gives the days after the Circumcision its Mass", () => {
    const calendar = calendarOf({
      "1-1": withProper("octava", 1, circumcision),
      "1-2": feria(),
      "1-5": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(titleOf(calendar[1]![2])).toBe(circumcision.title);
    expect(titleOf(calendar[1]![5])).toBe(circumcision.title);
  });

  it("reads a borrowed Mass in the season of the day that owns it", () => {
    const calendar = calendarOf({
      "1-1": withProper("octava", 1, circumcision),
      "1-2": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[1]![2]!.proper).toEqual({
      title: circumcision.title,
      season: new Date(2026, 0, 1),
      borrowed: true,
    });
    expect(circumcision).toEqual({ title: "In Circumcisione Domini" });
  });

  it("gives the days after the Epiphany its Mass, up to the First Sunday", () => {
    const calendar = calendarOf({
      "1-6": withProper("festum", 1, epiphany),
      "1-7": feria(),
      "1-10": feria(),
      "1-11": withProper("dominica", 2, sunday), // the First Sunday, in 2026
      "1-12": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(titleOf(calendar[1]![7])).toBe(epiphany.title);
    expect(titleOf(calendar[1]![10])).toBe(epiphany.title);
    // The twelfth falls after that Sunday, so it says that Sunday's own Mass.
    expect(titleOf(calendar[1]![12])).toBe(SUNDAY_AFTER_EPIPHANY_MASS);
  });

  it("gives every other feria the Mass of the Sunday just past", () => {
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, sunday),
      "8-26": feria(),
      "8-29": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(titleOf(calendar[8]![26])).toBe(sunday.title);
    expect(titleOf(calendar[8]![29])).toBe(sunday.title);
  });

  it("borrows the Mass alone, not the Office", () => {
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, sunday),
      "8-26": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![26]!.proper?.borrowed).toBe(true);
    expect(calendar[8]![23]!.proper?.borrowed).toBeUndefined();
  });

  it("moves on to the next Sunday once it comes", () => {
    const later = { title: "Dominica XIV" };
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, sunday),
      "8-26": feria(),
      "8-30": withProper("dominica", 2, later),
      "9-1": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(titleOf(calendar[8]![26])).toBe(sunday.title);
    expect(titleOf(calendar[9]![1])).toBe(later.title);
  });

  it("leaves a titled feria without the Sunday's Mass", () => {
    const titled = feria();
    titled.title = "sanctæ-mariæ-sabbato";
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, sunday),
      "8-29": titled,
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![29]!.proper).toBeUndefined();
  });

  it("leaves a feria that already has a Mass alone", () => {
    const own = { title: "its own" };
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, sunday),
      "8-26": withProper("feria", 4, own),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![26]!.proper).toBe(own);
  });

  it("leaves a feria with nothing to borrow without a Mass", () => {
    const calendar = calendarOf({ "8-26": feria() });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![26]!.proper).toBeUndefined();
  });

  it("does not let a Sunday take the Mass of the week before it", () => {
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, sunday),
      "8-30": withProper("dominica", 2, undefined),
      "8-31": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![30]!.proper).toBeUndefined();
    // The Sunday had none to give, so the feria keeps the one before it.
    expect(titleOf(calendar[8]![31])).toBe(sunday.title);
  });
});

describe("the ferias of a week whose Sunday a feast took", () => {
  /** A feast kept on a Sunday, the Sunday giving way to a commemoration. */
  const keptOnSunday = (
    feast: ProperReference,
    sunday: ProperReference | undefined
  ): LiturgicalDay =>
    ({
      type: "festum",
      liturgicalClass: 1,
      proper: feast,
      commemorations: [
        { type: "dominica", liturgicalClass: 2, proper: sunday },
        { type: "feria", liturgicalClass: 4 },
      ],
    }) as never;

  const christTheKing = { title: "In festo Domini Nostri Jesu Christi Regis" };
  const dominicaXXII = { title: "Dominica XXII post Pentecosten" };

  it("say the Mass of the Sunday, not of the feast", () => {
    // In 2026 Christ the King takes the twenty-fifth of October, the Twenty-
    // second Sunday after Pentecost.
    const calendar = calendarOf({
      "10-25": keptOnSunday(christTheKing, dominicaXXII),
      "10-26": feria(),
      "10-30": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[10]![25]!.proper).toBe(christTheKing);
    expect(titleOf(calendar[10]![26])).toBe(dominicaXXII.title);
    expect(titleOf(calendar[10]![30])).toBe(dominicaXXII.title);
  });

  it("say it whatever feast it was, a saint's as well", () => {
    // All Saints falls on a Sunday in 2026, the Twenty-third after Pentecost.
    const allSaints = { title: "Omnium Sanctorum" };
    const dominicaXXIII = { title: "Dominica XXIII post Pentecosten" };
    const calendar = calendarOf({
      "11-1": keptOnSunday(allSaints, dominicaXXIII),
      "11-3": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(titleOf(calendar[11]![3])).toBe(dominicaXXIII.title);
  });

  it("say the Mass of the First Sunday after Pentecost after the Trinity", () => {
    // The Trinity is the thirty-first of May in 2026. That Sunday's file gives
    // the Trinity texts unless asked for its variant, which holds its own.
    const trinity = { title: "Festum Sanctissimæ Trinitatis" };
    const calendar = calendarOf({
      "5-31": keptOnSunday(trinity, { title: SUNDAY_AFTER_PENTECOST_MASS }),
      "6-3": feria(),
    });
    applyFerialMass(calendar, 2026);
    // Read in the season of the Monday after it, which the Sunday's own Mass
    // is said in.
    const afterTrinity = calculateEaster(2026);
    afterTrinity.setDate(afterTrinity.getDate() + 57);
    expect(calendar[5]![31]!.proper).toBe(trinity);
    expect(calendar[6]![3]!.proper).toMatchObject({
      title: SUNDAY_AFTER_PENTECOST_MASS,
      variant: SUNDAY_AFTER_PENTECOST_VARIANT,
      season: afterTrinity,
      borrowed: true,
    });
  });

  it("keep that variant to the week of the Trinity", () => {
    const calendar = calendarOf({
      "10-25": keptOnSunday(christTheKing, dominicaXXII),
      "10-26": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[10]![26]!.proper?.variant).toBeUndefined();
  });

  it("say the feast's Mass where it commemorates no Sunday", () => {
    // Easter is kept as a feast and stands for its Sunday.
    const easter = { title: "Dominica Resurrectionis" };
    const calendar = calendarOf({
      "4-5": withProper("festum", 1, easter),
      "4-13": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(titleOf(calendar[4]![13])).toBe(easter.title);
  });

  it("keep the Mass before it where the Sunday has none to give", () => {
    const dominicaXXI = { title: "Dominica XXI post Pentecosten" };
    const calendar = calendarOf({
      "10-18": withProper("dominica", 2, dominicaXXI),
      "10-25": keptOnSunday(christTheKing, undefined),
      "10-26": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(titleOf(calendar[10]![26])).toBe(dominicaXXI.title);
  });
});

describe("the Preface of a feria that says its Sunday's Mass", () => {
  const prefatioOf = (day: LiturgicalDay | undefined) => day?.proper?.prefatio;
  const dominicaXIII = { title: "Dominica XIII post Pentecosten" };

  it("is the common Preface in place of any the Sunday names", () => {
    // 26 August 2026 falls in the week of the Thirteenth Sunday after
    // Pentecost, which names the Trinity's; Divinum Officium says the common
    // Preface on it. A Sunday that names none says the season's, and so do
    // its ferias.
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, dominicaXIII),
      "8-26": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(prefatioOf(calendar[8]![26])).toEqual({ name: "communis", always: false });
  });

  it("is the common Preface where a feast took the Sunday", () => {
    const calendar = calendarOf({
      "10-25": {
        type: "festum",
        liturgicalClass: 1,
        proper: { title: "In festo Domini Nostri Jesu Christi Regis" },
        commemorations: [
          { type: "dominica", liturgicalClass: 2, proper: { title: "Dominica XXII post Pentecosten" } },
        ],
      } as never,
      "10-27": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(prefatioOf(calendar[10]![27])).toEqual({ name: "communis", always: false });
    expect(prefatioOf(calendar[10]![25])).toBeUndefined();
  });

  it("is the common Preface after the Trinity", () => {
    const calendar = calendarOf({
      "5-31": withProper("festum", 1, { title: "Festum Sanctissimæ Trinitatis" }),
      "6-3": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(prefatioOf(calendar[6]![3])).toEqual({ name: "communis", always: false });
  });

  it("leaves the Sunday its own Preface", () => {
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, dominicaXIII),
      "8-26": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(prefatioOf(calendar[8]![23])).toBeUndefined();
    expect(dominicaXIII).toEqual({ title: "Dominica XIII post Pentecosten" });
  });

  it("is one Mass for all the ferias of the week", () => {
    const calendar = calendarOf({
      "8-23": withProper("dominica", 2, dominicaXIII),
      "8-24": feria(),
      "8-28": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![24]!.proper).toEqual(calendar[8]![28]!.proper);
  });
});

describe("the ferias after the First Sunday after the Epiphany", () => {
  const epiphany = { title: "In Epiphania Domini" };
  const holyFamily = { title: "Sanctæ Familiæ" };

  it("says that Sunday's own Mass, not the Sunday's celebration", () => {
    // In 2026 the First Sunday after the Epiphany is the eleventh, kept as the
    // Holy Family; the ferias after it say the Sunday-as-such Mass instead.
    const calendar = calendarOf({
      "1-6": withProper("festum", 1, epiphany),
      "1-7": feria(),
      "1-11": withProper("festum", 2, holyFamily),
      "1-12": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(titleOf(calendar[1]![7])).toBe(epiphany.title);
    expect(titleOf(calendar[1]![12])).toBe(SUNDAY_AFTER_EPIPHANY_MASS);
  });

  it("says the Preface of the Epiphany, whatever the Mass names", () => {
    const calendar = calendarOf({
      "1-11": withProper("festum", 2, holyFamily),
      "1-12": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[1]![12]!.proper).toEqual({
      title: SUNDAY_AFTER_EPIPHANY_MASS,
      season: new Date(2026, 0, 12),
      prefatio: { name: "epi", always: true },
      borrowed: true,
    });
  });
});
