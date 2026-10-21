import { describe, expect, it } from "vitest";
import {
  applyFerialMass,
  borrowsItsMass,
  firstSundayAfterEpiphany,
} from "./ferias";
import type { Calendar, LiturgicalDay } from "./types";

const feria = (): LiturgicalDay =>
  ({
    type: "feria",
    liturgicalClass: 4,
    commemorations: [],
    season: "per-annum",
    color: "green",
  }) as LiturgicalDay;

const withMass = (
  type: string,
  liturgicalClass: number,
  mass: unknown
): LiturgicalDay =>
  ({ type, liturgicalClass, mass, commemorations: [] }) as never;

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

describe("borrowsItsMass", () => {
  it("is a fourth-class feria with no Mass of its own", () => {
    expect(borrowsItsMass(feria())).toBe(true);
  });

  it("is not a feria that already has one", () => {
    expect(borrowsItsMass(withMass("feria", 4, { oratio: "x" }))).toBe(false);
  });

  it("is not a feria that names a celebration of its own", () => {
    const titled = feria();
    titled.title = "sanctæ-mariæ-sabbato";
    expect(borrowsItsMass(titled)).toBe(false);
  });

  it("is a feria of any class, the ferias of Advent being privileged", () => {
    expect(borrowsItsMass(withMass("feria", 3, undefined))).toBe(true);
    expect(borrowsItsMass(withMass("feria", 2, undefined))).toBe(true);
  });

  it("is not a day that is not a feria", () => {
    expect(borrowsItsMass(withMass("festum", 4, undefined))).toBe(false);
    expect(borrowsItsMass(withMass("dominica", 2, undefined))).toBe(false);
    expect(borrowsItsMass(withMass("octava", 1, undefined))).toBe(false);
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
      "1-1": withMass("octava", 1, circumcision),
      "1-2": feria(),
      "1-5": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[1]![2]!.mass).toBe(circumcision);
    expect(calendar[1]![5]!.mass).toBe(circumcision);
  });

  it("gives the days after the Epiphany its Mass, up to the First Sunday", () => {
    const calendar = calendarOf({
      "1-6": withMass("festum", 1, epiphany),
      "1-7": feria(),
      "1-10": feria(),
      "1-11": withMass("dominica", 2, sunday), // the First Sunday, in 2026
      "1-12": feria(),
    });
    applyFerialMass(calendar, 2026, sunday);
    expect(calendar[1]![7]!.mass).toBe(epiphany);
    expect(calendar[1]![10]!.mass).toBe(epiphany);
    // The twelfth falls after that Sunday, so it says that Sunday's own Mass.
    expect((calendar[1]![12]!.mass as { title: string }).title).toBe("Dominica");
  });

  it("gives every other feria the Mass of the Sunday just past", () => {
    const calendar = calendarOf({
      "8-23": withMass("dominica", 2, sunday),
      "8-26": feria(),
      "8-29": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![26]!.mass).toBe(sunday);
    expect(calendar[8]![29]!.mass).toBe(sunday);
  });

  it("moves on to the next Sunday once it comes", () => {
    const later = { title: "Dominica XIV" };
    const calendar = calendarOf({
      "8-23": withMass("dominica", 2, sunday),
      "8-26": feria(),
      "8-30": withMass("dominica", 2, later),
      "9-1": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![26]!.mass).toBe(sunday);
    expect(calendar[9]![1]!.mass).toBe(later);
  });

  it("leaves a titled feria without the Sunday's Mass", () => {
    const titled = feria();
    titled.title = "sanctæ-mariæ-sabbato";
    const calendar = calendarOf({
      "8-23": withMass("dominica", 2, sunday),
      "8-29": titled,
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![29]!.mass).toBeUndefined();
  });

  it("leaves a feria that already has a Mass alone", () => {
    const own = { title: "its own" };
    const calendar = calendarOf({
      "8-23": withMass("dominica", 2, sunday),
      "8-26": withMass("feria", 4, own),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![26]!.mass).toBe(own);
  });

  it("leaves a feria with nothing to borrow without a Mass", () => {
    const calendar = calendarOf({ "8-26": feria() });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![26]!.mass).toBeUndefined();
  });

  it("does not let a Sunday take the Mass of the week before it", () => {
    const calendar = calendarOf({
      "8-23": withMass("dominica", 2, sunday),
      "8-30": withMass("dominica", 2, undefined),
      "8-31": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![30]!.mass).toBeUndefined();
    // The Sunday had none to give, so the feria keeps the one before it.
    expect(calendar[8]![31]!.mass).toBe(sunday);
  });
});

describe("the ferias of a week whose Sunday a feast took", () => {
  /** A feast kept on a Sunday, the Sunday giving way to a commemoration. */
  const keptOnSunday = (feast: unknown, sunday: unknown): LiturgicalDay =>
    ({
      type: "festum",
      liturgicalClass: 1,
      mass: feast,
      commemorations: [
        { type: "dominica", liturgicalClass: 2, mass: sunday },
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
    expect(calendar[10]![25]!.mass).toBe(christTheKing);
    expect(calendar[10]![26]!.mass).toBe(dominicaXXII);
    expect(calendar[10]![30]!.mass).toBe(dominicaXXII);
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
    expect(calendar[11]![3]!.mass).toBe(dominicaXXIII);
  });

  it("say the Mass of the First Sunday after Pentecost after the Trinity", () => {
    // The Trinity is the thirty-first of May in 2026. That Sunday's file gives
    // the Trinity texts, as the commemoration carries them; its own are handed
    // in.
    const trinity = { title: "Festum Sanctissimæ Trinitatis" };
    const asTrinity = { title: "Dominica I post Pentecosten", prefatio: "trinitate" };
    const dominicaI = { title: "Dominica I post Pentecosten" };
    const calendar = calendarOf({
      "5-31": keptOnSunday(trinity, asTrinity),
      "6-3": feria(),
    });
    applyFerialMass(calendar, 2026, undefined, dominicaI);
    expect(calendar[5]![31]!.mass).toBe(trinity);
    expect(calendar[6]![3]!.mass).toBe(dominicaI);
  });

  it("keep the Mass handed in for the Trinity to that week alone", () => {
    const dominicaI = { title: "Dominica I post Pentecosten" };
    const calendar = calendarOf({
      "10-25": keptOnSunday(christTheKing, dominicaXXII),
      "10-26": feria(),
    });
    applyFerialMass(calendar, 2026, undefined, dominicaI);
    expect(calendar[10]![26]!.mass).toBe(dominicaXXII);
  });

  it("say the feast's Mass where it commemorates no Sunday", () => {
    // Easter is kept as a feast and stands for its Sunday.
    const easter = { title: "Dominica Resurrectionis" };
    const calendar = calendarOf({
      "4-5": withMass("festum", 1, easter),
      "4-13": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[4]![13]!.mass).toBe(easter);
  });

  it("keep the Mass before it where the Sunday has none to give", () => {
    const dominicaXXI = { title: "Dominica XXI post Pentecosten" };
    const calendar = calendarOf({
      "10-18": withMass("dominica", 2, dominicaXXI),
      "10-25": keptOnSunday(christTheKing, undefined),
      "10-26": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[10]![26]!.mass).toBe(dominicaXXI);
  });
});

describe("the Preface of a feria that says its Sunday's Mass", () => {
  const prefatioOf = (day: LiturgicalDay | undefined) =>
    (day?.mass as { prefatio?: string } | undefined)?.prefatio;

  const dominicaXIII = {
    title: "Dominica XIII post Pentecosten",
    prefatio: "trinitate",
  };

  it("is the common Preface where the Sunday says the Trinity's", () => {
    // 26 August 2026 falls in the week of the Thirteenth Sunday after
    // Pentecost; Divinum Officium says the common Preface on it.
    const calendar = calendarOf({
      "8-23": withMass("dominica", 2, dominicaXIII),
      "8-26": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(prefatioOf(calendar[8]![26])).toBe("communis");
    expect(calendar[8]![26]!.mass).toMatchObject({
      title: "Dominica XIII post Pentecosten",
    });
  });

  it("is the common Preface whatever Preface the Sunday names", () => {
    // The Second Sunday after Pentecost, filed with a Preface of the
    // Nativity, is said with the common one on its ferias.
    const dominicaII = { title: "Dominica II post Pentecosten", prefatio: "nat" };
    const calendar = calendarOf({
      "6-7": withMass("dominica", 2, dominicaII),
      "6-9": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(prefatioOf(calendar[6]![9])).toBe("communis");
  });

  it("is the common Preface where a feast took the Sunday", () => {
    const christTheKing = {
      title: "In festo Domini Nostri Jesu Christi Regis",
      prefatio: "regis",
    };
    const dominicaXXII = {
      title: "Dominica XXII post Pentecosten",
      prefatio: "trinitate",
    };
    const calendar = calendarOf({
      "10-25": {
        type: "festum",
        liturgicalClass: 1,
        mass: christTheKing,
        commemorations: [
          { type: "dominica", liturgicalClass: 2, mass: dominicaXXII },
        ],
      } as never,
      "10-27": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(prefatioOf(calendar[10]![27])).toBe("communis");
    expect(prefatioOf(calendar[10]![25])).toBe("regis");
  });

  it("is the common Preface after the Trinity", () => {
    const dominicaI = {
      title: "Dominica I post Pentecosten",
      prefatio: "trinitate",
    };
    const calendar = calendarOf({
      "5-31": withMass("festum", 1, { title: "Festum Sanctissimæ Trinitatis" }),
      "6-3": feria(),
    });
    applyFerialMass(calendar, 2026, undefined, dominicaI);
    expect(prefatioOf(calendar[6]![3])).toBe("communis");
  });

  it("names none where the Sunday names none, saying that of the season", () => {
    // The Sundays of Advent and of paschaltide name no Preface; theirs is
    // the season's, and so is that of their ferias.
    const adventI = { title: "Dominica I Adventus" };
    const calendar = calendarOf({
      "11-29": withMass("dominica", 1, adventI),
      "12-1": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[12]![1]!.mass).toBe(adventI);
  });

  it("leaves the Sunday its own Preface", () => {
    const calendar = calendarOf({
      "8-23": withMass("dominica", 2, dominicaXIII),
      "8-26": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(prefatioOf(calendar[8]![23])).toBe("trinitate");
    expect(dominicaXIII.prefatio).toBe("trinitate");
  });

  it("is one Mass for all the ferias of the week", () => {
    const calendar = calendarOf({
      "8-23": withMass("dominica", 2, dominicaXIII),
      "8-24": feria(),
      "8-28": feria(),
    });
    applyFerialMass(calendar, 2026);
    expect(calendar[8]![24]!.mass).toBe(calendar[8]![28]!.mass);
  });
});

describe("the ferias after the First Sunday after the Epiphany", () => {
  const epiphany = { title: "In Epiphania Domini" };
  const holyFamily = { title: "Sanctæ Familiæ" };
  const inExcelsoThrono = { title: "Dominica I post Epiphaniam" };

  it("says that Sunday's own Mass, not the Sunday's celebration", () => {
    // In 2026 the First Sunday after the Epiphany is the eleventh, kept as the
    // Holy Family; the ferias after it say the Sunday-as-such Mass instead.
    const calendar = calendarOf({
      "1-6": withMass("festum", 1, epiphany),
      "1-7": feria(),
      "1-11": withMass("festum", 2, holyFamily),
      "1-12": feria(),
    });
    applyFerialMass(calendar, 2026, inExcelsoThrono);
    expect(calendar[1]![7]!.mass).toBe(epiphany);
    expect((calendar[1]![12]!.mass as { title: string }).title).toBe(
      "Dominica I post Epiphaniam"
    );
  });

  it("says the Preface of the Epiphany", () => {
    const calendar = calendarOf({
      "1-11": withMass("festum", 2, holyFamily),
      "1-12": feria(),
    });
    applyFerialMass(calendar, 2026, inExcelsoThrono);
    expect((calendar[1]![12]!.mass as { prefatio: string }).prefatio).toBe("epi");
  });

  it("does not alter the Mass it was handed", () => {
    const calendar = calendarOf({ "1-12": feria() });
    applyFerialMass(calendar, 2026, inExcelsoThrono);
    expect(inExcelsoThrono).toEqual({ title: "Dominica I post Epiphaniam" });
  });

  it("leaves those ferias without a Mass where none was handed in", () => {
    const calendar = calendarOf({ "1-12": feria() });
    applyFerialMass(calendar, 2026);
    expect(calendar[1]![12]!.mass).toBeUndefined();
  });
});
