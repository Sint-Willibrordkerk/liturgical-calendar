import { describe, expect, it } from "vitest";
import { transform, getOutputFile } from "./step2";

describe("step2 getOutputFile", () => {
  it("strips the missa root so hours and mass collapse onto one path", () => {
    expect(getOutputFile("root\\missa\\Sancti\\01-01.yml")).toBe(
      "root\\Sancti\\01-01.yml"
    );
  });

  it("strips the horas root", () => {
    expect(getOutputFile("root\\horas\\Sancti\\01-01.yml")).toBe(
      "root\\Sancti\\01-01.yml"
    );
  });

  it("strips the root on POSIX paths", () => {
    expect(getOutputFile("root/missa/Sancti/01-01.yml")).toBe(
      "root/Sancti/01-01.yml"
    );
    expect(getOutputFile("root/horas/Sancti/01-01.yml")).toBe(
      "root/Sancti/01-01.yml"
    );
  });

  it("leaves a variant directory and filename suffix untouched (step 3's job)", () => {
    expect(getOutputFile("root\\missa\\SanctiCist\\01-01t.yml")).toBe(
      "root\\SanctiCist\\01-01t.yml"
    );
  });
});

describe("step2 transform", () => {
  it("passes section content through unchanged", () => {
    const obj = { oratio: [{ value: ["x"], condition: ["1570"] }] };
    expect(transform(obj)).toEqual(obj);
  });
});
