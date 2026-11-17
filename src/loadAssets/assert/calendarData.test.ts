import { describe, expect, it } from "vitest";
import { calendarDataSchema } from "./calendarData";

/**
 * Loading reads the shape of a calendar or a proper alone: which fields it has
 * and what kind of value each holds. Whether a type, a class or a color is one
 * the calendar declares is asked once the propers are merged into it.
 */
describe("loading a calendar or a proper", () => {
  const loads = (data: unknown) => calendarDataSchema.safeParse(data).success;

  it("takes any type, class, color or commemoration, at any depth", () => {
    expect(
      loads({
        type: "feast",
        "liturgical-class": 7,
        color: "mauve",
        commemorated: "sometimes",
        items: [{ calendar: { "01-02": { id: "nemini", color: "gold" } } }],
      })
    ).toBe(true);
  });

  it("takes any value in a matcher", () => {
    expect(
      loads({
        "omitted-on": [{ type: "feast", class: [1, 9] }],
        admits: { of: [{ commemorated: "sometimes" }] },
        commemorations: { excludes: ["honours", [{ type: "feast" }, {}]], order: ["precedence"] },
      })
    ).toBe(true);
  });

  it("refuses a field that does not exist, at any depth", () => {
    expect(loads({ title: "dominica" })).toBe(false);
    expect(loads({ items: [{ items: [{ colour: "red" }] }] })).toBe(false);
    expect(loads({ "omitted-on": [{ typ: "festum" }] })).toBe(false);
  });

  it("refuses a value of the wrong kind", () => {
    expect(loads({ "liturgical-class": "first" })).toBe(false);
    expect(loads({ id: "Dominica I Adventus" })).toBe(false);
  });
});
