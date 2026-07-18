import { Step6Output } from "./step6";

/**
 * Step 6 — materialize rubric variants into suffixed keys.
 *
 * Steps 0–5 keep every section as an array of `{ value, condition }` variants
 * (the rubric lives as data). The later steps (7 name/filename, 8
 * commemorations, 9 missa) — ported from the original `step11`–`step13`
 * scripts — expect the *flattened* shape instead: one plain `string[]` per key,
 * with the rubric baked into the key name (`oratio`, `oratio/1570`, …).
 *
 * This step bridges the two representations. For each key:
 * - the variant with an empty condition keeps the base key;
 * - each conditional variant becomes `key/<sorted-condition-tokens>`.
 */
export type Step7Output = { [key: string]: string[] };

type Variant = { value: string[]; condition: string[] };

function isVariantArray(value: unknown): value is Variant[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item != null &&
        typeof item === "object" &&
        Array.isArray((item as Variant).value) &&
        Array.isArray((item as Variant).condition)
    )
  );
}

/** Deterministic key suffix for a set of rubric tokens (sorted, `-`-joined). */
export function conditionSuffix(condition: string[]): string {
  return [...condition].sort().join("-");
}

export function transform(obj: Step6Output): Step7Output {
  const result: Step7Output = {};

  for (const [key, value] of Object.entries(obj)) {
    // Already-flat scalars/arrays are passed through untouched.
    if (!isVariantArray(value)) {
      result[key] = value as unknown as string[];
      continue;
    }

    for (const variant of value) {
      const suffix = conditionSuffix(variant.condition);
      const outKey = suffix ? `${key}/${suffix}` : key;
      // Last writer wins; upstream dedups by condition so collisions are rare.
      result[outKey] = variant.value;
    }
  }

  return result;
}
