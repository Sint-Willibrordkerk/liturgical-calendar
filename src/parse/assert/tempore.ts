import { LiturgicalClass, LiturgicalType, RelativeDate } from "../../types";
import {
  assert,
  assertArray,
  assertBoolean,
  assertObject,
  assertOption,
  assertRegex,
  assertString,
} from "./utils";
import { liturgicalTypes } from "../../constants";
import { assertRelativeDate } from "./relativeDate";

const weekdays = [
  "dominica",
  "feriaII",
  "feriaIII",
  "feriaIV",
  "feriaV",
  "feriaVI",
  "sabbato",
] as const;

const specialOccurenceTypes = [
  "saints",
  "propers",
  "indults",
  "easter",
  "ember",
] as const;

type Weekday = (typeof weekdays)[number];
type SpecialOccurenceType = (typeof specialOccurenceTypes)[number];
type OccurenceType = SpecialOccurenceType | Weekday | `!${Weekday}`;

function assertOccurenceType(
  occurenceType: any
): asserts occurenceType is OccurenceType {
  assertRegex(
    new RegExp(`${specialOccurenceTypes.join("|")}|!?(${weekdays.join("|")})`),
    occurenceType,
    "occurence"
  );
}

export function assertTempore(tempore: any): asserts tempore is Record<
  LiturgicalClass,
  Array<{
    title?: string;
    type?: LiturgicalType;
    occurence?:
      | OccurenceType
      | RelativeDate
      | {
          type?: OccurenceType;
          start?: RelativeDate;
          end?: RelativeDate;
          date?: RelativeDate;
        };
    priviliged?: boolean;
  }>
> {
  assertObject(tempore, {}, {}, ([_class, entry]) => {
    assertRegex(/[1-4]/, _class, "class");
    assertArray(entry, (val) => {
      assertObject(val, {
        title: assertString,
        type: (val) => assertOption(liturgicalTypes, val, "type"),
        occurence: (occurence) => {
          if (typeof occurence === "string") assertOccurenceType(occurence);
          else {
            if (typeof occurence === "object" && "difference" in occurence)
              assertRelativeDate(occurence);
            else
              assertObject(occurence, {
                type: assertOccurenceType,
                start: assertRelativeDate,
                end: assertRelativeDate,
                date: assertRelativeDate,
                default: assertRelativeDate,
              });
          }
        },
        priviliged: assertBoolean,
      });
    });
  });
  assert(Object.keys(tempore).length === 4, "calendar needs the keys 1-4");
}
