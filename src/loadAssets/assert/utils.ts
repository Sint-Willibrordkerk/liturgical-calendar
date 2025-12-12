import { z } from "zod";

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

export function zRegex<T extends string>(
  expr: string,
  type: string
): z.ZodType<T> {
  return z.string().regex(new RegExp(expr), {
    message: `invalid ${type}`,
  }) as unknown as z.ZodType<T>;
}

export function issueOption<T extends readonly unknown[]>(
  ctx: z.RefinementCtx,
  name: string,
  options: T,
  value?: unknown
) {
  if (value && options.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: `options array cannot be empty`,
      path: [name],
    });
  }

  if (value && !options.includes(value)) {
    ctx.addIssue({
      code: "custom",
      message: `invalid ${name}: ${value}`,
      path: [name],
    });
  }
}

// Helper function to create a maybe array schema
export function maybeArraySchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.union([
    itemSchema,
    z
      .array(itemSchema)
      .min(2, "Array is used where a simple value could be used.")
      .min(1, "Array is empty."),
  ]);
}
