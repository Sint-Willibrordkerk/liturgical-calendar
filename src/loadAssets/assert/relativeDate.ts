import { LiturgicalDate, RelativeDate } from "../../types";
import { assertNumber, assertObject, assertRegex } from "./utils";
import { namedDates } from "../../constants";

export function assertRelativeDate(date: any): asserts date is RelativeDate {
  assertObject(
    date,
    { difference: assertNumber },
    {
      date: (val) =>
        assertRegex(new RegExp(`^(${namedDates.join("|")})$`), val, "date"),
    }
  );
}

export function assertLiturgicalDate(
  date: any
): asserts date is LiturgicalDate {
  if (typeof date === "string")
    assertRegex(
      new RegExp(`^(${namedDates.join("|")}|[0123]\\d-[01]\\d)$`),
      date,
      "date"
    );
  else assertRelativeDate(date);
}
