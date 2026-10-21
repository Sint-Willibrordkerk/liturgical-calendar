/**
 * The calendar as generated, read against the rubrics.
 *
 * The assets are bundled into the build, and the generator reads them from a
 * global the bundler defines. Here that global is filled from the YAML files
 * themselves, so the calendar can be generated from the source data.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";
import generateCalendar, { type Language } from "./index";
import type { Calendar } from "./types";
import { colors, seasons } from "./constants";

const ASSETS = "assets";

/** A language package as built from `languages/<code>`, translations only. */
function language(code: string): Language {
  const dir = join("languages", code, "assets", "translations", code);
  const assets: Record<string, unknown> = {};
  for (const file of readdirSync(dir)) {
    assets[`translations/${code}/${file}`] = parse(
      readFileSync(join(dir, file), "utf-8")
    );
  }
  return { code, assets };
}

beforeAll(() => {
  const bundled: Record<string, unknown> = {
    "calendar1962.yml": parse(readFileSync(join(ASSETS, "calendar1962.yml"), "utf-8")),
  };
  for (const file of readdirSync(join(ASSETS, "propers"))) {
    if (!file.endsWith(".yml")) continue;
    bundled[`propers/${file}`] = parse(
      readFileSync(join(ASSETS, "propers", file), "utf-8")
    );
  }
  (globalThis as Record<string, unknown>).bundledAssets = bundled;
});

// 2026: Easter is the 5th of April, Advent begins the 29th of November.
let calendar: Calendar;
const day = (month: number, date: number) => calendar[month]![date]!;

beforeAll(() => {
  calendar = generateCalendar(2026, ["ultrajectum"]);
});

describe("every day of the year", () => {
  it("has a season and a color", () => {
    for (const month of Object.values(calendar)) {
      for (const entry of Object.values(month!)) {
        expect(seasons).toContain(entry!.season);
        expect(colors).toContain(entry!.color);
        for (const commemoration of entry!.commemorations ?? []) {
          expect(commemoration).not.toHaveProperty("season");
          expect(commemoration).not.toHaveProperty("color");
        }
      }
    }
  });

  it("comes out the same when the calendar is generated twice", () => {
    expect(generateCalendar(2026, ["ultrajectum"])).toEqual(calendar);
  });
});

describe("the names of the seasons and the colors", () => {
  it("are absent without a language", () => {
    expect(day(12, 13)).not.toHaveProperty("seasonName");
    expect(day(12, 13)).not.toHaveProperty("colorName");
    expect(day(12, 13)).not.toHaveProperty("alternativeColorName");
  });

  it("come from the language, beside the identifiers", () => {
    const dutch = generateCalendar(2026, [], language("nl"));
    expect(dutch[12]![13]).toMatchObject({
      season: "adventus",
      seasonName: "Advent",
      color: "violet",
      colorName: "paars",
      alternativeColor: "rose",
      alternativeColorName: "roze",
    });
    expect(dutch[6]![14]).toMatchObject({
      seasonName: "Tijd door het jaar",
      colorName: "groen",
    });
    expect(dutch[6]![14]).not.toHaveProperty("alternativeColorName");

    const latin = generateCalendar(2026, [], language("la"));
    expect(latin[4]![3]).toMatchObject({
      seasonName: "Tempus Passionis",
      colorName: "niger",
    });
  });
});

describe("the seasons", () => {
  it("wear their colors on the Sundays and ferias", () => {
    expect(day(1, 2)).toMatchObject({ season: "nativitatis", color: "white" });
    expect(day(1, 7)).toMatchObject({ season: "epiphaniae", color: "white" });
    expect(day(6, 14)).toMatchObject({ season: "per-annum", color: "green" });
    expect(day(2, 1)).toMatchObject({ season: "septuagesimae", color: "violet" });
    expect(day(2, 18)).toMatchObject({ season: "quadragesimae", color: "violet" });
    expect(day(3, 29)).toMatchObject({ season: "passionis", color: "violet" });
    expect(day(4, 12)).toMatchObject({ season: "paschatis", color: "white" });
    expect(day(5, 17)).toMatchObject({ season: "ascensionis", color: "white" });
    expect(day(5, 27)).toMatchObject({ season: "pentecostes", color: "red" });
    expect(day(12, 6)).toMatchObject({ season: "adventus", color: "violet" });
  });

  it("allow rose on Gaudete and Laetare Sunday only", () => {
    expect(day(12, 13)).toMatchObject({
      color: "violet",
      alternativeColor: "rose",
    });
    expect(day(3, 15)).toMatchObject({ color: "violet", alternativeColor: "rose" });
    expect(day(12, 14).alternativeColor).toBeUndefined();
    expect(day(12, 20).alternativeColor).toBeUndefined();
  });
});

