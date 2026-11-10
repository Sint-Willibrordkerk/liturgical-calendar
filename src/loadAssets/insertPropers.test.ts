import { describe, expect, it } from "vitest";
import { insertPropers } from "./insertPropers";
import type { CalendarData } from "../types";

/**
 * A local proper fills the slots the calendar leaves for it: its days take the
 * slot's place in the calendar, under the slot's group, in its order.
 */
describe("insertPropers", () => {
  const calendar: CalendarData = {
    items: [
      { "liturgical-class": 1, items: [{ slot: "dioecesis-patroni-principalis" }] },
      { "liturgical-class": 3, items: [{ slot: "dioecesis-3" }, { calendar: { "14-01": "hilarii" } }] },
    ],
  };
  const utrecht = {
    name: "neerlandia/ultrajectum",
    data: {
      items: [
        { "slot-name": "dioecesis-patroni-principalis", calendar: { "07-11": "willibrordi" } },
        { "slot-name": "dioecesis-3", calendar: { "01-03": "switberti" } },
      ],
    },
  };

  it("puts a proper's days in the slots they name, with the local calendar its path names", () => {
    const { calendar: merged, problems } = insertPropers(calendar, [utrecht]);
    expect(problems).toEqual([]);
    expect(merged.items![0]!.items![0]).toEqual({
      items: [{ calendar: { "07-11": "willibrordi" }, "local-calendar": "Neerlandia/Ultrajectum" }],
    });
    expect(merged.items![1]!.items![0]).toEqual({
      items: [{ calendar: { "01-03": "switberti" }, "local-calendar": "Neerlandia/Ultrajectum" }],
    });
    expect(merged.items![1]!.items![1]).toEqual({ calendar: { "14-01": "hilarii" } });
  });

  it("gives a proper's day what its own groups say, and the slot's name to none", () => {
    const grouped = {
      name: "fsspx",
      data: {
        color: "red",
        items: [{ "slot-name": "dioecesis-3", items: [{ calendar: { "03-09": "pii-x" } }] }],
      },
    };
    const { calendar: merged } = insertPropers(calendar, [grouped]);
    expect(merged.items![1]!.items![0]!.items).toEqual([
      { color: "red", calendar: { "03-09": "pii-x" }, "local-calendar": "Fsspx" },
    ]);
  });

  it("leaves a slot no proper fills empty", () => {
    const { calendar: merged } = insertPropers(calendar, []);
    expect(merged.items![0]!.items![0]).toEqual({ items: [] });
  });

  it("puts the days of several propers in one slot, the last named first", () => {
    const other = {
      name: "fsspx",
      data: { items: [{ "slot-name": "dioecesis-3", calendar: { "03-09": "pii-x" } }] },
    };
    const { calendar: merged } = insertPropers(calendar, [other, utrecht]);
    expect(merged.items![1]!.items![0]!.items!.map((day) => day["local-calendar"])).toEqual([
      "Neerlandia/Ultrajectum",
      "Fsspx",
    ]);
  });

  it("names a day in no slot, and a slot the calendar does not have", () => {
    const lost = {
      name: "nemo",
      data: {
        items: [{ calendar: { "01-02": "nemini" } }, { "slot-name": "nusquam", calendar: { "01-03": "nullius" } }],
      },
    };
    expect(insertPropers(calendar, [lost]).problems).toEqual([
      "nemo: a day in no slot",
      'nemo: no slot "nusquam" in the calendar',
    ]);
  });

  it("leaves the calendar it was given as it was", () => {
    const before = JSON.stringify(calendar);
    insertPropers(calendar, [utrecht]);
    expect(JSON.stringify(calendar)).toBe(before);
  });
});
