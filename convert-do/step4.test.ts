import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

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
      "la\\Sancti\\12-25.json"
    );
    expect(ex.map((r) => r.path).sort()).toEqual(["Commune/C1", "Sancti/12-26"]);
    expect(vide.map((r) => r.path)).toEqual(["Sancti/12-26"]);
    expect(vide[0]!.condition).toEqual(["1570"]);
  });

  it("treats a bare rank reference (no ex/vide keyword) as a vide commune pointer", () => {
    // `C5c` is a commune pointer; it only gains the `Commune/` prefix and
    // resolves directly to `Commune/C5c` (its own file). No suffix is stripped:
    // at this step variant files are not yet folded.
    const { ex, vide } = extractExVideReferences(
      { rank: [{ value: [";;Duplex;;3;;C5c"], condition: [] }] } as never,
      "la\\Sancti\\Urbis\\11-29.json"
    );
    expect(vide.map((r) => r.path)).toEqual(["Commune/C5c"]);
    expect(vide[0]!.condition).toEqual([]);
    expect(ex).toEqual([]);
  });

  it("resolves a variant-directory reference as written, without folding it", () => {
    // Variant directories are still separate at step 4, so `@SanctiM/11-14M`
    // points at its own file rather than being rewritten to `Sancti/11-14`.
    const { ex } = extractExVideReferences(
      { __preamble: [{ value: ["@SanctiM/11-14M"], condition: [] }] } as never,
      "la\\SanctiOP\\11-14M.json"
    );
    expect(ex.map((r) => r.path)).toEqual(["SanctiM/11-14M"]);
    expect(ex[0]!.condition).toEqual([]);
  });
});

