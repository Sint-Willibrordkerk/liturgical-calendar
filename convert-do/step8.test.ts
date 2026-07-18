import { describe, expect, it } from "vitest";
import {
  transform,
  extractCommemorations,
  withoutCommemoratioKeys,
  commemorationNameToSlug,
} from "./step8";

const v = (value: string[], condition: string[] = []) => ({ value, condition });

describe("step8 commemorations", () => {
  it("slugs a Pro-line, dropping the S./Ss. honorific", () => {
    expect(commemorationNameToSlug("!Pro S. Anastasia")).toBe("anastasia");
    expect(commemorationNameToSlug("Pro Ss. Stephano Protomartyre")).toBe(
      "stephano-protomartyre"
    );
    expect(commemorationNameToSlug("not a pro line")).toBeNull();
  });

  it("extracts commemoration sections keyed by slug, preserving variants", () => {
    const comms = extractCommemorations({
      "commemoratio-oratio": [v(["!Pro S. Anastasia", "oratio line 1"])],
      "commemoratio-secreta": [v(["!Pro S. Anastasia", "secreta line 1"])],
    });
    expect(comms).toHaveLength(1);
    expect(comms[0]).toMatchObject({
      slug: "anastasia",
      displayName: "S. Anastasia",
      oratio: [v(["oratio line 1"])],
      secreta: [v(["secreta line 1"])],
      postcommunio: [],
    });
  });

  it("splits distinct saints across a section's variants", () => {
    const comms = extractCommemorations({
      "commemoratio-oratio": [
        v(["!Pro S. Anastasia", "a"]),
        v(["!Pro S. Stephano", "b"], ["1570"]),
      ],
    });
    expect(comms.map((c) => c.slug).sort()).toEqual(["anastasia", "stephano"]);
    const stephano = comms.find((c) => c.slug === "stephano")!;
    expect(stephano.oratio).toEqual([v(["b"], ["1570"])]);
  });

  it("removes commemoratio keys from the main object", () => {
    expect(
      withoutCommemoratioKeys({
        lectio1: [v(["x"])],
        "commemoratio-oratio": [v(["!Pro S. Anastasia", "a"])],
      })
    ).toEqual({ lectio1: [v(["x"])] });
  });

  it("transform returns both the stripped main and the commemorations", () => {
    const { main, commemorations } = transform({
      lectio1: [v(["x"])],
      "commemoratio-oratio": [v(["!Pro S. Anastasia", "a"])],
    });
    expect(main).toEqual({ lectio1: [v(["x"])] });
    expect(commemorations).toHaveLength(1);
    expect(commemorations[0]!.slug).toBe("anastasia");
  });
});
