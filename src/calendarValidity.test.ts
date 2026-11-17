import { describe, expect, it } from "vitest";
import { problemsOf } from "./calendarValidity";
import type { CalendarData, CalendarDay } from "./types";

/**
 * The days of a calendar, its propers inserted, checked against what it
 * declares valid.
 */
describe("problemsOf", () => {
  const lists: CalendarData = {
    "valid-types": ["dominica", "festum", "vigilia"],
    "valid-liturgical-classes": [1, 2, 3],
    "valid-commemorated": ["privileged", "ordinary", "never"],
    "valid-colors": ["white", "red"],
  };
  const day = (fields: Partial<CalendarDay>): CalendarDay => ({
    id: "nemini",
    type: "festum",
    liturgicalClass: 3,
    commemorated: "ordinary",
    admits: { count: 2 },
    occurence: { date: "02-01" },
    ...fields,
  });
  const problems = (...days: CalendarDay[]) => problemsOf({ ...lists, days });

  it("finds nothing wrong with days the calendar allows", () => {
    expect(problems(day({ color: "red", omittedOn: [{ type: "dominica" }] }))).toEqual([]);
  });

  it("names a type, class, color or commemoration the calendar does not declare", () => {
    expect(problems(day({ type: "feast" }))).toEqual(['nemini: invalid type "feast"']);
    expect(problems(day({ liturgicalClass: 4 }))).toEqual(["nemini: invalid class 4"]);
    expect(problems(day({ color: "gold" }))).toEqual(['nemini: invalid color "gold"']);
    expect(problems(day({ commemorated: "sometimes" }))).toEqual([
      'nemini: invalid commemorated "sometimes"',
    ]);
  });

  it("names a value a matcher of a day does not take", () => {
    expect(problems(day({ omittedOn: [{ type: "feast" }] }))).toEqual([
      'nemini: invalid type "feast" in a matcher',
    ]);
    expect(problems(day({ admits: { of: [{ class: [1, 4] }] } }))).toEqual([
      "nemini: invalid class 4 in a matcher",
    ]);
  });

  it("names a value the rules at the head of the calendar do not take", () => {
    expect(
      problemsOf({
        ...lists,
        days: [],
        commemorations: {
          excludes: ["honours", [{ type: "feast" }, {}]],
          order: [{ commemorated: "sometimes" }, "precedence"],
        },
      })
    ).toEqual([
      'the rules of commemoration: invalid type "feast" in a matcher',
      'the rules of commemoration: invalid commemorated "sometimes" in a matcher',
    ]);
  });

  it("names a day that does not say how it is commemorated or what it admits (nn. 108, 111)", () => {
    expect(problems(day({ commemorated: undefined }))).toEqual([
      "nemini: does not say how it is commemorated (n. 108)",
    ]);
    expect(problems(day({ admits: undefined }))).toEqual(["nemini: does not say what it admits (n. 111)"]);
  });

  it("calls a day without an id by its type and class", () => {
    expect(problems(day({ id: undefined, type: "feast" }))).toEqual([
      'a feast of class 3: invalid type "feast"',
    ]);
  });
});
