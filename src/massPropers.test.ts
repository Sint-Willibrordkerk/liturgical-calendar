import { describe, expect, it } from "vitest";
import { selectVariant, resolveReading, selectMassProper } from "./massPropers";

const v = <T>(value: T, condition: string[] = []) => ({ value, condition });
const rubrics = (...tokens: string[]) => new Set(tokens);

describe("selectVariant", () => {
  it("prefers the variant matching the rubric over the unconditional one", () => {
    expect(
      selectVariant([v("default"), v("proper", ["1962"])], rubrics("1962"))
    ).toBe("proper");
  });

  it("falls back to the unconditional variant when no rubric matches", () => {
    expect(
      selectVariant([v("default"), v("monastic", ["monastica"])], rubrics("1962"))
    ).toBe("default");
  });

  it("resolves a collapsed section, where only the default remains", () => {
    // The pipeline drops variants repeating the default, so a day under a rubric
    // with no variant of its own must still read the default's content.
    expect(selectVariant([v("shared")], rubrics("1962"))).toBe("shared");
  });

  it("never picks a variant demanding a rubric that is not in force", () => {
    expect(
      selectVariant(
        [v("monastic", ["monastica", "1962"]), v("plain", ["1962"])],
        rubrics("1962")
      )
    ).toBe("plain");
  });

  it("prefers the most specific applicable variant", () => {
    expect(
      selectVariant(
        [v("a"), v("b", ["1962"]), v("c", ["1962", "monastica"])],
        rubrics("1962", "monastica")
      )
    ).toBe("c");
  });

  it("returns undefined when the section varies only by absent rubrics", () => {
    expect(
      selectVariant(
        [v("x", ["monastica"]), v("y", ["cisterciensis"])],
        rubrics("1962")
      )
    ).toBeUndefined();
  });

  it("passes a section that is not a variant list straight through", () => {
    expect(selectVariant("trinitate", rubrics("1962"))).toBe("trinitate");
  });

  it("reads a missing condition as the unconditional variant", () => {
    // Step 11 omits an empty condition rather than writing it out.
    expect(
      selectVariant(
        [{ value: "default" }, { value: "octave", condition: ["octava"] }],
        rubrics("1962")
      )
    ).toBe("default");
  });

  it("still prefers a matching rubric over a condition-less variant", () => {
    expect(
      selectVariant(
        [{ value: "default" }, { value: "octave", condition: ["octava"] }],
        rubrics("1962", "octava")
      )
    ).toBe("octave");
  });

  it("passes a compacted section — a bare value — straight through", () => {
    const compacted = { ref: "Rom 1:1", verses: ["Paulus"] };
    expect(selectVariant(compacted, rubrics("1962"))).toBe(compacted);
  });
});

describe("resolveReading", () => {
  const store = {
    "rom-1-1": { ref: "Rom 1:1", verses: ["Paulus", "Grátia"] },
  };

  it("replaces a key by the reading it names", () => {
    expect(resolveReading("rom-1-1", store)).toEqual({
      ref: "Rom 1:1",
      verses: ["Paulus", "Grátia"],
    });
  });

  it("leaves a reading that was shipped whole", () => {
    const inline = { ref: "Isa 1:1", text: "Vísio" };
    expect(resolveReading(inline, store)).toBe(inline);
  });

  it("has nothing for a key the store does not hold", () => {
    expect(resolveReading("missing", store)).toBeUndefined();
  });
});

describe("selectMassProper", () => {
  const stores = {
    readings: {
      "rom-1-1": { ref: "Rom 1:1", verses: ["Paulus"] },
      "matt-5-1": { ref: "Matt 5:1", verses: ["In illo témpore"] },
    },
    prayers: {
      "deus-qui-nos-beati-1a2b3c4d": { text: "Deus", closure: "Per Dominum" },
    },
    chants: {
      "ps-65-4": { antiphon: { ref: "Ps 65:4", text: "Omnis terra" } },
    },
  };

  it("selects each section and resolves its readings", () => {
    expect(
      selectMassProper(
        {
          introitus: [v("ps-65-4"), v("nope", ["monastica"])],
          lectio: [v("rom-1-1")],
          evangelium: [v("matt-5-1")],
          oratio: [v("deus-qui-nos-beati-1a2b3c4d")],
        },
        rubrics("1962"),
        stores
      )
    ).toEqual({
      introitus: { antiphon: { ref: "Ps 65:4", text: "Omnis terra" } },
      lectio: { ref: "Rom 1:1", verses: ["Paulus"] },
      evangelium: { ref: "Matt 5:1", verses: ["In illo témpore"] },
      oratio: { text: "Deus", closure: "Per Dominum" },
    });
  });

  it("leaves out a section that has nothing for this rubric", () => {
    expect(
      selectMassProper(
        {
          oratio: [v({ text: "keep" })],
          tractus: [v({ text: "drop" }, ["monastica"])],
        },
        rubrics("1962"),
        stores
      )
    ).toEqual({ oratio: { text: "keep" } });
  });

  it("resolves the rubric before the reading, so each rubric reads its own", () => {
    expect(
      selectMassProper(
        { lectio: [v("rom-1-1"), v("matt-5-1", ["1962"])] },
        rubrics("1962"),
        stores
      )
    ).toEqual({ lectio: { ref: "Matt 5:1", verses: ["In illo témpore"] } });
  });

  it("keeps a reading the pipeline left inline", () => {
    const inline = { ref: "Eccli 44:1", text: "Beátus vir" };
    expect(
      selectMassProper({ lectio: [v(inline)] }, rubrics("1962"), stores)
    ).toEqual({ lectio: inline });
  });
});
