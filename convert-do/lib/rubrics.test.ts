import { describe, expect, it } from "vitest";
import { isOtherRubricSystem, requiresOtherEdition } from "./rubrics";

describe("isOtherRubricSystem", () => {
  it("knows editions, uses and local systems", () => {
    for (const t of ["1570", "1888", "monastica", "cisterciensis", "divino"]) {
      expect(isOtherRubricSystem(t, "1962")).toBe(true);
    }
    expect(isOtherRubricSystem("dioecesis Monacensis", "1962")).toBe(true);
  });

  it("is not the system in force", () => {
    expect(isOtherRubricSystem("1962", "1962")).toBe(false);
  });

  it("leaves circumstance tokens alone", () => {
    for (const t of ["octava", "commemoratio", "adventus", "feria-4"]) {
      expect(isOtherRubricSystem(t, "1962")).toBe(false);
    }
  });

  it("ignores capitalisation and the grammar caret", () => {
    expect(isOtherRubricSystem("Monastica", "1962")).toBe(true);
    expect(isOtherRubricSystem("^Monastica", "1962")).toBe(true);
  });
});

describe("requiresOtherEdition", () => {
  it("is true when a condition names another edition", () => {
    expect(requiresOtherEdition(["1888"])).toBe(true);
    expect(requiresOtherEdition(["1962", "1888"])).toBe(true);
    expect(requiresOtherEdition(["cisterciensis", "1570"])).toBe(true);
  });

  it("is false for the published edition, or none", () => {
    expect(requiresOtherEdition([])).toBe(false);
    expect(requiresOtherEdition(["1962"])).toBe(false);
  });

  it("does not treat a use as an edition", () => {
    // A use runs in parallel with the published edition; its names are kept.
    expect(requiresOtherEdition(["cisterciensis"])).toBe(false);
    expect(requiresOtherEdition(["monastica", "commemoratio"])).toBe(false);
  });
});
