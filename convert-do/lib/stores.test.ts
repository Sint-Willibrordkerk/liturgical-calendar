import { describe, expect, it } from "vitest";
import { isStoreFile } from "./stores";

describe("isStoreFile", () => {
  it("recognises the stores at a language root", () => {
    expect(isStoreFile("la/lectio.json")).toBe(true);
    expect(isStoreFile("la\\oratio.json")).toBe(true);
    expect(isStoreFile("nl/antiphona.json")).toBe(true);
  });

  it("does not take a document for a store", () => {
    expect(isStoreFile("la/Sancti/lectio.json")).toBe(false);
    expect(isStoreFile("la/Sancti/01-01.json")).toBe(false);
    expect(isStoreFile("la/ordo.json")).toBe(false);
  });
});
