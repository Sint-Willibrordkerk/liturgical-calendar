import { describe, expect, it } from "vitest";
import { idOf, nameDay, nameDays } from "./naming";
import type { Calendar, LiturgicalDay } from "./types";

// 29 November 2026 is a Sunday; 19 February a Thursday; 30 March a Monday.
const sunday = new Date(2026, 10, 29);

describe("idOf", () => {
  it("fills the count in with the Latin numeral, lowercase, so it stays a slug", () => {
    expect(idOf("dominica-$count-adventus", 1, sunday)).toBe("dominica-i-adventus");
    expect(idOf("dominica-$count-post-pentecosten", 25, sunday)).toBe("dominica-xxv-post-pentecosten");
  });

  it("fills a weekday in by its numeral, or by its ordinal spelled out", () => {
    expect(idOf("$day-post-cineres", 1, new Date(2026, 1, 19))).toBe("feria-v-post-cineres");
    expect(idOf("$feria-majoris-hebdomadae", 1, new Date(2026, 2, 30))).toBe(
      "feria-secunda-majoris-hebdomadae"
    );
  });

  it("leaves an id with nothing to fill as it is", () => {
    expect(idOf("andreae-apostoli", 1, sunday)).toBe("andreae-apostoli");
  });
});

describe("nameDay", () => {
  it("is the language's name for the day", () => {
    expect(
      nameDay("dominica-$count-adventus", 1, sunday, { "dominica-i-adventus": "Eerste zondag van de Advent" })
    ).toBe("Eerste zondag van de Advent");
  });

  it("fills a translated template in with the language's numerals and weekdays", () => {
    expect(
      nameDay("dominica-$count-post-pentecosten", 2, sunday, {
        "dominica-$count-post-pentecosten": "$count zondag na Pinksteren",
        II: "Tweede",
      })
    ).toBe("Tweede zondag na Pinksteren");
    expect(nameDay("$day-post-cineres", 1, new Date(2026, 1, 19), {
      "$day-post-cineres": "$day na Aswoensdag",
      "Feria V": "Donderdag",
    })).toBe("Donderdag na Aswoensdag");
  });

  it("is nothing where the language has no name for the day", () => {
    expect(nameDay("dominica-$count-adventus", 1, sunday, {})).toBeUndefined();
    expect(nameDay("dominica-$count-adventus", 1, sunday)).toBeUndefined();
  });
});

describe("nameDays", () => {
  const dayOf = (day: Partial<LiturgicalDay>): Calendar =>
    ({ 11: { 29: { commemorations: [], ...day } } }) as never;

  it("names a day in the language", () => {
    const calendar = dayOf({
      id: "dominica-i-adventus",
      naming: { template: "dominica-$count-adventus", count: 1 },
    });
    nameDays(calendar, 2026, { "dominica-i-adventus": "Eerste zondag van de Advent" });
    expect(calendar[11]![29]!.title).toBe("Eerste zondag van de Advent");
  });

  it("names a day the language has no name for by its Mass", () => {
    const calendar = dayOf({
      id: "dominica-i-adventus",
      naming: { template: "dominica-$count-adventus", count: 1 },
      mass: { title: "Dominica I Adventus" },
    });
    nameDays(calendar, 2026, {});
    expect(calendar[11]![29]!.title).toBe("Dominica I Adventus");
  });

  it("gives a day nothing names no title, leaving it its id", () => {
    const calendar = dayOf({ id: "sabbato-sancto", naming: { template: "sabbato-sancto", count: 1 } });
    nameDays(calendar, 2026, {});
    expect(calendar[11]![29]).not.toHaveProperty("title");
    expect(calendar[11]![29]!.id).toBe("sabbato-sancto");
  });

  it("names the commemorations as the day", () => {
    const calendar = dayOf({
      commemorations: [
        { id: "andreae-apostoli", liturgicalClass: 3, naming: { template: "andreae-apostoli", count: 1 } },
      ],
    });
    nameDays(calendar, 2026, { "andreae-apostoli": "H. Andreas" });
    expect(calendar[11]![29]!.commemorations[0]!.title).toBe("H. Andreas");
  });

  it("names the season and the colors beside their identifiers", () => {
    const calendar = dayOf({ season: "adventus", color: "violet", alternativeColor: "rose" });
    nameDays(calendar, 2026, { adventus: "Advent", violet: "paars", rose: "roze" });
    expect(calendar[11]![29]).toMatchObject({
      seasonName: "Advent",
      colorName: "paars",
      alternativeColorName: "roze",
    });
  });
});
