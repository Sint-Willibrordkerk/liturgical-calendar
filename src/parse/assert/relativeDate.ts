import { RelativeDate } from "src/types";
import { assertNumber, assertObject, assertRegex } from "./utils";

export function assertRelativeDate(date: any): asserts date is RelativeDate {
  if (typeof date === "string")
    assertRegex(/\d{2}-\d{2}|advent|easter/, date, "date");
  else
    assertObject(
      date,
      { difference: assertNumber },
      { date: (val) => assertRegex(/easter|advent/, val, "date") }
    );
}
