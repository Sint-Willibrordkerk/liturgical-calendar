import { readFileSync } from "fs";
import { parse } from "yaml";

export const loadAsset = (path: string) =>
  parse(readFileSync(`${__dirname}/../../../assets/${path}`, "utf-8"));

export function assert(condition: any, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

export function assertBoolean(val: any): asserts val is boolean {
  assert(typeof val === "boolean", `value should be boolean: ${val}`);
}

export function assertNumber(val: any): asserts val is number {
  assert(typeof val === "number", `value should be number: ${val}`);
}

export function assertString(val: any): asserts val is string {
  assert(typeof val === "string", `value should be string: ${val}`);
}

export function assertRegex(expr: RegExp, val: any, type: string) {
  assert(new RegExp(`^${expr.source}$`).test(val), `invalid ${type}: ${val}`);
}

export function assertOption(
  options: readonly string[],
  val: any,
  type: string
) {
  assert(options.includes(val), `invalid ${type}: ${val}`);
}

export function assertArray(val: any[], assertValue: (val: any) => void) {
  assert(Array.isArray(val), `value should be array: ${val}`);
  val.forEach((val, index) => {
    try {
      assertValue(val);
    } catch (err) {
      if (err instanceof Error)
        throw new Error(
          `Failed to validate array entry for index: ${index}, caused by ${err.stack}\n`
        );
    }
  });
}

export function assertMaybeArray(val: any, assert: (val: any) => void) {
  if (Array.isArray(val)) assertArray(val, assert);
  else assert(val);
}

export function assertObject(
  val: any,
  optionalKeys: { [key: string]: (val: any) => void },
  requiredKeys: { [key: string]: (val: any) => void } = {},
  validateEntries?: ([key, val]: [string, any]) => void
) {
  assert(typeof val === "object", `Value should be object: ${val}`);
  Object.entries(val).forEach(([key, val]) => {
    try {
      if (optionalKeys[key]) optionalKeys[key](val);
      else if (requiredKeys[key]) requiredKeys[key](val);
      else if (validateEntries) validateEntries([key, val]);
      else throw new Error(`unknown key: ${key}`);
    } catch (err) {
      if (err instanceof Error)
        throw new Error(
          `Failed to validate object entry for key: ${key}, caused by ${err.stack}\n`
        );
      else throw err;
    }
  });

  Object.keys(requiredKeys).forEach((requiredKey) =>
    assert(
      Object.keys(val).includes(requiredKey),
      `Object is missing required key: ${requiredKey}`
    )
  );
}
