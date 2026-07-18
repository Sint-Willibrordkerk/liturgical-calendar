import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { extractDependencies, transform } from "./step6";

describe("step6 extractDependencies", () => {
  it("returns file paths from inline @File:Section references", () => {
    const deps = extractDependencies(
      { lectio1: [{ value: ["@Sancti/12-26:Lectio1"], condition: [] }] } as never,
      "la\\Sancti\\12-25.yml"
    );
    expect([...deps]).toEqual(["Sancti/12-26"]);
  });
});

describe("step6 transform", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("inlines a referenced section's lines in place of the @ reference", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step6-"));
    // getLanguageBasePath requires a `step5/<lang>` segment in the path.
    const base = join(root, "step5");
    await mkdir(join(base, "la", "Commune"), { recursive: true });
    await mkdir(join(base, "la", "Sancti"), { recursive: true });
    await writeFile(
      join(base, "la", "Commune", "C1.yml"),
      stringify({ lectio1: [{ value: ["borrowed lectio"], condition: [] }] }),
      "utf-8"
    );

    const out = await transform(
      { lectio1: [{ value: ["@Commune/C1:Lectio1"], condition: [] }] } as never,
      join(base, "la", "Sancti", "12-25.yml")
    );

    expect(out.lectio1).toEqual([
      { value: ["borrowed lectio"], condition: [] },
    ]);
  });
});
