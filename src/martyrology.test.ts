import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import generateCalendar, { type Language } from "./index";
import { lunaOf, martyrologyDateOf, movableDayOf } from "./martyrology";

describe("the age of the moon", () => {
  // Divinum Officium's own reckoning, from the tables of the Martyrology.
  it.each([
    [2026, 1, 21, 2],
    [2026, 4, 5, 17],
    [2026, 12, 25, 16],
    [2026, 12, 31, 22],
    [2027, 1, 1, 23],
    [2027, 1, 10, 2],
    [2025, 6, 15, 18],
    [1999, 3, 3, 16],
    [1700, 1, 1, 10],
    [1600, 7, 1, 20],
    [2299, 12, 31, 9],
  ])("on %i-%i-%i is %i", (year, month, day, luna) => {
    expect(lunaOf(year, month, day)).toBe(luna);
  });

  it("is reckoned a day short in January of the first year of the cycle", () => {
    // 2033 has the golden number 1.
    expect(lunaOf(2033, 1, 1)).toBe(29);
    expect(lunaOf(2033, 1, 2)).toBe(1);
    expect(lunaOf(2033, 1, 31)).toBe(30);
    expect(lunaOf(2033, 2, 1)).toBe(1);
  });

  it("is the same on the doubled sixth day before the Kalends of March", () => {
    // In a leap year "bis pronuntiatur Sexto Kalendas Martii, et eadem Luna,
    // scilicet die 24 et 25".
    expect(lunaOf(2028, 2, 23)).toBe(27);
    expect(lunaOf(2028, 2, 24)).toBe(28);
    expect(lunaOf(2028, 2, 25)).toBe(28);
    expect(lunaOf(2028, 2, 26)).toBe(29);
    expect(lunaOf(2028, 3, 1)).toBe(4);
  });

  it("is not reckoned outside the years the tables cover", () => {
    expect(lunaOf(1581, 6, 1)).toBeUndefined();
    expect(lunaOf(2300, 6, 1)).toBeUndefined();
  });
});

describe("the date the Martyrology reads", () => {
  it("is the day's own", () => {
    expect(martyrologyDateOf(2026, 1, 21)).toBe("01-21");
    expect(martyrologyDateOf(2026, 2, 24)).toBe("02-24");
    expect(martyrologyDateOf(2026, 3, 1)).toBe("03-01");
  });

  it("keeps the leap day on the 24th of February, and defers the rest", () => {
    expect(martyrologyDateOf(2028, 2, 23)).toBe("02-23");
    expect(martyrologyDateOf(2028, 2, 24)).toBe("02-29");
    expect(martyrologyDateOf(2028, 2, 25)).toBe("02-24");
    expect(martyrologyDateOf(2028, 2, 29)).toBe("02-28");
    expect(martyrologyDateOf(2028, 3, 1)).toBe("03-01");
  });
});

describe("the movable day", () => {
  // 2026: Easter is the 5th of April, Advent begins the 29th of November.
  it.each([
    [11, 29, "adv1-0"],
    [2, 1, "quadp1-0"],
    [2, 18, "quadp3-3"],
    [3, 22, "quad5-0"],
    [3, 27, "quad5-5"],
    [3, 29, "quad6-0"],
    [4, 2, "quad6-4"],
    [4, 6, "pasc0-1"],
    [4, 12, "pasc1-0"],
    [5, 11, "pasc5-1"],
    [5, 13, "pasc5-3"],
    [5, 14, "pasc5-4"],
    [5, 23, "pasc6-6"],
    [5, 24, "pasc7-0"],
    [5, 31, "pent01-0"],
    [6, 4, "pent01-4"],
    [6, 12, "pent02-5"],
  ])("on %i-%i is %s", (month, day, key) => {
    expect(movableDayOf(2026, month, day)).toBe(key);
  });

  it("is Christ the King on the last Sunday of October", () => {
    expect(movableDayOf(2026, 10, 25)).toBe("10-du");
    expect(movableDayOf(2027, 10, 31)).toBe("10-du");
    expect(movableDayOf(2026, 10, 18)).not.toBe("10-du");
  });

  it("is the Holy Name on the Sunday between the 2nd and 5th of January", () => {
    expect(movableDayOf(2026, 1, 4)).toBe("nat1-0");
    // 2023 has no such Sunday — the 1st is one — so the feast is kept on the 2nd.
    expect(movableDayOf(2023, 1, 2)).toBe("nat1-0");
    expect(movableDayOf(2023, 1, 1)).toBeUndefined();
  });

  it("is the Holy Family on the Sunday after the Epiphany", () => {
    expect(movableDayOf(2026, 1, 11)).toBe("nat2-0");
    expect(movableDayOf(2030, 1, 13)).toBe("nat2-0");
  });

  it("names the week of a day after Pentecost whether or not it is announced", () => {
    expect(movableDayOf(2026, 8, 15)).toBe("pent11-6");
  });

  it("is nothing where the weeks are not counted", () => {
    // After the Epiphany, before Septuagesima; after Christmas.
    expect(movableDayOf(2026, 1, 21)).toBeUndefined();
    expect(movableDayOf(2026, 12, 26)).toBeUndefined();
  });
});

