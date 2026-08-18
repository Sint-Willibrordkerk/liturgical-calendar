import { describe, expect, it } from "vitest";
import {
  selectVariant,
  resolveReading,
  selectMassProper,
  READING_SECTIONS,
  PRAYER_SECTIONS,
  CHANT_SECTIONS,
  isPaschaltide,
  isBeforeEaster,
  applySeason,
  nameSaint,
} from "./massPropers";

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

describe("the store contract", () => {
  it("resolves every chant section, alleluia included", () => {
    // Each published chant section must draw on the chant store. Adding one to
    // the pipeline without adding it here left its key unresolved in the
    // calendar, so assert the whole set resolves rather than a sample.
    const stores = { readings: {}, prayers: {}, chants: {} } as never;
    for (const key of CHANT_SECTIONS) {
      (stores as { chants: Record<string, unknown> }).chants[`k-${key}`] = {
        ref: key,
      };
    }
    const document = Object.fromEntries(
      [...CHANT_SECTIONS].map((key) => [key, [v(`k-${key}`)]])
    );
    const out = selectMassProper(document, rubrics("1962"), stores);
    for (const key of CHANT_SECTIONS) {
      expect(out[key], `${key} should resolve`).toEqual({ ref: key });
    }
  });

  it("resolves every reading and prayer section", () => {
    const stores = {
      readings: Object.fromEntries(
        [...READING_SECTIONS].map((k) => [`k-${k}`, { ref: k, text: k }])
      ),
      prayers: Object.fromEntries(
        [...PRAYER_SECTIONS].map((k) => [`k-${k}`, { text: k }])
      ),
      chants: {},
    } as never;
    const document = Object.fromEntries(
      [...READING_SECTIONS, ...PRAYER_SECTIONS].map((k) => [k, [v(`k-${k}`)]])
    );
    const out = selectMassProper(document, rubrics("1962"), stores);
    for (const key of [...READING_SECTIONS, ...PRAYER_SECTIONS]) {
      expect(out[key], `${key} should resolve`).toBeDefined();
      expect(typeof out[key], `${key} should not stay a key`).not.toBe("string");
    }
  });
});

describe("the season", () => {
  // Easter 2026 falls on 5 April; Septuagesima on 1 February.
  const easter = new Date(Date.UTC(2026, 3, 5));
  const on = (m: number, d: number) => new Date(2026, m - 1, d);

  it("knows paschaltide, Easter to the Saturday in the octave of Pentecost", () => {
    expect(isPaschaltide(on(4, 5), easter)).toBe(true); // Easter Sunday
    expect(isPaschaltide(on(5, 14), easter)).toBe(true); // Ascension
    expect(isPaschaltide(on(5, 24), easter)).toBe(true); // Pentecost
    expect(isPaschaltide(on(5, 30), easter)).toBe(true); // Saturday in the octave
    expect(isPaschaltide(on(4, 4), easter)).toBe(false); // Holy Saturday
    expect(isPaschaltide(on(5, 31), easter)).toBe(false); // Trinity Sunday
  });

  it("knows the penitential weeks, Septuagesima up to Easter", () => {
    expect(isBeforeEaster(on(2, 1), easter)).toBe(true); // Septuagesima
    expect(isBeforeEaster(on(2, 18), easter)).toBe(true); // Ash Wednesday
    expect(isBeforeEaster(on(4, 4), easter)).toBe(true); // Holy Saturday
    expect(isBeforeEaster(on(1, 31), easter)).toBe(false); // the day before
    expect(isBeforeEaster(on(4, 5), easter)).toBe(false); // Easter itself
    expect(isBeforeEaster(on(9, 8), easter)).toBe(false);
  });

  const full = () => ({
    introitus: { antiphon: "i" },
    graduale: { antiphon: "g" },
    alleluia: { ref: "a", text: "a" },
    alleluiap: { verses: [{ ref: "p", text: "p" }] },
    tractus: { verses: [{ ref: "t", text: "t" }] },
  });

  it("sings the tract, not the alleluia, from Septuagesima to Easter", () => {
    const out = applySeason(full(), on(3, 1), easter);
    expect(Object.keys(out)).toEqual(["introitus", "graduale", "tractus"]);
  });

  it("sings the alleluia, not the tract, through the rest of the year", () => {
    const out = applySeason(full(), on(9, 8), easter);
    expect(Object.keys(out)).toEqual(["introitus", "graduale", "alleluia"]);
  });

  it("sings the paschal alleluia alone through paschaltide", () => {
    const out = applySeason(full(), on(4, 13), easter);
    expect(Object.keys(out)).toEqual(["introitus", "alleluiap"]);
  });

  it("leaves the paschal alleluia out of every other season", () => {
    expect(applySeason(full(), on(9, 8), easter).alleluiap).toBeUndefined();
    expect(applySeason(full(), on(3, 1), easter).alleluiap).toBeUndefined();
  });

  it("keeps a day's only chant whatever the season", () => {
    // The choice is between the two; with one there is nothing to choose.
    const tractOnly = { tractus: { verses: [] } };
    expect(applySeason(tractOnly, on(9, 8), easter)).toEqual(tractOnly);
    const alleluiaOnly = { alleluia: { ref: "a", text: "a" } };
    expect(applySeason(alleluiaOnly, on(3, 1), easter)).toEqual(alleluiaOnly);
  });

  it("keeps the gradual where the day has no paschal alleluia", () => {
    const proper = {
      graduale: { antiphon: "g" },
      alleluia: { ref: "a", text: "a" },
    };
    expect(applySeason(proper, on(4, 13), easter)).toEqual(proper);
  });

  it("does not alter the proper it was given", () => {
    const proper = full();
    applySeason(proper, on(9, 8), easter);
    expect(Object.keys(proper)).toHaveLength(5);
  });
});

