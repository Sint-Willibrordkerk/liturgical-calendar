import { z } from "zod";

export function zRegex<T extends string>(expr: string, type: string): z.ZodType<T> {
  return z.string().regex(new RegExp(expr), {
    message: `invalid ${type}`,
  }) as unknown as z.ZodType<T>;
}

// Helper function to create a maybe array schema
export function maybeArraySchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.union([
    itemSchema,
    z
      .array(itemSchema)
      .min(2, "Array is empty or array is used where a simple value could be used."),
  ]);
}
