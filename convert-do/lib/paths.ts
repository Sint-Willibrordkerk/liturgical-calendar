/**
 * Path-separator helpers so the pipeline works on both Windows (`\`) and POSIX
 * (`/`). Node emits native separators from `path.join`/`readdir`, so any path
 * logic that matches or splits on a literal separator must accept both.
 */

/** Regex fragment matching a single separator; embed inside a larger pattern. */
export const SEP = "[\\\\/]";

/** Compiled separator matcher for splitting a path into segments. */
export const SEP_RE = /[\\/]/;

/** Escape a string for literal use inside a `RegExp`. */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split a path into segments on either separator. */
export function splitPath(path: string): string[] {
  return path.split(SEP_RE);
}
