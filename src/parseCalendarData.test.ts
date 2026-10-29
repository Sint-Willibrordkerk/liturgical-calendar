import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";
import { parseCalendarData } from "./parseCalendarData";
import type { Calendar, LiturgicalDay } from "./types";

/**
 * The days of the year as the calendar and the local propers place them, the
 * same in every language: which is kept and which commemorated, its color and
 * season, and where its Mass is filed. Read from the shipped calendar.
 */
beforeAll(() => {
  const bundled: Record<string, unknown> = {
    "calendar1962.yml": parse(readFileSync(join("assets", "calendar1962.yml"), "utf-8")),
  };
  for (const file of readdirSync(join("assets", "propers"))) {
    if (!file.endsWith(".yml")) continue;
    bundled[`propers/${file}`] = parse(readFileSync(join("assets", "propers", file), "utf-8"));
  }
  (globalThis as Record<string, unknown>).bundledAssets = bundled;
});

let general: Calendar;
let utrecht: Calendar;
beforeAll(() => {
  general = parseCalendarData(2026, []);
  utrecht = parseCalendarData(2026, ["ultrajectum"]);
});

const day = (calendar: Calendar, month: number, date: number) => calendar[month]![date]!;

/** Every day of the calendar, in no particular order. */
const daysOf = (calendar: Calendar): LiturgicalDay[] =>
  Object.values(calendar).flatMap((month) => Object.values(month ?? {}) as LiturgicalDay[]);

describe("parseCalendarData", () => {
  it("places every day of the year", () => {
    expect(daysOf(general)).toHaveLength(365);
  });

  it("reads no Mass, no Office and no name: those are the languages'", () => {
    for (const entry of daysOf(general)) {
      expect(entry.mass).toBeUndefined();
      expect(entry.officium).toBeUndefined();
      expect(entry.title).toBeUndefined();
      for (const commemoration of entry.commemorations) {
        expect(commemoration.mass).toBeUndefined();
        expect(commemoration.title).toBeUndefined();
      }
    }
  });

  describe("a day's id and where its Mass is filed", () => {
    it("gives the day the id the calendar writes, its count filled in", () => {
      // The First Sunday of Advent, 29 November 2026.
      expect(day(general, 11, 29)).toMatchObject({
        id: "dominica-i-adventus",
        naming: { template: "dominica-$count-adventus", count: 1 },
      });
    });

    it("files the Mass under the day's id", () => {
      expect(day(general, 11, 29).proper).toEqual({ id: "dominica-i-adventus" });
      expect(day(general, 12, 13).proper).toEqual({ id: "dominica-iii-adventus" });
      expect(day(general, 4, 4).proper).toEqual({ id: "sabbato-sancto" });
    });

    it("fills a weekday in by its numeral, or by its ordinal spelled out", () => {
      // 19 February 2026, the Thursday after Ash Wednesday; 30 March, Monday
      // of Holy Week.
      expect(day(general, 2, 19)).toMatchObject({
        id: "feria-v-post-cineres",
        proper: { id: "feria-v-post-cineres" },
        naming: { template: "$day-post-cineres", count: 1 },
      });
      expect(day(general, 3, 30)).toMatchObject({
        id: "feria-secunda-majoris-hebdomadae",
        proper: { id: "feria-secunda-majoris-hebdomadae" },
      });
    });

    it("keeps the count of a day that recurs", () => {
      // The Twenty-second Sunday after Pentecost, which Christ the King took.
      expect(day(general, 10, 25).commemorations[0]!.naming).toEqual({
        template: "dominica-$count-post-pentecosten",
        count: 22,
      });
    });

    it("leaves a feria without an id nowhere to read a Mass from", () => {
      // A Wednesday per annum; its Mass is borrowed from the Sunday later on.
      const feria = day(general, 8, 26);
      expect(feria.type).toBe("feria");
      expect(feria.id).toBeUndefined();
      expect(feria.proper).toBeUndefined();
      expect(feria.naming).toBeUndefined();
    });
  });

  describe("a day that gives way", () => {
    it("is commemorated, with where its own Mass is filed", () => {
      // Christ the King took the twenty-fifth of October in 2026.
      const kept = day(general, 10, 25);
      expect(kept.proper).toEqual({ id: "in-festo-domini-nostri-jesu-christi-regis-10-du" });
      expect(kept.commemorations[0]).toMatchObject({
        type: "dominica",
        id: "dominica-xxii-post-pentecosten",
        proper: { id: "dominica-xxii-post-pentecosten" },
      });
    });

    it("leaves its season and color to the day kept", () => {
      const [sunday] = day(general, 10, 25).commemorations;
      expect(sunday).not.toHaveProperty("season");
      expect(sunday).not.toHaveProperty("color");
      expect(sunday).not.toHaveProperty("alternativeColor");
    });
  });

  describe("the season and the color", () => {
    it("takes the season from the date and the color from the day", () => {
      expect(day(general, 11, 29)).toMatchObject({ season: "adventus", color: "violet" });
      expect(day(general, 10, 25)).toMatchObject({ season: "per-annum", color: "white" });
      expect(day(general, 8, 26)).toMatchObject({ season: "per-annum", color: "green" });
    });

    it("allows rose on Gaudete Sunday alone", () => {
      expect(day(general, 12, 13).alternativeColor).toBe("rose");
      expect(day(general, 11, 29).alternativeColor).toBeUndefined();
    });
  });

  describe("a local proper", () => {
    it("lays its own days over the general calendar", () => {
      // St Willibrord on 7 November, which the general calendar keeps as Our
      // Lady on Saturday.
      expect(day(general, 11, 7).id).toBe(
        "maria-in-sabbato-a-festo-trinitatis-usque-ad-sabbatum-ante-dominicam-i-adventus"
      );
      expect(day(utrecht, 11, 7)).toMatchObject({
        type: "festum",
        liturgicalClass: 1,
        id:
          "willibrordi-episcopi-et-confessoris-titularis-ecclesiae-metropolitanae-et-patroni-principalis-archidioecesis",
      });
    });

    it("files its own days under its local calendars, most particular first", () => {
      expect(day(utrecht, 11, 7).proper?.local).toEqual(["Neerlandia/Ultrajectum", "Neerlandia"]);
      expect(day(utrecht, 7, 9).proper).toEqual({
        id: "martyrum-gorcomiensium",
        local: ["Neerlandia/Ultrajectum", "Neerlandia"],
      });
    });

    it("leaves the general days filed under the general trees", () => {
      expect(day(utrecht, 11, 29).proper).toEqual({ id: "dominica-i-adventus" });
      expect(day(utrecht, 11, 7).commemorations[0]!.proper).not.toHaveProperty("local");
    });
  });

  describe("its arguments and its data", () => {
    it("leaves the list of propers it was handed as it was", () => {
      const propers = ["fsspx", "ultrajectum"];
      parseCalendarData(2026, propers);
      expect(propers).toEqual(["fsspx", "ultrajectum"]);
    });

    it("gives the same days each time it is asked", () => {
      expect(parseCalendarData(2026, [])).toEqual(general);
      expect(parseCalendarData(2026, ["ultrajectum"])).toEqual(utrecht);
    });
  });
});
