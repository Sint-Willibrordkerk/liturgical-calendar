import { describe, expect, it } from "vitest";
import {
  SEASON_COLORS,
  defaultColor,
  mayWearRose,
  seasonOf,
} from "./seasons";
import { calculateAdvent, calculateEaster } from "./utils";
import type { Season } from "./types";

// 2026: Easter is the 5th of April, Advent begins the 29th of November.
const YEAR = 2026;
const easter = calculateEaster(YEAR);
const advent = calculateAdvent(YEAR);
const on = (month: number, day: number) => new Date(YEAR, month - 1, day);
const season = (month: number, day: number): Season =>
  seasonOf(on(month, day), easter, advent);

describe("seasonOf", () => {
  it("gives Christmas and the days to the fifth of January to the Nativity", () => {
    expect(season(12, 25)).toBe("nativitatis");
    expect(season(12, 31)).toBe("nativitatis");
    expect(season(1, 1)).toBe("nativitatis");
    expect(season(1, 5)).toBe("nativitatis");
  });

  it("gives the Epiphany to the thirteenth of January to the Epiphany", () => {
    expect(season(1, 6)).toBe("epiphaniae");
    expect(season(1, 13)).toBe("epiphaniae");
  });

  it("begins the time after the Epiphany on the fourteenth of January", () => {
    expect(season(1, 14)).toBe("per-annum");
    // The Saturday before Septuagesima, which is the 1st of February.
    expect(season(1, 31)).toBe("per-annum");
  });

  it("runs Septuagesima from its Sunday to Shrove Tuesday", () => {
    expect(season(2, 1)).toBe("septuagesimae");
    expect(season(2, 17)).toBe("septuagesimae");
  });

  it("runs Lent from Ash Wednesday to the Saturday before Passion Sunday", () => {
    expect(season(2, 18)).toBe("quadragesimae");
    expect(season(3, 21)).toBe("quadragesimae");
  });

  it("runs Passiontide from Passion Sunday through Holy Saturday", () => {
    expect(season(3, 22)).toBe("passionis");
    expect(season(3, 29)).toBe("passionis"); // Palm Sunday
    expect(season(4, 4)).toBe("passionis"); // Holy Saturday
  });

  it("runs Eastertide from Easter to the Vigil of the Ascension", () => {
    expect(season(4, 5)).toBe("paschatis");
    expect(season(5, 13)).toBe("paschatis");
  });

  it("runs Ascensiontide from the Ascension to the Vigil of Pentecost", () => {
    expect(season(5, 14)).toBe("ascensionis");
    expect(season(5, 23)).toBe("ascensionis");
  });

  it("gives Pentecost and its octave their own season", () => {
    expect(season(5, 24)).toBe("pentecostes");
    expect(season(5, 30)).toBe("pentecostes");
  });

  it("resumes the time after Pentecost on Trinity Sunday", () => {
    expect(season(5, 31)).toBe("per-annum");
    expect(season(11, 28)).toBe("per-annum");
  });

  it("runs Advent from its first Sunday to the Vigil of the Nativity", () => {
    expect(season(11, 29)).toBe("adventus");
    expect(season(12, 24)).toBe("adventus");
  });

  it("reads a reckoned date the way it was built, whatever the timezone", () => {
    // Easter is reckoned in UTC and the day is local; an offset between the
    // two must not move Easter Sunday itself into Passiontide.
    expect(seasonOf(new Date(YEAR, 3, 5, 0, 30), easter, advent)).toBe(
      "paschatis"
    );
    expect(seasonOf(new Date(YEAR, 3, 4, 23, 30), easter, advent)).toBe(
      "passionis"
    );
  });
});

describe("defaultColor", () => {
  it("is white for a feast, whatever the season", () => {
    expect(defaultColor("festum", "quadragesimae")).toBe("white");
    expect(defaultColor("festum", "pentecostes")).toBe("white");
  });

  it("is violet for a vigil outside paschaltide and the season's within it", () => {
    expect(defaultColor("vigilia", "per-annum")).toBe("violet");
    expect(defaultColor("vigilia", "adventus")).toBe("violet");
    expect(defaultColor("vigilia", "paschatis")).toBe("white");
  });

  it("is the season's color for a Sunday, a feria or a day of an octave", () => {
    expect(defaultColor("dominica", "adventus")).toBe("violet");
    expect(defaultColor("feria", "per-annum")).toBe("green");
    expect(defaultColor("octava", "pentecostes")).toBe("red");
    expect(defaultColor("octava", "nativitatis")).toBe("white");
  });

  it("knows every season's color", () => {
    expect(Object.values(SEASON_COLORS)).toHaveLength(10);
  });
});

describe("mayWearRose", () => {
  it("allows rose on Gaudete Sunday, the third of Advent", () => {
    expect(mayWearRose(on(12, 13), easter, advent)).toBe(true);
    expect(mayWearRose(on(12, 6), easter, advent)).toBe(false);
    expect(mayWearRose(on(12, 14), easter, advent)).toBe(false);
  });

  it("allows rose on Laetare Sunday, the fourth of Lent", () => {
    expect(mayWearRose(on(3, 15), easter, advent)).toBe(true);
    expect(mayWearRose(on(3, 8), easter, advent)).toBe(false);
    expect(mayWearRose(on(3, 22), easter, advent)).toBe(false);
  });
});
