import {
  assertMaybeArray,
  assertObject,
  assertOption,
  assertString,
} from "./utils";

const saintsTypes = ["vigilia", "domini", "custom"] as const;
type SaintsType = (typeof saintsTypes)[number];

export function assertSaints(saints: any): asserts saints is Record<
  string,
  {
    titles?: string | string[];
    type?: SaintsType;
  }
> {
  assertObject(saints, {}, {}, ([name, val]) => {
    assertString(name);
    assertObject(val, {
      titles: (val) => assertMaybeArray(val, assertString),
      type: (val) => assertOption(saintsTypes, val, "type"),
    });
  });
}
