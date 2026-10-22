import type { Step1Output } from "./step1.js";
import { SEP } from "./lib/paths.js";

/**
 * Step 2 does not change section content. It files the `horas` (Office) and
 * `missa` (Mass) document of a day beside each other below their language —
 * `missa/la/Sancti/01-01` becomes `la/missa/Sancti/01-01` — so the trees that
 * follow are rooted at the language, where the stores will live.
 *
 * The two stay separate documents until step 8 combines them: each resolves its
 * own references, as the sources do.
 */
export type Step2Output = Step1Output;

export function getOutputFile(input: string) {
  // Swap the `horas`/`missa` root with the language segment after it.
  return input.replace(
    new RegExp(`(${SEP})(horas|missa)(${SEP})([^\\\\/]+)(${SEP})`),
    "$1$4$3$2$5"
  );
}

export function transform(obj: Step1Output): Step2Output {
  return obj;
}
