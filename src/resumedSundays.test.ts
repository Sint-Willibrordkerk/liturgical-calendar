import { describe, expect, it } from "vitest";
import {
  applyResumedSundays,
  LAST_SUNDAY_MASS,
  NUMBERED_SUNDAYS,
  resumedSundayMass,
  sundayMasses,
} from "./resumedSundays";
import type { Calendar, LiturgicalDay } from "./types";
import { calculateEaster } from "./utils";

describe("applyResumedSundays", () => {
  // 2027: the Trinity is the 23rd of May, Advent begins the 28th of November;
  // 27 Sundays after Pentecost, two kept after the Epiphany, so IV, V and VI
  // are resumed on the 31st of October, the 7th and the 14th of November.
  const year = 2027;
  const sundayOf = (id: string): LiturgicalDay =>
    ({ type: "dominica", id, proper: { id }, commemorations: [] }) as never;

  /** Every Sunday after Pentecost of 2027, Christ the King on the 31st. */
  function calendar2027(): Calendar {
    const out: Calendar = {} as Calendar;
    const date = new Date(year, 4, 23);
    for (; date < new Date(year, 10, 28); date.setDate(date.getDate() + 7)) {
      const [m, d] = [date.getMonth() + 1, date.getDate()];
      out[m] ??= {};
      out[m]![d] = sundayOf(`numbered-${m}-${d}`);
    }
    out[10]![31] = {
      type: "festum",
      id: "christ-the-king",
      proper: { id: "christ-the-king" },
      commemorations: [sundayOf("numbered-10-31")],
    } as never;
    return out;
  }

  // The resumed Masses are read in the season they were left in.
  const septuagesima = calculateEaster(year);
  septuagesima.setDate(septuagesima.getDate() - 63);

  it("gives a Sunday beyond the count its resumed Mass", () => {
    const calendar = calendar2027();
    applyResumedSundays(calendar, year);
    expect(calendar[11]![7]!.proper).toEqual({
      id: resumedSundayMass(5),
      season: septuagesima,
    });
    expect(calendar[11]![21]!.proper?.id).toBe(LAST_SUNDAY_MASS);
  });

  it("leaves a Sunday within the count its own", () => {
    const calendar = calendar2027();
    applyResumedSundays(calendar, year);
    expect(calendar[10]![24]!.proper).toEqual({ id: "numbered-10-24" });
  });

  it("gives a Sunday kept as a feast its Mass in the commemoration", () => {
    const calendar = calendar2027();
    applyResumedSundays(calendar, year);
    const kept = calendar[10]![31]!;
    expect(kept.proper).toEqual({ id: "christ-the-king" });
    expect(kept.id).toBe("christ-the-king");
    expect(kept.commemorations[0]!.proper?.id).toBe(resumedSundayMass(4));
  });

  it("leaves the Sunday its own name, the one it says the Mass on", () => {
    // The twenty-fifth Sunday after Pentecost is still called so; only the
    // Mass said on it is another Sunday's.
    const calendar = calendar2027();
    const naming = { template: "dominica-$count-post-pentecosten", count: 25 };
    calendar[11]![7]!.naming = naming;
    calendar[10]![31]!.commemorations[0]!.naming = { ...naming, count: 24 };
    applyResumedSundays(calendar, year);
    expect(calendar[11]![7]!.id).toBe("numbered-11-7");
    expect(calendar[11]![7]!.naming).toEqual(naming);
    expect(calendar[10]![31]!.commemorations[0]!.id).toBe("numbered-10-31");
    expect(calendar[10]![31]!.commemorations[0]!.naming).toEqual({ ...naming, count: 24 });
  });
});

describe("sundayMasses", () => {
  it("leaves the numbered Sundays to say their own Mass", () => {
    const masses = sundayMasses(24, 6);
    expect(masses.slice(0, NUMBERED_SUNDAYS)).toEqual(
      Array(NUMBERED_SUNDAYS).fill(undefined)
    );
  });

  it("gives the last Sunday before Advent the Mass of the last", () => {
    for (const total of [24, 25, 28]) {
      expect(sundayMasses(total, 2)[total - 1]).toBe(LAST_SUNDAY_MASS);
    }
  });

  it("resumes the Sundays Septuagesima cut short, in their order", () => {
    // Three kept after the Epiphany leaves IV, V and VI; a year of 27 Sundays
    // has room for all three.
    const masses = sundayMasses(27, 3);
    expect(masses.slice(NUMBERED_SUNDAYS, 26)).toEqual([
      resumedSundayMass(4),
      resumedSundayMass(5),
      resumedSundayMass(6),
    ]);
    expect(masses[26]).toBe(LAST_SUNDAY_MASS);
  });

  it("leaves out the earliest where there is not room for all", () => {
    // Room for two of the three omitted: IV gives way.
    expect(sundayMasses(26, 3).slice(NUMBERED_SUNDAYS, 25)).toEqual([
      resumedSundayMass(5),
      resumedSundayMass(6),
    ]);
  });

  it("resumes none in a year short enough not to need any", () => {
    const masses = sundayMasses(24, 3);
    expect(masses.filter((m) => m === LAST_SUNDAY_MASS)).toHaveLength(1);
    expect(masses.filter((m) => m?.includes("superfuit"))).toHaveLength(0);
  });

  it("has nothing to say about a year with no such Sundays", () => {
    expect(sundayMasses(0, 6)).toEqual([]);
  });
});
