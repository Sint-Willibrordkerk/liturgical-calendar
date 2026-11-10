import { describe, expect, it } from "vitest";
import { problemsOf } from "./calendarValidity";
import type { CalendarData } from "./types";

/**
 * The values of a calendar, its propers inserted, checked against what it
 * declares valid. Every day is checked with what its groups say of it.
 */
describe("problemsOf", () => {
  const lists: CalendarData = {
    "valid-types": ["dominica", "festum", "vigilia"],
    "valid-liturgical-classes": [1, 2, 3],
    "valid-commemorated": ["privileged", "ordinary", "never"],
    "valid-colors": ["white", "red"],
  };
  /** A calendar of one group, saying all a day must, around the days given. */
  const calendarOf = (group: CalendarData, ...items: CalendarData[]): CalendarData => ({
    ...lists,
    items: [
      {
        type: "festum",
        "liturgical-class": 3,
        commemorated: "ordinary",
        admits: { count: 2 },
        ...group,
        items,
      },
    ],
  });
  const nemini: CalendarData = { calendar: { "02-01": "nemini" } };

  it("finds nothing wrong with days the calendar allows", () => {
    expect(
      problemsOf(calendarOf({ "omitted-on": [{ type: "dominica" }] }, nemini, { calendar: { "03-01": { id: "alteri", color: "red" } } }))
    ).toEqual([]);
  });

  it("names a type, class, color or commemoration the calendar does not declare", () => {
    expect(problemsOf(calendarOf({ type: "feast" }, nemini))).toEqual(['nemini: invalid type "feast"']);
    expect(problemsOf(calendarOf({ "liturgical-class": 4 }, nemini))).toEqual(["nemini: invalid class 4"]);
    expect(problemsOf(calendarOf({ commemorated: "sometimes" }, nemini))).toEqual([
      'nemini: invalid commemorated "sometimes"',
    ]);
    expect(problemsOf(calendarOf({}, { calendar: { "02-01": { id: "nemini", color: "gold" } } }))).toEqual([
      'nemini: invalid color "gold"',
    ]);
  });

  it("names a value a matcher of a day does not take", () => {
    expect(problemsOf(calendarOf({ "omitted-on": [{ type: "feast" }] }, nemini))).toEqual([
      'nemini: invalid type "feast" in a matcher',
    ]);
    expect(problemsOf(calendarOf({ admits: { of: [{ class: [1, 4] }] } }, nemini))).toEqual([
      "nemini: invalid class 4 in a matcher",
    ]);
  });

  it("names a value the rules at the head of the calendar do not take", () => {
    const calendar = {
      ...calendarOf({}),
      commemorations: {
        excludes: ["honours" as const, [{ type: "feast" }, {}] as [object, object]],
        order: [{ commemorated: "sometimes" }, "precedence" as const],
      },
    };
    expect(problemsOf(calendar)).toEqual([
      'the rules of commemoration: invalid type "feast" in a matcher',
      'the rules of commemoration: invalid commemorated "sometimes" in a matcher',
    ]);
  });

  it("names a day that does not say how it is commemorated or what it admits (nn. 108, 111)", () => {
    expect(problemsOf(calendarOf({ commemorated: undefined }, nemini))).toEqual([
      "nemini: does not say how it is commemorated (n. 108)",
    ]);
    expect(problemsOf(calendarOf({ admits: undefined }, nemini))).toEqual([
      "nemini: does not say what it admits (n. 111)",
    ]);
  });

  it("lets a day say for itself what its group does not", () => {
    expect(problemsOf(calendarOf({ commemorated: undefined }, { commemorated: "never", ...nemini }))).toEqual([]);
  });

  it("calls a day without an id by its type and class", () => {
    expect(problemsOf(calendarOf({ type: "feast" }, { occurence: { date: "02-01" } }))).toEqual([
      'a feast of class 3: invalid type "feast"',
    ]);
  });

  it("leaves alone what falls on no date", () => {
    expect(problemsOf(calendarOf({ type: "feast" }, {}))).toEqual([]);
  });
});
