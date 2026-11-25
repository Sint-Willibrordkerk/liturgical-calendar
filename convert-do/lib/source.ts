/**
 * The sources the propers are generated from, and the commit they are read at.
 *
 * The propers are not kept in this repository: they are generated from a
 * checkout of Divinum Officium and published. `source.json` names the commit
 * they are generated from, so that what is published can be generated again,
 * here or anywhere, and comes out the same.
 */
import { execFileSync } from "child_process";
import pinned from "../source.json";

/** The repository of the sources, as GitHub names it, and the commit read. */
export const PINNED_SOURCE: { repository: string; commit: string } = pinned;

/** The trees of a checkout the pipeline reads. */
const TREES_READ = ["web/www/horas", "web/www/missa"];

/** A checkout as it stands: its commit, and what differs from it in the trees read. */
export type SourceState = { head: string; changed: string[] };

/** The state of the checkout at `base`, asked of git. */
export function sourceState(base: string): SourceState {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", base, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  const status = git("status", "--porcelain", "--untracked-files=all", "--", ...TREES_READ);
  return {
    head: git("rev-parse", "HEAD").trim(),
    // A line is two letters of status, a space, and the path.
    changed: status.split("\n").filter(Boolean).map((line) => line.slice(3)),
  };
}

/**
 * Why a checkout is not the pinned source, each reason a line; nothing where
 * it is.
 */
export function sourceProblems(state: SourceState, commit: string): string[] {
  const problems: string[] = [];
  if (state.head !== commit) {
    problems.push(`the checkout is at ${state.head}, and the propers are generated from ${commit}`);
  }
  if (state.changed.length > 0) {
    const shown = state.changed.slice(0, 5).join(", ");
    const more = state.changed.length > 5 ? ` and ${state.changed.length - 5} more` : "";
    problems.push(`the checkout has changes that are not committed: ${shown}${more}`);
  }
  return problems;
}

/**
 * Hold the checkout at `base` to the pinned commit, and throw where it is not
 * that commit, saying how to go on.
 *
 * With `unpinned` it is read as it stands — to try a newer commit before
 * pinning it — and what differs is handed back to be warned of. What is
 * generated that way is not what is published.
 */
export function requirePinnedSource(
  base: string,
  { unpinned = false }: { unpinned?: boolean } = {}
): string[] {
  let state: SourceState;
  try {
    state = sourceState(base);
  } catch {
    throw new Error(
      `${base} is not a git checkout, so the commit it is at cannot be told. ` +
        `Clone ${PINNED_SOURCE.repository} and check out ${PINNED_SOURCE.commit}.`
    );
  }
  const problems = sourceProblems(state, PINNED_SOURCE.commit);
  if (problems.length === 0 || unpinned) return problems;
  throw new Error(
    [
      `The Divinum Officium checkout at ${base} is not the pinned source:`,
      ...problems.map((problem) => `  - ${problem}`),
      `Check out the pinned commit:`,
      `  git -C ${base} checkout ${PINNED_SOURCE.commit}`,
      `or, to generate from the checkout as it stands, pass --unpinned; to publish`,
      `from it, write its commit in convert-do/source.json.`,
    ].join("\n")
  );
}
