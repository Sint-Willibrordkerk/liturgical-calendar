import { z } from "zod";

// Use bundled assets instead of reading from files
declare const bundledAssets: Record<string, any>;

/** A bundled asset, or `undefined` where none is filed under `path`. */
export const findAsset = (path: string): unknown => {
  if (typeof bundledAssets === "undefined") return undefined;
  // Normalize path to handle both forward and backward slashes, and try the
  // original path as a fallback
  return bundledAssets[path.replace(/\\/g, "/")] ?? bundledAssets[path];
};

export const loadAsset = (path: string) => {
  const asset = findAsset(path);
  if (asset) return asset;
  throw new Error(`Asset ${path} not found`);
};

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
