import { describe, expect, it } from "vitest";
import { transform, getOutputFile } from "./step2";

describe("step2 getOutputFile", () => {
  it("files the Mass below its language, beside the Office", () => {
    expect(getOutputFile("root\\missa\\la\\Sancti\\01-01.json")).toBe(
      "root\\la\\missa\\Sancti\\01-01.json"
    );
    expect(getOutputFile("root\\horas\\la\\Sancti\\01-01.json")).toBe(
      "root\\la\\horas\\Sancti\\01-01.json"
    );
  });

  it("does the same on POSIX paths", () => {
    expect(getOutputFile("root/missa/nl/Sancti/01-01.json")).toBe(
      "root/nl/missa/Sancti/01-01.json"
    );
  });

  it("keeps the Mass and the Office of a day apart", () => {
    expect(getOutputFile("root/missa/la/Sancti/01-01.json")).not.toBe(
      getOutputFile("root/horas/la/Sancti/01-01.json")
    );
  });

  it("leaves a variant directory and filename suffix untouched (step 8's job)", () => {
    expect(getOutputFile("root\\missa\\la\\SanctiCist\\01-01t.json")).toBe(
      "root\\la\\missa\\SanctiCist\\01-01t.json"
    );
  });
});

describe("step2 transform", () => {
  it("passes section content through unchanged", () => {
    const obj = { oratio: [{ value: ["x"], condition: ["1570"] }] };
    expect(transform(obj)).toEqual(obj);
  });
});
