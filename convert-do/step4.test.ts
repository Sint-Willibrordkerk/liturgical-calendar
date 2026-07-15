import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractExVideReferences,
  extractDependencies,
  transform,
} from "./step4";

describe("step4 extractExVideReferences", () => {
  it("collects @ preamble refs and ex/vide refs from rank", () => {
    const { ex, vide } = extractExVideReferences(
      {
        __preamble: [{ value: ["@Sancti/12-26:Lectio1"], condition: [] }],
        rank: [
          { value: [";;Duplex;;3;;ex Commune/C1"], condition: [] },
          { value: [";;Simplex;;1;;vide Sancti/12-26"], condition: ["1570"] },
        ],
      } as never,
      "la\\Sancti\\12-25.yml"
    );
    expect(ex.map((r) => r.path).sort()).toEqual(["Commune/C1", "Sancti/12-26"]);
    expect(vide.map((r) => r.path)).toEqual(["Sancti/12-26"]);
    expect(vide[0]!.condition).toEqual(["1570"]);
  });
});

describe("step4 extractDependencies", () => {
  it("returns the set of referenced file paths", () => {
    const deps = extractDependencies(
      { rank: [{ value: [";;Duplex;;3;;ex Commune/C1"], condition: [] }] } as never,
      "la\\Sancti\\12-25.yml"
    );
    expect([...deps]).toEqual(["Commune/C1"]);
  });
});

describe("step4 transform", () => {
  let base: string | undefined;
  afterEach(() => {
    if (base) rmSync(base, { recursive: true, force: true });
    base = undefined;
  });

  it("imports sections from an `ex` reference and drops the preamble", async () => {
    base = mkdtempSync(join(tmpdir(), "lc-step4-"));
    await mkdir(join(base, "la", "Commune"), { recursive: true });
    await mkdir(join(base, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(base, "la", "Commune", "C1.yml"),
      stringify({ lectio1: [{ value: ["borrowed lectio"], condition: [] }] }),
      "utf-8"
    );

    const out = await transform(
      {
        __preamble: [{ value: ["ignored"], condition: [] }],
        rank: [{ value: [";;Duplex;;3;;ex Commune/C1"], condition: [] }],
      } as never,
      join(base, "la", "Sancti", "12-25.yml")
    );

    expect(out.__preamble).toBeUndefined();
    expect(out.lectio1).toEqual([
      { value: ["borrowed lectio"], condition: [] },
    ]);
  });
});
