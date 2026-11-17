import { describe, expect, it } from "vitest";
import { flattenCalendar } from "./flattenCalendar";

/** The calendar's tree as a list of its dated days, in the order written. */
describe("flattenCalendar", () => {
  it("gives each day what its groups say, the nearest winning", () => {
    expect(
      flattenCalendar({
        type: "festum",
        items: [{ "liturgical-class": 2, color: "red", items: [{ color: "white", occurence: { date: "02-01" }, id: "nemini" }] }],
      })
    ).toMatchObject([{ id: "nemini", type: "festum", liturgicalClass: 2, color: "white" }]);
  });

  it("makes a day of each entry of a calendar map, the last of a date first", () => {
    const days = flattenCalendar({ calendar: { "02-01": ["primus", { id: "secundus", color: "red" }], "03-01": "tertius" } });
    expect(days.map(({ id, color, occurence }) => [id, color, occurence])).toEqual([
      ["secundus", "red", { date: "02-01" }],
      ["primus", undefined, { date: "02-01" }],
      ["tertius", undefined, { date: "03-01" }],
    ]);
  });

  it("carries a proper's local calendar to its days", () => {
    expect(
      flattenCalendar({ items: [{ "local-calendar": "Neerlandia/Ultrajectum", calendar: { "01-03": "switberti" } }] })
    ).toMatchObject([{ id: "switberti", localCalendar: "Neerlandia/Ultrajectum" }]);
  });

  it("leaves out what falls on no date, such as an empty slot", () => {
    expect(flattenCalendar({ items: [{ items: [] }, { type: "festum" }] })).toEqual([]);
  });

  it("does not change the entries of the calendar it reads", () => {
    const entries = ["primus", "secundus"];
    flattenCalendar({ calendar: { "02-01": entries } });
    expect(entries).toEqual(["primus", "secundus"]);
  });
});
