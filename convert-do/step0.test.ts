import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Avoid `.env` overriding `DIVINUM_OFFICIUM_BASE` when step0 loads. */
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

import { transform, getOutputFile } from "./step0";

describe("step0 transform", () => {
  it("splits on LF and CRLF into a line array", () => {
    expect(transform("a\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("keeps a trailing empty line as an element", () => {
    expect(transform("x\n")).toEqual(["x", ""]);
  });
});

describe("step0 getOutputFile", () => {
  it("renames .txt to .yml and the language folder to its ISO code", () => {
    expect(getOutputFile("missa\\Latin\\02-02.txt")).toBe("missa\\la\\02-02.yml");
    expect(getOutputFile("horas\\Nederlands\\01-01.txt")).toBe(
      "horas\\nl\\01-01.yml"
    );
  });

  it("passes horas\\Ordinarium through without a language rename", () => {
    expect(getOutputFile("horas\\Ordinarium\\Prima.txt")).toBe(
      "horas\\Ordinarium\\Prima.yml"
    );
  });

  it("throws for an unknown language folder", () => {
    expect(() => getOutputFile("horas\\Klingon\\x.txt")).toThrow(
      /Unknown language/
    );
  });
});

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

    const normalized = files.map((f) => f.replace(/\\/g, "/"));
    expect(normalized).toContain("horas/Latin/01-01.txt");
    expect(normalized).toContain("missa/Latin/02-02.txt");
    expect(directories.length).toBeGreaterThan(0);
  });
});
