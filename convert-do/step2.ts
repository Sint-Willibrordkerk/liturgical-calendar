import { Step1Output } from "./step1";
import { SEP } from "./lib/paths";

/** Step 2 does not change section content; it only combines the `horas` and
 * `missa` trees by mapping both onto a shared, root-stripped output path. The
 * actual union of the two files is performed by the runner when several inputs
 * resolve to the same output path. */
export type Step2Output = Step1Output;

export function getOutputFile(input: string) {
  // Drop the `horas`/`missa` root segment, keeping the leading separator, so
  // the hours and mass versions of the same day collapse onto one path.
  return input.replace(new RegExp(`(${SEP})(?:horas|missa)${SEP}`), "$1");
}

export function transform(obj: Step1Output): Step2Output {
  return obj;
}
