import { describe, expect, it } from "vitest";
import { publish } from "./publish";
import { dayTypes, liturgicalClasses } from "./constants";
import type { WorkingCommemoration, WorkingDay } from "./types";
import { calendarAssets } from "../scripts/assets.mjs";

/**
 * A day is settled with more on it than it is published with: how it is
 * commemorated, what it admits, where its Mass is filed. What is published is
 * a day of its own shape, built from the settled one, with none of that on it.
 */
describe("a settled day, published", () => {
  const working = (fields: Partial<WorkingCommemoration> = {}): WorkingCommemoration => ({
    id: "agnetis-virginis-et-martyris",
    title: "S. Agnetis",
    type: "festum",
    liturgicalClass: 3,
    commemorated: "ordinary",
    admits: { count: 2 },
    omittedOn: [{ type: "dominica" }],
    honours: ["agnetis"],
    ofTheSeason: false,
    proper: { id: "agnetis-virginis-et-martyris" },
    naming: { template: "agnetis-virginis-et-martyris", count: 1 },
    mass: { oratio: { text: "Omnípotens" } },
    ...fields,
  });
  const day = (fields: Partial<WorkingDay> = {}): WorkingDay => ({
    ...working(),
    season: "per-annum",
    color: "red",
    commemorations: [],
    ...fields,
  });

  it("carries what the day is, and nothing it was settled with", () => {
    expect(publish(day())).toEqual({
      id: "agnetis-virginis-et-martyris",
      title: "S. Agnetis",
      type: "festum",
      liturgicalClass: 3,
      color: "red",
      mass: { oratio: { text: "Omnípotens" } },
      season: "per-annum",
    });
  });

  it("reads in the same order every time, whatever order the day was settled in", () => {
    const full = day({
      seasonName: "Tijd door het jaar",
      colorName: "rood",
      alternativeColor: "rose",
      alternativeColorName: "roze",
      officium: { oratio: { text: "Omnípotens" } },
      martyrologium: { titulus: "Duodécimo Kaléndas Februárii", elogia: [] },
      commemorations: [working({ id: "feria" })],
    });
    const reversed = Object.fromEntries(Object.entries(full).reverse()) as WorkingDay;
    const order = [
      "id",
      "title",
      "type",
      "liturgicalClass",
      "color",
      "mass",
      "officium",
      "season",
      "alternativeColor",
      "commemorations",
      "martyrologium",
      "seasonName",
      "colorName",
      "alternativeColorName",
    ];
    expect(Object.keys(publish(full))).toEqual(order);
    expect(Object.keys(publish(reversed))).toEqual(order);
  });

  it("has no key for what the day has not: no title, no Mass, no commemorations", () => {
    const bare = publish(day({ id: undefined, title: undefined, mass: undefined }));
    expect(Object.keys(bare)).toEqual(["type", "liturgicalClass", "color", "season"]);
  });

  it("publishes each commemoration as what it is: no color, no Office, nothing it was settled with", () => {
    const published = publish(
      day({ commemorations: [working({ id: "dominica-iii-post-epiphaniam", type: "dominica", liturgicalClass: 2, officium: {} })] })
    );
    expect(published.commemorations).toEqual([
      {
        id: "dominica-iii-post-epiphaniam",
        title: "S. Agnetis",
        type: "dominica",
        liturgicalClass: 2,
        mass: { oratio: { text: "Omnípotens" } },
      },
    ]);
    expect(Object.keys(published.commemorations![0]!)).toEqual(["id", "title", "type", "liturgicalClass", "mass"]);
  });

  it("leaves the settled day as it was", () => {
    const settled = day({ commemorations: [working()] });
    const before = structuredClone(settled);
    publish(settled);
    expect(settled).toEqual(before);
  });
});

/**
 * The types and classes a published day is typed with are the ones the
 * calendar declares, and the calendar refuses a day of any other as it loads.
 */
describe("the types and classes of a day", () => {
  const calendar = calendarAssets("assets", { days: false }).files["calendar1962.yml"] as {
    "valid-types": string[];
    "valid-liturgical-classes": number[];
  };

  it("are the types the calendar declares", () => {
    expect([...dayTypes].sort()).toEqual([...calendar["valid-types"]].sort());
  });

  it("are the classes the calendar declares", () => {
    expect([...liturgicalClasses]).toEqual(calendar["valid-liturgical-classes"]);
  });
});
