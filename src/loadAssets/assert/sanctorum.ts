import type { Sanctorum } from "../../types";
import {
  assertMaybeArray,
  assertObject,
  assertOption,
  assertString,
} from "./utils";
import { calendarTypes, sanctorumTypes } from "../../constants";

export function assertSanctorum(
  sanctorum: any
): asserts sanctorum is Sanctorum {
  assertObject(sanctorum, {}, {}, ([name, val]) => {
    assertString(name);
    assertObject(val, {
      titles: (val) => assertMaybeArray(val, assertString),
      type: (val) => assertOption(sanctorumTypes, val, "type"),
      calendarType: (val) => assertOption(calendarTypes, val, "calendarType"),
    });
  });
}
