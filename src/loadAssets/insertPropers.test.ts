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
    days: {
      "dioecesis-patroni-principalis": { "07-11": "willibrordi" },
      "dioecesis-3": { "01-03": "switberti" },
    },
  };
  const fsspx = { name: "fsspx", days: { "dioecesis-3": { "03-09": "pii-x" } } };

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

  it("leaves a slot no proper fills empty", () => {
    const { calendar: merged } = insertPropers(calendar, []);
    expect(merged.items![0]!.items![0]).toEqual({ items: [] });
  });

  it("puts the days of several propers in one slot, the last named first", () => {
    const { calendar: merged } = insertPropers(calendar, [fsspx, utrecht]);
    expect(merged.items![1]!.items![0]!.items!.map((day) => day["local-calendar"])).toEqual([
      "Neerlandia/Ultrajectum",
      "Fsspx",
    ]);
  });

  it("names a slot the calendar does not have", () => {
    const lost = { name: "nemo", days: { nusquam: { "01-03": "nullius" } } };
    expect(insertPropers(calendar, [lost]).problems).toEqual(['nemo: no slot "nusquam" in the calendar']);
  });

  it("leaves the calendar it was given as it was", () => {
    const before = JSON.stringify(calendar);
    insertPropers(calendar, [utrecht]);
    expect(JSON.stringify(calendar)).toBe(before);
  });
});
