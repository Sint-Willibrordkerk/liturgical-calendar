import { assert, assertObject, assertOption, assertString } from "./utils";

export function assertSaintsTranslation(
  saintsTranslation: any,
  validSaints: string[]
): asserts saintsTranslation is Record<string, { name?: string }> {
  assertObject(saintsTranslation, {}, {}, ([key, val]) => {
    assertOption(validSaints, key, "saint");
    assertObject(val, {
      name: assertString,
    });
  });

  // a full translation is required
  validSaints.forEach((key) =>
    assert(key in saintsTranslation, `${key} is missing in translation`)
  );
}