describe("the Martyrology in the calendar", () => {
  const martyrology: Language = {
    code: "la",
    assets: {
      martyrologium: {
        "01-20": { titulus: "Tertiodécimo Kaléndas Februárii", elogia: ["Romæ natális sancti Fabiáni."] },
        "01-21": {
          titulus: "Duodécimo Kaléndas Februárii",
          elogia: ["Romæ pássio sanctæ Agnétis.", "Athénis natális sancti Públii."],
        },
        "04-06": { titulus: "Octávo Idus Aprílis", elogia: ["In Ægýpto sancti Timóthei."] },
        "02-29": { titulus: "Sexto Kaléndas Mártii" },
        "02-24": { titulus: "Sexto Kaléndas Mártii", elogia: ["In Judǽa natális sancti Matthíæ."] },
        mobile: { "pasc0-1": ["Hac die quam fecit Dóminus."] },
        conclusio: { versus: "Et álibi aliórum.", responsum: "Deo grátias." },
      },
      translations: { luna: { "luna-2": "Luna secúnda" } },
    },
  };

  beforeAll(() => {
    const bundled: Record<string, unknown> = {
      "calendar1962.yml": parse(readFileSync(join("assets", "calendar1962.yml"), "utf-8")),
    };
    for (const file of readdirSync(join("assets", "propers"))) {
      if (file.endsWith(".yml")) {
        bundled[`propers/${file}`] = parse(readFileSync(join("assets", "propers", file), "utf-8"));
      }
    }
    (globalThis as Record<string, unknown>).bundledAssets = bundled;
  });

  it("is read only when asked for", () => {
    const calendar = generateCalendar({ year: 2026, languages: [martyrology] });
    expect(calendar[1]![21]!.martyrologium).toBeUndefined();
  });

  it("gives a day the reading printed under its date", () => {
    const calendar = generateCalendar({ year: 2026, languages: [martyrology], martyrologium: true });
    expect(calendar[1]![21]!.martyrologium).toEqual({
      titulus: "Duodécimo Kaléndas Februárii",
      luna: 2,
      lunaName: "Luna secúnda",
      elogia: ["Romæ pássio sanctæ Agnétis.", "Athénis natális sancti Públii."],
      conclusio: { versus: "Et álibi aliórum.", responsum: "Deo grátias." },
    });
  });

  it("puts a movable day's announcement before the entries", () => {
    const calendar = generateCalendar({ year: 2026, languages: [martyrology], martyrologium: true });
    expect(calendar[4]![6]!.martyrologium!.mobile).toEqual(["Hac die quam fecit Dóminus."]);
    expect(calendar[1]![20]!.martyrologium!.mobile).toBeUndefined();
  });

  it("reads the doubled day in a leap year", () => {
    const calendar = generateCalendar({ year: 2028, languages: [martyrology], martyrologium: true });
    expect(calendar[2]![24]!.martyrologium!.titulus).toBe("Sexto Kaléndas Mártii");
    expect(calendar[2]![24]!.martyrologium!.elogia).toEqual([]);
    expect(calendar[2]![25]!.martyrologium!.elogia).toEqual(["In Judǽa natális sancti Matthíæ."]);
  });

  it("leaves a day the language has no Martyrology for without one", () => {
    const calendar = generateCalendar({ year: 2026, languages: [martyrology], martyrologium: true });
    expect(calendar[8]![15]!.martyrologium).toBeUndefined();
    const bare = generateCalendar({ year: 2026, languages: [{ code: "nl", assets: {} }], martyrologium: true });
    expect(bare[1]![21]!.martyrologium).toBeUndefined();
  });

  describe("with fallback languages", () => {
    const dutch: Language = {
      code: "nl",
      assets: {
        martyrologium: {
          "01-21": {
            titulus: "Twaalfde dag voor de Kalenden van februari",
            elogia: ["Te Rome het lijden van de heilige Agnes."],
          },
        },
        translations: { luna: { "luna-2": "Maan twee" } },
      },
    };
    const options = { martyrologium: true };

    it("reads a date whole from the first language that prints it, and names the rest", () => {
      const reading = generateCalendar({ year: 2026, languages: [dutch, martyrology], ...options })[1]![21]!.martyrologium;
      expect(reading).toEqual({
        titulus: "Twaalfde dag voor de Kalenden van februari",
        luna: 2,
        lunaName: "Maan twee",
        elogia: ["Te Rome het lijden van de heilige Agnes."],
        conclusio: { versus: "Et álibi aliórum.", responsum: "Deo grátias." },
        fallback: { conclusio: "la" },
      });
    });

    it("reads a date only a fallback prints in that language, and names what it said", () => {
      const reading = generateCalendar({ year: 2026, languages: [dutch, martyrology], ...options })[1]![20]!.martyrologium;
      expect(reading).toMatchObject({
        titulus: "Tertiodécimo Kaléndas Februárii",
        elogia: ["Romæ natális sancti Fabiáni."],
        fallback: { titulus: "la", elogia: "la", conclusio: "la" },
      });
    });

    it("says the whole Martyrology in the fallback where the language has none", () => {
      const calendar = generateCalendar({ year: 2026, languages: [{ code: "nl", assets: {} }, martyrology], ...options });
      expect(calendar[1]![21]!.martyrologium).toMatchObject({
        titulus: "Duodécimo Kaléndas Februárii",
        lunaName: "Luna secúnda",
        fallback: { titulus: "la", elogia: "la", lunaName: "la", conclusio: "la" },
      });
      expect(calendar[4]![6]!.martyrologium).toMatchObject({
        mobile: ["Hac die quam fecit Dóminus."],
        fallback: { mobile: "la" },
      });
    });

    it("carries no marker where the language says the whole reading itself", () => {
      const calendar = generateCalendar({ year: 2026, languages: [martyrology, dutch], ...options });
      expect(calendar[1]![21]!.martyrologium).not.toHaveProperty("fallback");
    });

    it("leaves a date none of them prints without a reading", () => {
      const calendar = generateCalendar({ year: 2026, languages: [dutch, martyrology], ...options });
      expect(calendar[8]![15]!.martyrologium).toBeUndefined();
    });
  });
});
