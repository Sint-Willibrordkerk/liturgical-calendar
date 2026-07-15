import { describe, expect, it } from "vitest";
import { transform, conditionSuffix } from "./step6";

describe("step6 materialize", () => {
  it("keeps the empty-condition variant on the base key", () => {
    const out = transform({
      lectio1: [{ value: ["X"], condition: [] }],
    });
    expect(out).toEqual({ lectio1: ["X"] });
  });

  it("splits conditional variants into suffixed keys", () => {
    const out = transform({
      lectio1: [
        { value: ["X"], condition: [] },
        { value: ["Y"], condition: ["1570"] },
      ],
    });
    expect(out).toEqual({ lectio1: ["X"], "lectio1/1570": ["Y"] });
  });

  it("joins multi-token conditions in sorted order", () => {
    expect(conditionSuffix(["octava", "1570"])).toBe("1570-octava");
    const out = transform({
      oratio: [{ value: ["Z"], condition: ["octava", "1570"] }],
    });
    expect(out).toEqual({ "oratio/1570-octava": ["Z"] });
  });

  it("passes non-variant values through untouched", () => {
    const out = transform({
      // e.g. a plain scalar that slipped through
      name: "Sanctae Mariae" as unknown as never,
    });
    expect(out).toEqual({ name: "Sanctae Mariae" });
  });
});
