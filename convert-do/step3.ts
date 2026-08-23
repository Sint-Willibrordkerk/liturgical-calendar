import { consola } from "consola";
import {
  applyCondition,
  applyIncludes,
  getIncludesExcludes,
  parseConditional,
} from "./condition";
import { Step2Output } from "./step2";

function isBlankLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed === "_";
}

/** Step 3 is not applied to files under an `Ordo` directory (per-language rubric tables). */
export function isStep3SkippedForPath(relPath: string): boolean {
  const segments = relPath.replace(/\\/g, "/").split("/");
  return segments.includes("Ordo");
}

export type Step3Output = Step2Output;
type Scope = "scope-null" | "scope-line" | "scope-chunk" | "scope-nest";
type ConditionalState = "affirmative" | "not-yet-affirmative" | "dummy-frame";

/**
 * Detects an inline conditional at the start of a line (replaces Divinum Officium
 * `conditional_regex`): leading optional space, `(…)`, optional rest on the same line.
 */
export function parseConditionalLine(
  line: string
): { conditional: string; rest: string } | null {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("(")) return null;
  const close = trimmed.indexOf(")");
  if (close === -1) return null;
  return {
    conditional: trimmed.slice(1, close),
    rest: trimmed.slice(close + 1).trimStart(),
  };
}

function rubricMatchesCondition(
  conditionStr: string,
  rubric: string[]
): boolean {
  const branches = getIncludesExcludes(conditionStr);
  if (branches.length === 0) return true;
  for (const { includes, excludes } of branches) {
    const allInc =
      includes.length === 0 || includes.every((k) => rubric.includes(k));
    const noExc = !excludes.some((k) => rubric.includes(k));
    if (allInc && noExc) return true;
  }
  return false;
}

function normalizeCondition(tokens: string[]): string[] {
  return [...new Set(tokens)].sort();
}

type ProcessorState = {
  output: string[];
  conditionalOffsets: number[];
  conditionalStack: [ConditionalState, Scope][];
};

function initialProcessorState(): ProcessorState {
  return {
    output: [],
    conditionalOffsets: [-1],
    conditionalStack: [["affirmative", "scope-nest"]],
  };
}

function processorStatesEqual(a: ProcessorState, b: ProcessorState): boolean {
  return (
    JSON.stringify(a.output) === JSON.stringify(b.output) &&
    JSON.stringify(a.conditionalOffsets) ===
      JSON.stringify(b.conditionalOffsets) &&
    JSON.stringify(a.conditionalStack) === JSON.stringify(b.conditionalStack)
  );
}

/**
 * One line of Divinum Officium `process_conditional_lines` (mutates `state`).
 */
