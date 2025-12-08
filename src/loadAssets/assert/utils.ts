// Use bundled assets instead of reading from files
declare const bundledAssets: Record<string, any>;

export const loadAsset = (path: string) => {
  // Normalize path to handle both forward and backward slashes
  const normalizedPath = path.replace(/\\/g, "/");

  if (typeof bundledAssets !== "undefined" && bundledAssets[normalizedPath]) {
    return bundledAssets[normalizedPath];
  }

  // Try with original path as fallback
  if (typeof bundledAssets !== "undefined" && bundledAssets[path]) {
    return bundledAssets[path];
  }

  throw new Error(`Asset ${path} not found`);
};

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

export function assertMaybeArray(val: any, assertItem: (val: any) => void) {
  if (Array.isArray(val)) {
    assertArray(val, assertItem);
    assert(
      val.length !== 1,
      "Array is used where a simple value could be used."
    );
    assert(val.length !== 0, "Array is empty.");
  } else assertItem(val);
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