describe("step4 extractDependencies", () => {
  it("returns the set of referenced file paths", () => {
    const deps = extractDependencies(
      { rank: [{ value: [";;Duplex;;3;;ex Commune/C1"], condition: [] }] } as never,
      "la\\Sancti\\12-25.json"
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
      join(base, "la", "Commune", "C1.json"),
      JSON.stringify({ lectio1: [{ value: ["borrowed lectio"], condition: [] }] }),
      "utf-8"
    );

    const out = await transform(
      {
        __preamble: [{ value: ["ignored"], condition: [] }],
        rank: [{ value: [";;Duplex;;3;;ex Commune/C1"], condition: [] }],
      } as never,
      join(base, "la", "Sancti", "12-25.json")
    );

    expect(out.__preamble).toBeUndefined();
    expect(out.lectio1).toEqual([
      { value: ["borrowed lectio"], condition: [] },
    ]);
  });

  it("borrows the common's mass where the day resolves none of its own", async () => {
    base = mkdtempSync(join(tmpdir(), "lc-step4-gap-"));
    await mkdir(join(base, "la", "Commune"), { recursive: true });
    await mkdir(join(base, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(base, "la", "Commune", "C2a.json"),
      JSON.stringify({
        oratio: [{ value: ["common collect"], condition: [] }],
        introitus: [{ value: ["common introit"], condition: [] }],
        secreta: [{ value: ["common secret"], condition: [] }],
      }),
      "utf-8"
    );

    const out = await transform(
      { rank: [{ value: [";;Simplex;;1.1;;vide Commune/C2a"], condition: [] }] } as never,
      join(base, "la", "Sancti", "09-08cc.json")
    );

    expect(out.oratio).toEqual([{ value: ["common collect"], condition: [] }]);
    expect(out.introitus).toEqual([{ value: ["common introit"], condition: [] }]);
    expect(out.secreta).toEqual([{ value: ["common secret"], condition: [] }]);
  });

  it("leaves a mass the day already resolved alone", async () => {
    base = mkdtempSync(join(tmpdir(), "lc-step4-own-"));
    await mkdir(join(base, "la", "Commune"), { recursive: true });
    await mkdir(join(base, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(base, "la", "Commune", "C2a.json"),
      JSON.stringify({ introitus: [{ value: ["common introit"], condition: [] }] }),
      "utf-8"
    );

    const out = await transform(
      {
        rank: [{ value: [";;Simplex;;1.1;;vide Commune/C2a"], condition: [] }],
        introitus: [{ value: ["its own introit"], condition: [] }],
      } as never,
      join(base, "la", "Sancti", "09-08cc.json")
    );

    expect(out.introitus).toEqual([{ value: ["its own introit"], condition: [] }]);
  });

  it("does not borrow the rest of the office", async () => {
    base = mkdtempSync(join(tmpdir(), "lc-step4-office-"));
    await mkdir(join(base, "la", "Commune"), { recursive: true });
    await mkdir(join(base, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(base, "la", "Commune", "C2a.json"),
      JSON.stringify({
        "hymnus-laudes": [{ value: ["a hymn"], condition: [] }],
        responsory1: [{ value: ["a responsory"], condition: [] }],
      }),
      "utf-8"
    );

    const out = await transform(
      { rank: [{ value: [";;Simplex;;1.1;;vide Commune/C2a"], condition: [] }] } as never,
      join(base, "la", "Sancti", "09-08cc.json")
    );

    expect(out["hymnus-laudes"]).toBeUndefined();
    expect(out.responsory1).toBeUndefined();
  });

  it("resolves references for files nested deeper than one dir under the language", async () => {
    // `Sancti/Urbis/…` sits two directories below the language; the reference
    // base must still resolve to `step4/<lang>`, not `step4/<lang>/Sancti`.
    base = mkdtempSync(join(tmpdir(), "lc-step4-nested-"));
    const step4 = join(base, "step4");
    await mkdir(join(step4, "la", "Sancti", "Urbis"), { recursive: true });
    await writeFile(
      join(step4, "la", "Sancti", "08-06.json"),
      JSON.stringify({ oratio: [{ value: ["borrowed oratio"], condition: [] }] }),
      "utf-8"
    );

    const out = await transform(
      {
        rank: [{ value: [";;Semiduplex;;2;;vide Sancti/08-06"], condition: [] }],
      } as never,
      join(step4, "la", "Sancti", "Urbis", "08-07oct.json")
    );

    expect(out.oratio).toEqual([{ value: ["borrowed oratio"], condition: [] }]);
  });
});


describe("step4 the day's own text takes precedence", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("does not let an include under a rubric override the day's own section", async () => {
    // The Assumption gives its own Introit unconditionally, and its 1962 rank
    // line includes a common. Imported at `1962` the common would out-rank the
    // day's own whenever that rubric is in force.
    root = mkdtempSync(join(tmpdir(), "lc-step4-precedence-"));
    await mkdir(join(root, "la", "Commune"), { recursive: true });
    await mkdir(join(root, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(root, "la", "Commune", "C11.json"),
      JSON.stringify({
        introitus: [{ value: ["Salve, sancta parens"], condition: [] }],
      }),
      "utf-8"
    );

    const out = await transform(
      {
        rank: [
          { value: [";;Duplex I classis;;6.5;;ex Commune/C11"], condition: ["1962"] },
        ],
        introitus: [{ value: ["Signum magnum"], condition: [] }],
      } as never,
      join(root, "la", "Sancti", "08-15.json")
    );

    expect(out.introitus).toEqual([
      { value: ["Signum magnum"], condition: [] },
    ]);
  });

  it("still imports a section the day does not give at all", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step4-fill-"));
    await mkdir(join(root, "la", "Commune"), { recursive: true });
    await mkdir(join(root, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(root, "la", "Commune", "C11.json"),
      JSON.stringify({
        introitus: [{ value: ["from the common"], condition: [] }],
      }),
      "utf-8"
    );

    const out = await transform(
      {
        rank: [{ value: [";;Duplex;;3;;ex Commune/C11"], condition: ["1962"] }],
      } as never,
      join(root, "la", "Sancti", "08-15.json")
    );

    expect(out.introitus).toEqual([
      { value: ["from the common"], condition: ["1962"] },
    ]);
  });

  it("still imports where the day covers only another rubric", async () => {
    // The day's own applies only under `cisterciensis`, so it does not cover the
    // unconditional case the common supplies.
    root = mkdtempSync(join(tmpdir(), "lc-step4-partial-"));
    await mkdir(join(root, "la", "Commune"), { recursive: true });
    await mkdir(join(root, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(root, "la", "Commune", "C11.json"),
      JSON.stringify({
        introitus: [{ value: ["from the common"], condition: [] }],
      }),
      "utf-8"
    );

    const out = await transform(
      {
        rank: [{ value: [";;Duplex;;3;;ex Commune/C11"], condition: [] }],
        introitus: [{ value: ["cistercian only"], condition: ["cisterciensis"] }],
      } as never,
      join(root, "la", "Sancti", "08-15.json")
    );

    expect(out.introitus).toEqual([
      { value: ["cistercian only"], condition: ["cisterciensis"] },
      { value: ["from the common"], condition: [] },
    ]);
  });
});