function applyConditionalToFork(
  fork: RubricFork,
  parsedConditional: ReturnType<typeof parseConditional>
): RubricFork[] {
  const result: RubricFork[] = [fork];
  let { conditionalOffsets, conditionalStack } = fork;
  let { strength, backScope, forwardScope, condition } = parsedConditional;

  const parentState = conditionalStack.at(-1)![0];
  const lastOffsetIdx = conditionalOffsets.length - 1;

  if (parentState === "affirmative" || strength >= lastOffsetIdx) {
    if (strength >= lastOffsetIdx) {
      conditionalStack = [];
    } else {
      const lastStackIdx = conditionalStack.length - 1;
      if (strength >= lastOffsetIdx - lastStackIdx) {
        conditionalStack = conditionalStack.slice(
          0,
          Math.max(0, conditionalOffsets.length - strength - 1)
        );
      }
    }

    const branches = getIncludesExcludes(condition);
    const fence =
      conditionalOffsets.length > strength ? conditionalOffsets[strength]! : -1;

    const effectiveForward: Scope =
      forwardScope === "scope-null" ? "scope-nest" : forwardScope;

    const commit = (
      d: Record<string, boolean>,
      entries: [string, boolean][]
    ): Record<string, boolean> => {
      let out = d;
      for (const [token, value] of entries)
        if (!(token in out)) out = { ...out, [token]: value };
      return out;
    };

    const makeBranchFork = (
      branch: { includes: string[]; excludes: string[] },
      decided: Record<string, boolean>
    ): RubricFork => {
      const newValue = [...fork.value];
      const newConditionalStack = [...conditionalStack];
      const newConditionalOffsets = [...conditionalOffsets];
      const outLast = newValue.length - 1;

      if (backScope === "scope-line") {
        if (outLast > fence) newValue.pop();
      } else if (backScope === "scope-chunk") {
        while (newValue.length > fence + 1 && !isBlankLine(newValue.at(-1)!)) {
          newValue.pop();
        }
        while (newValue.length > fence + 1 && isBlankLine(newValue.at(-1)!)) {
          newValue.pop();
        }
      } else if (backScope === "scope-nest") {
        newValue.length = fence < 0 ? 0 : fence + 1;
      }

      const lastOut = newValue.length - 1;
      while (newConditionalOffsets.length <= strength) {
        newConditionalOffsets.push(-1);
      }
      for (let s = 0; s <= strength; s++) {
        newConditionalOffsets[s] = lastOut;
      }
      while (
        strength <
        newConditionalOffsets.length - newConditionalStack.length - 1
      ) {
        newConditionalStack.push(["dummy-frame", effectiveForward]);
      }
      newConditionalStack.push(["affirmative", effectiveForward]);

      return {
        includes: branch.includes,
        excludes: branch.excludes,
        value: newValue,
        conditionalOffsets: newConditionalOffsets,
        conditionalStack: newConditionalStack,
        decided,
      };
    };

    // Classify each branch against what this fork already decided, so a
    // conditional on an already-resolved rubric does not fork again (the source
    // of the 2^conditionals blow-up on sections like Commune/C12).
    const present = (t: string) => fork.decided[t] === true;
    const absent = (t: string) => fork.decided[t] === false;
    const hasTokens = (b: { includes: string[]; excludes: string[] }) =>
      b.includes.length > 0 || b.excludes.length > 0;
    const isDead = (b: { includes: string[]; excludes: string[] }) =>
      b.includes.some(absent) || b.excludes.some(present);
    // Fires only when fully determined: every include already present AND every
    // exclude already absent. An undecided exclude (e.g. a `nisi` branch) is not
    // yet firing — it must still fork so its variant survives.
    const isTrue = (b: { includes: string[]; excludes: string[] }) =>
      hasTokens(b) && b.includes.every(present) && b.excludes.every(absent);

    const firing = branches.find(isTrue);
    if (firing) {
      // The conditional definitely fires via an already-present rubric; apply
      // its content effect once and drop the (impossible) non-firing base. Keep
      // the fork's existing rubric label — firing on an already-decided rubric
      // must not relabel a fork that a distinct branch (e.g. a feria) owns.
      const fired = makeBranchFork(firing, fork.decided);
      return [{ ...fired, includes: fork.includes, excludes: fork.excludes }];
    }

    // Keep only branches that are still possible (drop already-excluded ones).
    const kept = branches.filter((b) => !isDead(b));
    for (const branch of kept) {
      result.push(
        makeBranchFork(
          branch,
          commit(fork.decided, [
            ...branch.includes.map((t) => [t, true] as [string, boolean]),
            ...branch.excludes.map((t) => [t, false] as [string, boolean]),
          ])
        )
      );
    }

    if (branches.some(hasTokens)) {
      // Non-firing base: suppress forward scope, and record cleanly-negatable
      // single-token branches as absent so later conditionals can prune them.
      result[0] = {
        ...fork,
        decided: commit(
          fork.decided,
          kept
            .filter((b) => b.includes.length === 1 && b.excludes.length === 0)
            .map((b) => [b.includes[0]!, false] as [string, boolean])
        ),
        conditionalStack: [
          ...fork.conditionalStack,
          ["not-yet-affirmative", effectiveForward],
        ],
      };
    }
  }

  return result;
}

type RubricFork = {
  includes: string[];
  excludes: string[];
  value: string[];
  conditionalOffsets: number[];
  conditionalStack: [ConditionalState, Scope][];
  /** Rubric tokens this fork has already resolved: present (true) / absent (false). */
  decided: Record<string, boolean>;
};

