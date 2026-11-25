import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PINNED_SOURCE, requirePinnedSource, sourceProblems, sourceState } from "./source";

describe("the pinned source", () => {
  it("names the repository and a full commit", () => {
    expect(PINNED_SOURCE.repository).toBe("DivinumOfficium/divinum-officium");
    expect(PINNED_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("a checkout read against the pinned commit", () => {
  const pinned = "a".repeat(40);

  it("is accepted at that commit with nothing changed", () => {
    expect(sourceProblems({ head: pinned, changed: [] }, pinned)).toEqual([]);
  });

  it("is refused at another commit, naming both", () => {
    const head = "b".repeat(40);
    const problems = sourceProblems({ head, changed: [] }, pinned);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(head);
    expect(problems[0]).toContain(pinned);
  });

  it("is refused with files changed under the trees it reads, naming them", () => {
    const problems = sourceProblems(
      { head: pinned, changed: ["web/www/missa/Latin/Sancti/01-21.txt"] },
      pinned
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("web/www/missa/Latin/Sancti/01-21.txt");
  });
});

describe("the state of a checkout", () => {
  let checkout: string;
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-C", checkout, "-c", "user.name=test", "-c", "user.email=test@example.org", ...args],
      { encoding: "utf-8" }
    ).trim();

  beforeEach(() => {
    checkout = mkdtempSync(join(tmpdir(), "do-checkout-"));
    mkdirSync(join(checkout, "web/www/missa"), { recursive: true });
    writeFileSync(join(checkout, "web/www/missa/day.txt"), "[Oratio]\n");
    writeFileSync(join(checkout, "README"), "sources\n");
    git("init", "--quiet");
    git("add", ".");
    git("commit", "--quiet", "-m", "sources");
  });

  afterEach(() => rmSync(checkout, { recursive: true, force: true }));

  it("is the commit checked out, with nothing changed", () => {
    expect(sourceState(checkout)).toEqual({ head: git("rev-parse", "HEAD"), changed: [] });
  });

  it("lists a file changed under the trees the pipeline reads", () => {
    writeFileSync(join(checkout, "web/www/missa/day.txt"), "[Oratio]\nedited\n");
    expect(sourceState(checkout).changed).toEqual(["web/www/missa/day.txt"]);
  });

  it("lists a file added under them", () => {
    mkdirSync(join(checkout, "web/www/horas"), { recursive: true });
    writeFileSync(join(checkout, "web/www/horas/new.txt"), "[Hymnus]\n");
    expect(sourceState(checkout).changed).toEqual(["web/www/horas/new.txt"]);
  });

  it("passes over a change the pipeline never reads", () => {
    writeFileSync(join(checkout, "README"), "edited\n");
    expect(sourceState(checkout).changed).toEqual([]);
  });

  it("is refused by the pipeline where it is not the pinned commit, saying how to go on", () => {
    expect(() => requirePinnedSource(checkout)).toThrow(git("rev-parse", "HEAD"));
    expect(() => requirePinnedSource(checkout)).toThrow(PINNED_SOURCE.commit);
    expect(() => requirePinnedSource(checkout)).toThrow("--unpinned");
  });

  it("is read as it stands when asked to, and what differs is handed back", () => {
    const problems = requirePinnedSource(checkout, { unpinned: true });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(PINNED_SOURCE.commit);
  });

  it("is refused where it is no git checkout at all", () => {
    rmSync(join(checkout, ".git"), { recursive: true, force: true });
    expect(() => requirePinnedSource(checkout)).toThrow(/not a git checkout/);
  });
});
