import { stringify as stringifyYaml } from "yaml";

/**
 * How the pipeline stores its trees.
 *
 * The `step0` … `step10` trees are intermediates: nothing but the next step
 * reads them. They are stored as JSON, which parses about seventy times faster
 * and serializes about thirty times faster than YAML — the difference between a
 * pipeline dominated by its serializer and one dominated by its work.
 *
 * The last step's output is different: it is published, read by people, and
 * committed alongside the hand-maintained assets, so it stays YAML.
 */

/** Extension of the intermediate trees. */
export const STEP_EXT = ".json";

/** Extension of the published output. */
const OUTPUT_EXT = ".yml";

/** Read an intermediate tree file. */
export function parseStep(raw: string): unknown {
  return JSON.parse(raw);
}

/** Write an intermediate tree file. */
export function stringifyStep(value: unknown): string {
  return JSON.stringify(value);
}

/** Write a published file. */
export function stringifyOutput(value: unknown): string {
  return stringifyYaml(value);
}

/** Swap an intermediate path's extension for the published one. */
export function toOutputPath(relPath: string): string {
  return relPath.replace(new RegExp(`\\${STEP_EXT}$`, "i"), OUTPUT_EXT);
}

/** Strip the intermediate extension from a path. */
export function stripStepExt(path: string): string {
  return path.replace(new RegExp(`\\${STEP_EXT}$`, "i"), "");
}
