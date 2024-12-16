import { readFileSync } from "fs";
import { parse } from "yaml";

export const loadAsset = (path: string) =>
  parse(readFileSync(`${__dirname}/../../assets/${path}`, "utf-8"));

export function assert(condition: any, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

export function assertBoolean(val: any): asserts val is boolean {
  assert(typeof val === "boolean", `value should be boolean: ${val}`);
}

export function assertString(val: any): asserts val is string {
  assert(typeof val === "string", `value should be string: ${val}`);
}

export function assertArray(val: any[], assertValue: (val: any) => void) {
  assert(Array.isArray(val), `value should be array: ${val}`);
  val.forEach(assertValue);
}

export function assertMaybeArray(val: any, assert: (val: any) => void) {
  if (Array.isArray(val)) assertArray(val, assert);
  else assert(val);
}

export function assertObject(
  val: any,
  validateEntries: ([key, val]: [string, any]) => void
): asserts val is object {
  assert(typeof val === "object", `Value should be object: ${val}`);
  Object.entries(val).forEach(([key, val]) => {
    try {
      return validateEntries([key, val]);
    } catch (err) {
      if (err instanceof Error)
        throw new Error(
          `Failed to validate object entry for key: ${key}, caused by ${err.stack}\n`
        );
      else throw err;
    }
  });
}