/**
 * Collapse forks that are in an identical state. Every conditional line
 * multiplies the fork list, but most resulting forks are duplicates (e.g. all
 * the "no branch matched" continuations), so without this the list grows as
 * 2^conditionals and exhausts memory on sections with many conditionals (e.g.
 * Commune/C12). Two forks with the same includes/excludes/value/offsets/stack
 * process the remaining lines identically and contribute the same variant.
 */
function dedupeForks(forks: RubricFork[]): RubricFork[] {
  const seen = new Map<string, RubricFork>();
  for (const fork of forks) {
    const key = JSON.stringify([
      fork.includes,
      fork.excludes,
      fork.value,
      fork.conditionalOffsets,
      fork.conditionalStack,
      Object.entries(fork.decided).sort(),
    ]);
    if (!seen.has(key)) seen.set(key, fork);
  }
  return [...seen.values()];
}

function applyLineToFork(fork: RubricFork, line: string) {
  const { value, conditionalStack } = fork;
  const output = [...value];

  if (line.startsWith("~")) line = line.slice(1);

  if (conditionalStack.at(-1)![0] === "affirmative") {
    output.push(line);
  }

  while (
    conditionalStack.at(-1)![1] === "scope-line" ||
    (conditionalStack.at(-1)![1] === "scope-chunk" &&
      (output.at(-1) === "" || output.at(-1) === "_"))
  ) {
    do {
      conditionalStack.pop();
    } while (
      conditionalStack.length &&
      conditionalStack.at(-1)![0] === "dummy-frame"
    );

    if (!conditionalStack.length) {
      conditionalStack.push(["affirmative", "scope-nest"]);
    }
  }
  return { ...fork, value: output, conditionalStack };
}

function applyConditionalLineToForks(
  forks: RubricFork[],
  line: string
): RubricFork[] {
  const result: RubricFork[] = [];

  const parsedLine = parseConditionalLine(line);
  if (!parsedLine) return forks;

  const { conditional, rest } = parsedLine;
  const parsedConditional = parseConditional(conditional);

  for (const fork of forks) {
    let newForks = applyConditionalToFork(fork, parsedConditional);
    if (rest) {
      newForks = newForks.map((fork) => applyLineToFork(fork, rest));
    }
    result.push(...newForks);
  }
  return dedupeForks(result);
}

/**
 * Inline `(…)` branches via {@link applyCondition}. While scanning lines, forks only
 * track inline `suffix`; `item.condition` is combined in {@link applyForks}.
 */
export function processConditionalLines(
  lines: string[],
  itemCondition: string[]
) {
  let result: Step3Output[string] = [];
  let forks: RubricFork[] = [
    {
      includes: [],
      excludes: [],
      value: [],
      conditionalOffsets: [-1],
      conditionalStack: [["affirmative", "scope-nest"]],
      decided: {},
    },
  ];

  for (const line of lines) {
    if (line.startsWith("(") && line.includes(")")) {
      forks = applyConditionalLineToForks(forks, line);
    } else {
      for (let i = 0; i < forks.length; i++) {
        forks[i] = applyLineToFork(forks[i]!, line);
      }
    }
  }

  for (const fork of forks) {
    const condition = normalizeCondition([...itemCondition, ...fork.includes]);
    result = applyIncludes(condition, fork.excludes, fork.value, result);
  }

  return result;
}

export function transformSection(
  section: Step2Output[string]
): Step3Output[string] {
  return section.flatMap((item) =>
    processConditionalLines(item.value, item.condition)
  );
}

export function transform(input: Step2Output, inputFile: string): Step3Output {
  if (isStep3SkippedForPath(inputFile)) return input;

  const result: Step3Output = {};

  for (const [sectionName, section] of Object.entries(input)) {
    try {
      result[sectionName] = transformSection(section);
    } catch (error) {
      consola.error(`Error transforming section ${sectionName}`);
      throw error;
    }
  }

  return result;
}
