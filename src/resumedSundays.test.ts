import { describe, expect, it } from "vitest";
import {
  LAST_SUNDAY_MASS,
  NUMBERED_SUNDAYS,
  resumedSundayMass,
  sundayMasses,
} from "./resumedSundays";

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
