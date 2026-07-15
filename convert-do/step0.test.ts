import { describe, expect, it, vi } from "vitest";

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
