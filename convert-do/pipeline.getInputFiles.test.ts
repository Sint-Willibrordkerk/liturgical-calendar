import { mkdtempSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("pipeline getInputFiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fromStep 1 lists files under .divinum-officium/step0 relative to cwd", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "lc-getInputFiles-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);
    const ymlPath = join(tmpRoot, ".divinum-officium", "step0", "la", "01-01.yml");
    await mkdir(join(tmpRoot, ".divinum-officium", "step0", "la"), {
      recursive: true,
    });
    await writeFile(ymlPath, "k: v\n", "utf-8");

    vi.resetModules();
    const { getInputFiles } = await import("./pipeline");

    const result = await getInputFiles(1);

    const normalized = result.files.map((f) =>
      f.replace(/\\/g, "/").replace(/^\/+/, "")
    );
    expect(normalized).toContain("la/01-01.yml");
  });
});
