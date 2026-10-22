/**
 * Helpers for the rubric-variant shape carried through the pipeline: a section
 * is a list of `{ value, condition }`, where `value` holds the section's lines
 * (or, after a batch step structures them, a typed object) and `condition` is
 * the rubric token set. The batch steps operate on this shape directly (there
 * is no flattening step), applying their per-section transform to each
 * variant's `value` while preserving its `condition`.
 */

export type Variant<T = unknown> = { value: T; condition: string[] };

/** True when `value` is a rubric-variant list (`{ value, condition }[]`). */
export function isVariantArray(value: unknown): value is Variant[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item != null &&
        typeof item === "object" &&
        "value" in item &&
        Array.isArray((item as Variant).condition)
    )
  );
}

/**
 * Apply `fn` to each variant's `value`, keeping its `condition`. A value that
 * is not a variant list is returned unchanged.
 */
export function mapVariants<T>(
  value: unknown,
  fn: (value: unknown, condition: string[]) => T
): unknown {
  if (!isVariantArray(value)) return value;
  return value.map((item) => ({
    condition: item.condition,
    value: fn(item.value, item.condition),
  }));
}

/** A document: section keys to their rubric variants (or, rarely, a plain value). */
export type Document = Record<string, unknown>;

/**
 * Union two documents. A section both hold as variant lists is unioned by
 * condition, `high` winning a condition collision; any other section `high`
 * holds replaces `low`'s.
 */
export function unionDocuments(low: Document, high: Document): Document {
  const merged: Document = { ...low };
  for (const [key, highValue] of Object.entries(high)) {
    const lowValue = merged[key];
    if (isVariantArray(lowValue) && isVariantArray(highValue)) {
      const byCondition = new Map<string, Variant>();
      for (const variant of [...lowValue, ...highValue]) {
        byCondition.set([...variant.condition].sort().join("|"), variant);
      }
      merged[key] = [...byCondition.values()];
    } else {
      merged[key] = highValue;
    }
  }
  return merged;
}