describe("the optional alleluia", () => {
  const easter = new Date(Date.UTC(2026, 3, 5));
  const on = (m: number, d: number) => new Date(2026, m - 1, d);
  const chant = (text: string) => ({ communio: { ref: "", text } });

  it("is said in paschaltide, without its parentheses", () => {
    expect(
      applySeason(chant("grátiam inveniámus. (Allelúja.)"), on(4, 13), easter)
    ).toEqual({ communio: { ref: "", text: "grátiam inveniámus. Allelúja." } });
  });

  it("keeps a doubled one, with the stop it carries outside", () => {
    expect(
      applySeason(chant("sólium glóriæ téneat. (Allelúja, allelúja)."), on(4, 13), easter)
    ).toEqual({
      communio: { ref: "", text: "sólium glóriæ téneat. Allelúja, allelúja." },
    });
  });

  it("is left unsaid the rest of the year", () => {
    expect(
      applySeason(chant("grátiam inveniámus. (Allelúja.)"), on(9, 8), easter)
    ).toEqual({ communio: { ref: "", text: "grátiam inveniámus." } });
    expect(
      applySeason(chant("téneat. (Allelúja, allelúja)."), on(3, 1), easter)
    ).toEqual({ communio: { ref: "", text: "téneat." } });
  });

  it("leaves a text that offers none alone", () => {
    const plain = chant("Signum magnum appáruit in cœlo.");
    expect(applySeason(plain, on(9, 8), easter)).toEqual(plain);
  });
});

describe("nameSaint", () => {
  it("puts the saint's name where the common left it open", () => {
    expect(
      nameSaint({
        name: "Adriáni",
        oratio: { text: "ut, qui beáti N. Mártyris tui natalítia cólimus" },
      })
    ).toEqual({
      name: "Adriáni",
      oratio: { text: "ut, qui beáti Adriáni Mártyris tui natalítia cólimus" },
    });
  });

  it("names both saints once where the prayer says N. et N.", () => {
    expect(
      nameSaint({
        name: "Cleti et Marcellíni",
        oratio: { text: "Beatórum Mártyrum paritérque Pontíficum N. et N. nos" },
      }).oratio
    ).toEqual({
      text: "Beatórum Mártyrum paritérque Pontíficum Cleti et Marcellíni nos",
    });
  });

  it("drops the honorific, which the prayer has already said", () => {
    expect(
      nameSaint({
        name: "S. Anastasia",
        oratio: { text: "beáti N. Mártyris" },
      }).oratio
    ).toEqual({ text: "beáti Anastasia Mártyris" });
  });

  it("reaches every text a proper holds", () => {
    const out = nameSaint({
      name: "Aléxii",
      oratio: { text: "beáti N.", closure: "per N." },
      tractus: { verses: [{ ref: "", text: "N. orat" }] },
    });
    expect(out.oratio).toEqual({ text: "beáti Aléxii", closure: "per Aléxii" });
    expect(out.tractus).toEqual({ verses: [{ ref: "", text: "Aléxii orat" }] });
  });

  it("leaves the day's own designation alone", () => {
    const out = nameSaint({ name: "Aléxii", title: "S. N. Confessoris" });
    expect(out.title).toBe("S. N. Confessoris");
  });

  it("does nothing for a day with no name", () => {
    const proper = { oratio: { text: "beáti N. Mártyris" } };
    expect(nameSaint(proper)).toEqual(proper);
  });
});
