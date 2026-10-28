import { describe, expect, it } from "vitest";
import { nameDay, nameDays } from "./naming";
import type { Calendar, LiturgicalDay } from "./types";

describe("nameDay", () => {
  // 29 November 2026 is a Sunday.
  const sunday = new Date(2026, 10, 29);

  it("fills a slug in with the Latin, so it stays a slug", () => {
    expect(nameDay("dominica-$count-adventus", 1, sunday)).toBe("dominica-i-adventus");
  });

  it("takes the translation of the filled slug", () => {
    expect(
      nameDay("dominica-$count-adventus", 1, sunday, { "dominica-i-adventus": "Eerste zondag van de Advent" })
    ).toBe("Eerste zondag van de Advent");
  });

  it("fills a written title in with the language's numerals and weekdays", () => {
    expect(nameDay("$day post $count", 2, sunday, { Dominica: "Zondag", II: "2" })).toBe("Zondag post 2");
  });
});

describe("nameDays", () => {
  const dayOf = (day: Partial<LiturgicalDay>): Calendar =>
    ({ 11: { 29: { commemorations: [], ...day } } }) as never;

  it("names a day in the language", () => {
    const calendar = dayOf({ naming: { template: "dominica-$count-adventus", count: 1 } });
    nameDays(calendar, 2026, { "dominica-i-adventus": "Eerste zondag van de Advent" });
    expect(calendar[11]![29]!.title).toBe("Eerste zondag van de Advent");
  });

  it("gives a slug the language has no name for the title of its Mass", () => {
    const calendar = dayOf({
      naming: { template: "dominica-$count-adventus", count: 1 },
      mass: { title: "Dominica I Adventus" },
    });
    nameDays(calendar, 2026, {});
    expect(calendar[11]![29]!.title).toBe("Dominica I Adventus");
  });

  it("keeps a slug where there is no Mass to name it", () => {
    const calendar = dayOf({ naming: { template: "sabbato-sancto", count: 1 } });
    nameDays(calendar, 2026, {});
    expect(calendar[11]![29]!.title).toBe("sabbato-sancto");
  });

  it("names the commemorations as the day", () => {
    const calendar = dayOf({
      commemorations: [{ liturgicalClass: 3, naming: { template: "andreae-apostoli", count: 1 } }],
    });
    nameDays(calendar, 2026, { "andreae-apostoli": "H. Andreas" });
    expect(calendar[11]![29]!.commemorations[0]!.title).toBe("H. Andreas");
  });

  it("leaves a day named for good as it is", () => {
    const calendar = dayOf({ title: "Dominica XXIV et ultima post Pentecosten" });
    nameDays(calendar, 2026, { "Dominica XXIV et ultima post Pentecosten": "anders" });
    expect(calendar[11]![29]!.title).toBe("Dominica XXIV et ultima post Pentecosten");
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
