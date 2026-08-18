import { describe, expect, it } from "vitest";
import {
  applyFerialMass,
  borrowsItsMass,
  firstSundayAfterEpiphany,
} from "./ferias";
import type { Calendar, LiturgicalDay } from "./types";

const feria = (): LiturgicalDay =>
  ({ type: "feria", liturgicalClass: 4, commemorations: [] }) as LiturgicalDay;

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

  it("is not a day of a higher class", () => {
    expect(borrowsItsMass(withMass("feria", 3, undefined))).toBe(false);
    expect(borrowsItsMass(withMass("festum", 4, undefined))).toBe(false);
    expect(borrowsItsMass(withMass("dominica", 2, undefined))).toBe(false);
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
