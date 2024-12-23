import { DateString, LiturgicalClass } from "src/types";
import {
  assert,
  assertMaybeArray,
  assertObject,
  assertOption,
  assertRegex,
} from "./utils";

export function assertCalendar(
  calendar: any,
  validSaints: string[]
): asserts calendar is Record<
  LiturgicalClass,
  Record<DateString, string | string[]>
> {
  assertObject(calendar, {}, {}, ([_class, entry]) => {
    assertRegex(/[1-4]/, _class, "class");
    assertObject(entry, {}, {}, ([date, saints]) => {
      assertRegex(/\d{2}-\d{2}/, date, "date");
      assertMaybeArray(saints, (val) => {
        assertOption(validSaints, val, "saint");
      });
    });
  });
  assert(Object.keys(calendar).length === 4, "calendar needs the keys 1-4");
}
