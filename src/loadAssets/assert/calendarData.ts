import type { CalendarData, Occurence, OccurenceType } from "src/types";
import {
  assertArray,
  assertMaybeArray,
  assertNumber,
  assertObject,
  assertOption,
  assertRegex,
} from "./utils";

import { assertString } from "./utils";
import { weekdays } from "../../constants";
import { assertLiturgicalDate } from "./relativeDate";

function assertOccurenceType(
  occurenceType: any
): asserts occurenceType is OccurenceType {
  assertRegex(
    new RegExp(`!?(${Object.keys(weekdays).join("|")})`),
    occurenceType,
    "occurence"
  );
}

function assertOccurence(occurence: any): asserts occurence is Occurence {
  if (typeof occurence === "string") assertOccurenceType(occurence);
  else {
    if (typeof occurence === "object" && "difference" in occurence)
      assertLiturgicalDate(occurence);
    else
      assertObject(occurence, {
        type: assertOccurenceType,
        start: assertLiturgicalDate,
        end: assertLiturgicalDate,
        date: assertLiturgicalDate,
        default: assertLiturgicalDate,
      });
  }
}

export function assertCalendarData(
  calendarData: any,
  parent?: any
): asserts calendarData is CalendarData {
  const validTypes =
    typeof calendarData === "object" && "valid-types" in calendarData
      ? calendarData["valid-types"]
      : parent?.["valid-types"] ?? [];
  const validLiturgicalClasses =
    typeof calendarData === "object" &&
    "valid-liturgical-classes" in calendarData
      ? calendarData["valid-liturgical-classes"]
      : parent?.["valid-liturgical-classes"] ?? [];
  const validCommemorationTypes =
    typeof calendarData === "object" &&
    "valid-commemoration-types" in calendarData
      ? calendarData["valid-commemoration-types"]
      : parent?.["valid-commemoration-types"] ?? [];
  const { items: _items, ...childData } = calendarData;

  assertObject(calendarData, {
    "valid-types": (val) => assertArray(val, assertString),
    "valid-liturgical-classes": (val) => assertArray(val, assertNumber),
    "valid-commemoration-types": (val) => assertArray(val, assertString),
    type: (val) => assertOption(validTypes, val, "type"),
    title: (val) => assertString(val),
    "liturgical-class": (val) =>
      assertOption(validLiturgicalClasses, val, "liturgical-class"),
    "commemoration-type": (val) =>
      assertOption(validCommemorationTypes, val, "commemoration-type"),
    "accept-commemoration-types": (val) =>
      assertArray(val, (val) =>
        assertOption(validCommemorationTypes, val, "commemoration-type")
      ),
    occurence: assertOccurence,
    calendar: (val) =>
      assertObject(val, {}, {}, ([date, titles]) => {
        assertLiturgicalDate(date);
        assertMaybeArray(titles, assertString);
      }),
    slot: assertString,
    "slot-name": assertString,
    items: (val) =>
      assertArray(val, (val) =>
        assertCalendarData(val, { ...parent, ...childData })
      ),
  });
}
