import { describe, expect, it } from "vitest";
import {
  transform,
  extractCommemorations,
  withoutCommemoratioKeys,
  commemorationNameToSlug,
} from "./step8";

describe("step8 commemorations", () => {
  it("slugs a Pro-line, dropping the S./Ss. honorific", () => {
    expect(commemorationNameToSlug("!Pro S. Anastasia")).toBe("anastasia");
    expect(commemorationNameToSlug("Pro Ss. Stephano Protomartyre")).toBe(
      "stephano-protomartyre"
    );
    expect(commemorationNameToSlug("not a pro line")).toBeNull();
  });

  it("extracts commemoration sections keyed by slug", () => {
    const comms = extractCommemorations({
      "commemoratio-oratio": ["!Pro S. Anastasia", "oratio line 1"],
      "commemoratio-secreta": ["!Pro S. Anastasia", "secreta line 1"],
    });
    expect(comms).toHaveLength(1);
    expect(comms[0]).toMatchObject({
      slug: "anastasia",
      displayName: "S. Anastasia",
      oratio: ["oratio line 1"],
      secreta: ["secreta line 1"],
      postcommunio: [],
    });
  });

  it("groups distinct saints separately", () => {
    const comms = extractCommemorations({
      "commemoratio-oratio": ["!Pro S. Anastasia", "a"],
      "commemoratio-oratio/1570": ["!Pro S. Stephano", "b"],
    });
    expect(comms.map((c) => c.slug).sort()).toEqual(["anastasia", "stephano"]);
  });

  it("removes commemoratio keys from the main object", () => {
    expect(
      withoutCommemoratioKeys({
        lectio1: ["x"],
        "commemoratio-oratio": ["!Pro S. Anastasia", "a"],
        "commemoratio-postcommunio/1570": ["!Pro S. Anastasia", "b"],
      })
    ).toEqual({ lectio1: ["x"] });
  });

  it("transform returns both the stripped main and the commemorations", () => {
    const { main, commemorations } = transform({
      lectio1: ["x"],
      "commemoratio-oratio": ["!Pro S. Anastasia", "a"],
    });
    expect(main).toEqual({ lectio1: ["x"] });
    expect(commemorations).toHaveLength(1);
    expect(commemorations[0]!.slug).toBe("anastasia");
  });
});
