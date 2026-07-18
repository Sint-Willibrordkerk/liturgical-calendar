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

  it("treats a bare rank reference (no ex/vide keyword) as a vide commune pointer", () => {
    // `C5c` is a commune pointer; it goes through the same normalization as any
    // reference — `Commune/` prefix, then the `c` variant suffix stripped into a
    // condition — resolving to `Commune/C5` (which exists) rather than throwing.
    const { ex, vide } = extractExVideReferences(
      { rank: [{ value: [";;Duplex;;3;;C5c"], condition: [] }] } as never,
      "la\\Sancti\\Urbis\\11-29.yml"
    );
    expect(vide.map((r) => r.path)).toEqual(["Commune/C5"]);
    expect(vide[0]!.condition).toContain("special-c");
    expect(ex).toEqual([]);
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

  it("resolves references for files nested deeper than one dir under the language", async () => {
    // `Sancti/Urbis/…` sits two directories below the language; the reference
    // base must still resolve to `step4/<lang>`, not `step4/<lang>/Sancti`.
    base = mkdtempSync(join(tmpdir(), "lc-step4-nested-"));
    const step4 = join(base, "step4");
    await mkdir(join(step4, "la", "Sancti", "Urbis"), { recursive: true });
    await writeFile(
      join(step4, "la", "Sancti", "08-06.yml"),
      stringify({ oratio: [{ value: ["borrowed oratio"], condition: [] }] }),
      "utf-8"
    );

    const out = await transform(
      {
        rank: [{ value: [";;Semiduplex;;2;;vide Sancti/08-06"], condition: [] }],
      } as never,
      join(step4, "la", "Sancti", "Urbis", "08-07oct.yml")
    );

    expect(out.oratio).toEqual([{ value: ["borrowed oratio"], condition: [] }]);
  });
});