describe("the days the rubrics single out", () => {
  it("keep Holy Thursday white, Good Friday black and Holy Saturday violet", () => {
    expect(day(4, 2).color).toBe("white");
    expect(day(4, 3).color).toBe("black");
    expect(day(4, 4).color).toBe("violet");
  });

  it("wear red from the Vigil of Pentecost through its octave", () => {
    expect(day(5, 23).color).toBe("red");
    expect(day(5, 24).color).toBe("red");
    expect(day(5, 30).color).toBe("red");
  });

  it("wear white on Trinity Sunday and the feasts of the Lord", () => {
    expect(day(5, 31)).toMatchObject({ season: "per-annum", color: "white" });
    expect(day(12, 25).color).toBe("white");
    expect(day(1, 6).color).toBe("white");
    expect(day(5, 14).color).toBe("white");
  });

  it("wear black on All Souls", () => {
    expect(day(11, 2).color).toBe("black");
  });

  it("wear violet on the September Ember days and the vigils of the saints", () => {
    expect(day(9, 23).color).toBe("violet");
    expect(day(9, 25).color).toBe("violet");
    expect(day(9, 26).color).toBe("violet");
    expect(day(6, 23).color).toBe("violet");
    expect(day(8, 14).color).toBe("violet");
    expect(day(12, 24).color).toBe("violet");
  });

  it("keep the Vigil of the Ascension white, falling in paschaltide", () => {
    expect(day(5, 13).color).toBe("white");
  });

  it("wear white for Our Lady on Saturday, whatever the season", () => {
    // A Saturday after Pentecost with no feast of its own: the season is green.
    expect(day(6, 27)).toMatchObject({
      title:
        "maria-in-sabbato-a-festo-trinitatis-usque-ad-sabbatum-ante-dominicam-i-adventus",
      season: "per-annum",
      color: "white",
    });
  });
});

describe("the Sunday a feast takes", () => {
  const commemorated = (cal: Calendar, month: number, date: number) =>
    (cal[month]![date]!.commemorations ?? []).map((c) => c.type);

  it("is not commemorated on the feasts of the Lord kept on a Sunday", () => {
    // Trinity on Dominica I post Pentecosten, Christ the King on Dominica XXII.
    for (const cal of [
      calendar,
      generateCalendar(2026, [], language("la")),
      generateCalendar(2026, [], language("nl")),
    ]) {
      expect(commemorated(cal, 5, 31)).not.toContain("dominica");
      expect(commemorated(cal, 10, 25)).not.toContain("dominica");
    }
  });

  it("is commemorated on All Saints", () => {
    expect(day(11, 1).commemorations).toContainEqual(
      expect.objectContaining({ type: "dominica" })
    );
  });
});

describe("the saints", () => {
  it("wear red for the martyrs, the apostles and the Precious Blood", () => {
    expect(day(12, 26).color).toBe("red");
    expect(day(12, 28).color).toBe("red");
    expect(day(6, 29).color).toBe("red");
    expect(day(7, 1).color).toBe("red");
    expect(day(9, 14).color).toBe("red");
    expect(day(1, 16).color).toBe("red");
  });

  it("wear white for the rest, the Dedication of the Apostles' basilicas among them", () => {
    expect(day(1, 14).color).toBe("white");
    expect(day(2, 2).color).toBe("white");
    expect(day(6, 24).color).toBe("white");
    expect(day(9, 29).color).toBe("white");
    expect(day(11, 18).color).toBe("white");
  });

  it("give a commemoration no color: it is not a Mass of its own", () => {
    // St Hilary, white, with a commemoration of St Felix, martyr: the day
    // stays white, and the commemoration says nothing about red.
    const hilary = day(1, 14);
    expect(hilary.color).toBe("white");
    expect(hilary.commemorations).toContainEqual(
      expect.objectContaining({ title: "felicis-presbyteri-et-martyris" })
    );
    expect(hilary.commemorations[0]).not.toHaveProperty("color");
  });

  it("take their color from a local proper as from the calendar", () => {
    expect(day(11, 7)).toMatchObject({ title: "S. Willibrordi", color: "white" });
    expect(day(7, 9)).toMatchObject({
      title: "SS. Martyrum Gorcomiensium",
      color: "red",
    });
  });
});
