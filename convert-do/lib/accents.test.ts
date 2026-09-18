import { describe, expect, it } from "vitest";
import { acuteCount, foldAcute } from "./accents.js";

describe("foldAcute", () => {
  it("removes acute accents, keeping case and other marks", () => {
    expect(foldAcute("Prophéta")).toBe("Propheta");
    expect(foldAcute("vocáberis")).toBe("vocaberis");
    // A diaeresis is not an acute and stays.
    expect(foldAcute("ördines")).toBe("ördines");
    // The acute on a ligature is folded; the ligature itself is kept.
    expect(foldAcute("Judǽam")).toBe("Judæam");
  });

  it("leaves a word with no acute untouched", () => {
    expect(foldAcute("cœli")).toBe("cœli");
    expect(foldAcute("ejus")).toBe("ejus");
    expect(foldAcute("et")).toBe("et");
  });

  it("folds a whole phrase", () => {
    expect(foldAcute("Tu, puer, Prophéta Altíssimi vocáberis.")).toBe(
      "Tu, puer, Propheta Altissimi vocaberis."
    );
  });
});

describe("acuteCount", () => {
  it("counts the acute accents", () => {
    expect(acuteCount("Propheta")).toBe(0);
    expect(acuteCount("Prophéta")).toBe(1);
    expect(acuteCount("Prophéta Altíssimi vocáberis")).toBe(3);
    expect(acuteCount("ördines")).toBe(0);
  });
});
