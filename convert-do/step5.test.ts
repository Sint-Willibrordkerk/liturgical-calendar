import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it } from "vitest";
import { extractDependencies, transform } from "./step5";

describe("step5 extractDependencies", () => {
  it("returns file paths from inline @File:Section references", () => {
    const deps = extractDependencies(
      { lectio1: [{ value: ["@Sancti/12-26:Lectio1"], condition: [] }] } as never,
      "la\\Sancti\\12-25.json"
    );
    expect([...deps]).toEqual(["Sancti/12-26"]);
  });
});

describe("step5 transform", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("inlines a referenced section's lines in place of the @ reference", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step5-"));
    // Inline references read the materialized step4 tree; the base path needs a
    // `step{N}/<lang>` segment for the language root to be located.
    const base = join(root, "step4");
    await mkdir(join(base, "la", "Commune"), { recursive: true });
    await mkdir(join(base, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(base, "la", "Commune", "C1.json"),
      JSON.stringify({ lectio1: [{ value: ["borrowed lectio"], condition: [] }] }),
      "utf-8"
    );

    const out = await transform(
      { lectio1: [{ value: ["@Commune/C1:Lectio1"], condition: [] }] } as never,
      join(base, "la", "Sancti", "12-25.json")
    );

    expect(out.lectio1).toEqual([
      { value: ["borrowed lectio"], condition: [] },
    ]);
  });

  it("resolves an omitted-File reference (@:Section) against the current file", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step5-self-"));
    const base = join(root, "step4");
    await mkdir(join(base, "la", "Sancti"), { recursive: true });
    // The current file's own materialized (step4) version holds the section.
    await writeFile(
      join(base, "la", "Sancti", "12-25.json"),
      JSON.stringify({ oratio: [{ value: ["self oratio"], condition: [] }] }),
      "utf-8"
    );

    const out = await transform(
      { intro: [{ value: ["@:Oratio"], condition: [] }] } as never,
      join(base, "la", "Sancti", "12-25.json")
    );

    expect(out.intro).toEqual([{ value: ["self oratio"], condition: [] }]);
  });
});
