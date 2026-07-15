import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Avoid `.env` overriding `DIVINUM_OFFICIUM_BASE` when step0 loads. */
vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
}));

describe("step0 getInputFiles", () => {
  let fixtureRoot: string | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    if (fixtureRoot) {
      try {
        rmSync(fixtureRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      fixtureRoot = undefined;
    }
    delete process.env.DIVINUM_OFFICIUM_BASE;
  });

  it("collects matching Latin horas and missa paths under web/www", async () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "lc-step0-gif-"));
    const www = join(fixtureRoot, "web", "www");
    await mkdir(join(www, "horas", "Latin"), { recursive: true });
    await mkdir(join(www, "missa", "Latin"), { recursive: true });
    await writeFile(join(www, "horas", "Latin", "01-01.txt"), "a\n", "utf-8");
    await writeFile(join(www, "missa", "Latin", "02-02.txt"), "b\n", "utf-8");

    process.env.DIVINUM_OFFICIUM_BASE = fixtureRoot;
    vi.resetModules();
    const { getInputFiles } = await import("./step0");

    const { files, directories } = await getInputFiles();

    console.log({ files, directories });

    const normalized = files.map((f) => f.replace(/\\/g, "/"));
    expect(normalized).toContain("horas/Latin/01-01.txt");
    expect(normalized).toContain("missa/Latin/02-02.txt");
    expect(directories.length).toBeGreaterThan(0);
  });
});
