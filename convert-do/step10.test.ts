import { describe, expect, it } from "vitest";
import {
  refToKey,
  createLectioStore,
  substituteLectio,
  substitutePrayers,
  substituteChants,
  collapseVariants,
  transform,
} from "./step10";

/** A rubric variant; `condition` defaults to the unconditional (default) one. */
const v = <T>(value: T, condition: string[] = []) => ({ value, condition });

/** A reading, as step 9 leaves it. */
const reading = (ref: string, text: string) => ({ ref, text });

describe("step10 — key derivation", () => {
  it("kebabs a scripture reference", () => {
    expect(refToKey("Matt 11:25-30")).toBe("matt-11-25-30");
    expect(refToKey("2 Cor 1:1-5")).toBe("2-cor-1-1-5");
    expect(refToKey("Eccli 51:1-8; 51:12")).toBe("eccli-51-1-8-51-12");
  });

  it("has no key for a missing or empty reference", () => {
    expect(refToKey("")).toBeNull();
    expect(refToKey("   ")).toBeNull();
    expect(refToKey(null)).toBeNull();
    expect(refToKey(undefined)).toBeNull();
  });
});

describe("step10 — the shared store", () => {
  it("stores one entry however often a reading is used", () => {
    const store = createLectioStore();
    const a = store.intern(reading("Matt 11:25-30", "In illo témpore…"));
    const b = store.intern(reading("Matt 11:25-30", "In illo témpore…"));

    expect(a).toBe("matt-11-25-30");
    expect(b).toBe(a);
    expect(Object.keys(store.entries())).toEqual(["matt-11-25-30"]);
    expect(store.entries()["matt-11-25-30"]).toEqual({
      ref: "Matt 11:25-30",
      text: "In illo témpore…",
    });
  });

  it("stores a reading used only once", () => {
    const store = createLectioStore();
    expect(store.intern(reading("Joann 7:1-13", "Ambulábat Jesus…"))).toBe(
      "joann-7-1-13"
    );
    expect(store.entries()).toHaveProperty("joann-7-1-13");
  });

  it("keeps both texts when one reference carries two spellings", () => {
    const store = createLectioStore();
    const first = store.intern(reading("Matt 11:25-30", "…Dómine coeli…"));
    const second = store.intern(reading("Matt 11:25-30", "…Dómine cœli…"));

    expect(first).toBe("matt-11-25-30");
    expect(second).toBe("matt-11-25-30-2");
    expect(store.entries()["matt-11-25-30"]).toMatchObject({
      text: "…Dómine coeli…",
    });
    expect(store.entries()["matt-11-25-30-2"]).toMatchObject({
      text: "…Dómine cœli…",
    });
  });

  it("counts on past the first collision", () => {
    const store = createLectioStore();
    const keys = ["a", "b", "c"].map((t) =>
      store.intern(reading("Luc 6:17-23", t))
    );
    expect(keys).toEqual(["luc-6-17-23", "luc-6-17-23-2", "luc-6-17-23-3"]);
  });

  it("re-uses the right key when a collided text comes back", () => {
    const store = createLectioStore();
    store.intern(reading("Luc 6:17-23", "first"));
    store.intern(reading("Luc 6:17-23", "second"));

    expect(store.intern(reading("Luc 6:17-23", "first"))).toBe("luc-6-17-23");
    expect(store.intern(reading("Luc 6:17-23", "second"))).toBe("luc-6-17-23-2");
    expect(Object.keys(store.entries())).toHaveLength(2);
  });

  it("keys a reading with no reference by its opening words and a hash", () => {
    const store = createLectioStore();
    const key = store.intern({ text: "Sed et reprobórum duos ördines cernit" });

    expect(key).toMatch(/^sed-et-reproborum-duos-[0-9a-f]{8}$/);
    expect(store.entries()[key!]).toEqual({
      text: "Sed et reprobórum duos ördines cernit",
    });
  });

  it("keeps two readings that open alike but differ apart", () => {
    const store = createLectioStore();
    const a = store.intern({ text: "Sed et reprobórum duos ördines cernit" });
    const b = store.intern({ text: "Sed et reprobórum duos alia sequúntur" });

    expect(a).not.toBe(b);
    expect(Object.keys(store.entries())).toHaveLength(2);
  });

  it("gives two identical unreferenced readings one entry", () => {
    const store = createLectioStore();
    const a = store.intern({ text: "Verum his cum timóre" });
    const b = store.intern({ text: "Verum his cum timóre" });

    expect(b).toBe(a);
    expect(Object.keys(store.entries())).toHaveLength(1);
  });

  it("stores a verses reading whole", () => {
    const store = createLectioStore();
    const key = store.intern({ ref: "Rom 1:1", verses: ["Paulus", "Grátia"] });

    expect(key).toBe("rom-1-1");
    expect(store.entries()["rom-1-1"]).toEqual({
      ref: "Rom 1:1",
      verses: ["Paulus", "Grátia"],
    });
  });

  it("separates two readings sharing a reference but differing in verses", () => {
    const store = createLectioStore();
    const a = store.intern({ ref: "Rom 1:1", verses: ["Paulus"] });
    const b = store.intern({ ref: "Rom 1:1", verses: ["Paulus", "Grátia"] });

    expect(a).toBe("rom-1-1");
    expect(b).toBe("rom-1-1-2");
  });

  it("declines a reading that is only an unresolved reference", () => {
    const store = createLectioStore();
    expect(store.intern({ text: "@Tempora/Epi2-0::1-4" })).toBeNull();
    expect(store.entries()).toEqual({});
  });

  it("declines a value that is not a reading", () => {
    const store = createLectioStore();
    expect(store.intern(["a line", "another line"])).toBeNull();
    expect(store.intern("a bare string")).toBeNull();
    expect(store.intern(null)).toBeNull();
    expect(store.intern({})).toBeNull();
    expect(store.entries()).toEqual({});
  });
});

describe("step10 — substitution", () => {
  it("replaces a reading with its key, keeping the condition", () => {
    const store = createLectioStore();
    const out = substituteLectio(
      {
        evangelium: [
          v(reading("Matt 11:25-30", "text")),
          v(reading("Matt 11:25-30", "text"), ["monastica"]),
        ],
      },
      store
    );

    expect(out).toEqual({
      evangelium: [
        v("matt-11-25-30"),
        v("matt-11-25-30", ["monastica"]),
      ],
    });
  });

  it("covers lectio, evangelium and ultima-evangelium", () => {
    const store = createLectioStore();
    const out = substituteLectio(
      {
        lectio: [v(reading("2 Cor 1:1-5", "a"))],
        evangelium: [v(reading("Matt 17:1-9", "b"))],
        "ultima-evangelium": [v(reading("Joann 1:1-14", "c"))],
      },
      store
    );

    expect(out).toEqual({
      lectio: [v("2-cor-1-1-5")],
      evangelium: [v("matt-17-1-9")],
      "ultima-evangelium": [v("joann-1-1-14")],
    });
  });

  it("covers the matins readings too", () => {
    const store = createLectioStore();
    const out = substituteLectio(
      {
        lectio1: [v(reading("2 Cor 1:1-5", "Paulus…"))],
        lectio9: [v(reading("Isa 1:1", "Vísio…"))],
        "lectio7-in-2-loco": [v(reading("Matt 5:1", "In illo témpore…"))],
      },
      store
    );

    expect(out).toEqual({
      lectio1: [v("2-cor-1-1-5")],
      lectio9: [v("isa-1-1")],
      "lectio7-in-2-loco": [v("matt-5-1")],
    });
  });

  it("stores a passage once whether it is read at mass or at matins", () => {
    const store = createLectioStore();
    const r = reading("2 Cor 1:1-5", "Paulus…");
    const out = substituteLectio({ lectio: [v(r)], lectio1: [v(r)] }, store);

    expect(out).toEqual({ lectio: [v("2-cor-1-1-5")], lectio1: [v("2-cor-1-1-5")] });
    expect(Object.keys(store.entries())).toEqual(["2-cor-1-1-5"]);
  });

  it("leaves a reading that step 9 left as lines inline", () => {
    const store = createLectioStore();
    const lines = ["!Eccli 44:1", "Beátus vir…", "!Eccli 45:2", "Diléctus…"];
    expect(substituteLectio({ lectio4: [v(lines)] }, store)).toEqual({
      lectio4: [v(lines)],
    });
    expect(store.entries()).toEqual({});
  });

  it("stores an unreferenced reading rather than leaving it inline", () => {
    const store = createLectioStore();
    const out = substituteLectio(
      { lectio4: [v({ text: "Sed et reprobórum duos ördines" })] },
      store
    );
    const key = (out.lectio4 as { value: string }[])[0]!.value;

    expect(key).toMatch(/^sed-et-reproborum-duos-[0-9a-f]{8}$/);
    expect(Object.keys(store.entries())).toEqual([key]);
  });

  it("leaves every other section alone", () => {
    const store = createLectioStore();
    const obj = {
      "lectio-prima": [v(["…"])],
      introitus: [v({ antiphon: reading("Ps 65:4", "x") })],
      oratio: [v({ text: "y", closure: "z" })],
    };
    expect(substituteLectio(obj, store)).toEqual(obj);
    expect(store.entries()).toEqual({});
  });

  it("shares the store across documents", () => {
    const store = createLectioStore();
    const sancti = substituteLectio(
      { evangelium: [v(reading("Matt 17:1-9", "same"))] },
      store
    );
    const tempora = substituteLectio(
      { evangelium: [v(reading("Matt 17:1-9", "same"))] },
      store
    );

    expect(sancti).toEqual({ evangelium: [v("matt-17-1-9")] });
    expect(tempora).toEqual({ evangelium: [v("matt-17-1-9")] });
    expect(Object.keys(store.entries())).toEqual(["matt-17-1-9"]);
  });
});

describe("step10 — prayers", () => {
  const prayer = (text: string, closure = "Per Dominum") => ({ text, closure });

  it("covers oratio, secreta and postcommunio", () => {
    const store = createLectioStore();
    const out = substitutePrayers(
      {
        oratio: [v(prayer("Deus, qui nos beáti"))],
        secreta: [v(prayer("Múnera tibi, Dómine"))],
        postcommunio: [v(prayer("Quǽsumus, omnípotens Deus"))],
      },
      store
    );

    for (const key of ["oratio", "secreta", "postcommunio"]) {
      const [variant] = out[key] as { value: string }[];
      expect(typeof variant!.value).toBe("string");
    }
    expect(Object.keys(store.entries())).toHaveLength(3);
  });

  it("keys a prayer by its opening words and a hash", () => {
    const store = createLectioStore();
    const out = substitutePrayers(
      { oratio: [v(prayer("Concéde nos fámulos tuos, quǽsumus"))] },
      store
    );
    const key = (out.oratio as { value: string }[])[0]!.value;

    expect(key).toMatch(/^concede-nos-famulos-tuos-[0-9a-f]{8}$/);
    expect(store.entries()[key]).toEqual({
      text: "Concéde nos fámulos tuos, quǽsumus",
      closure: "Per Dominum",
    });
  });

  it("stores one entry for an oration a whole common shares", () => {
    const store = createLectioStore();
    const shared = prayer("Beatórum Mártyrum paritérque Pontíficum N.");
    const a = substitutePrayers({ oratio: [v(shared)] }, store);
    const b = substitutePrayers({ oratio: [v(shared)] }, store);

    expect(a).toEqual(b);
    expect(Object.keys(store.entries())).toHaveLength(1);
  });

  it("keeps prayers apart when only the closure differs", () => {
    const store = createLectioStore();
    const out = substitutePrayers(
      {
        oratio: [
          v(prayer("Deus, qui nos", "Per Dominum")),
          v(prayer("Deus, qui nos", "Qui vivis"), ["octava"]),
        ],
      },
      store
    );
    const [first, second] = out.oratio as { value: string }[];

    expect(first!.value).not.toBe(second!.value);
    expect(Object.keys(store.entries())).toHaveLength(2);
  });

  it("leaves the readings and every other section alone", () => {
    const store = createLectioStore();
    const obj = {
      lectio: [v({ ref: "Rom 1:1", verses: ["Paulus"] })],
      introitus: [v({ antiphon: { ref: "Ps 65:4", text: "x" } })],
    };
    expect(substitutePrayers(obj, store)).toEqual(obj);
    expect(store.entries()).toEqual({});
  });

  it("leaves a prayer with no text inline", () => {
    const store = createLectioStore();
    const empty = { text: "", closure: "Per Dominum" };
    expect(substitutePrayers({ oratio: [v(empty)] }, store)).toEqual({
      oratio: [v(empty)],
    });
    expect(store.entries()).toEqual({});
  });
});

describe("step10 — chants", () => {
  const verse = (ref: string, text: string) => ({ ref, text });
  const chant = (ref: string, text: string) => ({
    antiphon: verse(ref, text),
    verse: verse(ref + "b", text + " v"),
  });

  it("covers every sung proper", () => {
    const store = createLectioStore();
    const out = substituteChants(
      {
        introitus: [v(chant("Ps 65:4", "Omnis terra"))],
        graduale: [v({ ...chant("Ps 1:1", "Beatus vir"), alleluia: verse("Ps 1:2", "All") })],
        gradualep: [v(chant("Ps 2:1", "Quare"))],
        tractus: [v(chant("Ps 3:1", "Domine"))],
        offertorium: [v(verse("Ps 4:1", "Cum invocarem"))],
        communio: [v(verse("Ps 5:1", "Verba mea"))],
      },
      store
    );

    for (const key of Object.keys(out)) {
      const [variant] = out[key] as { value: unknown }[];
      expect(typeof variant!.value).toBe("string");
    }
    expect(Object.keys(store.entries())).toHaveLength(6);
  });

  it("keys a chant by its antiphon's reference", () => {
    const store = createLectioStore();
    const out = substituteChants(
      { introitus: [v(chant("Ps 65:4", "Omnis terra"))] },
      store
    );
    expect((out.introitus as { value: string }[])[0]!.value).toBe("ps-65-4");
  });

  it("keys a chant with no reference by its antiphon's opening words", () => {
    const store = createLectioStore();
    const out = substituteChants(
      {
        graduale: [
          v({
            antiphon: { ref: "", text: "Ecce sacérdos magnus, qui in diébus" },
            verse: { ref: "", text: "Non est invéntus" },
          }),
        ],
      },
      store
    );
    expect((out.graduale as { value: string }[])[0]!.value).toMatch(
      /^ecce-sacerdos-magnus-qui-[0-9a-f]{8}$/
    );
  });

  it("stores the chant whole, antiphon verse and alleluia together", () => {
    const store = createLectioStore();
    const whole = { ...chant("Ps 1:1", "Beatus vir"), alleluia: verse("Ps 1:2", "All") };
    substituteChants({ graduale: [v(whole)] }, store);
    expect(store.entries()["ps-1-1"]).toEqual(whole);
  });

  it("stores one entry for a chant a whole common shares", () => {
    const store = createLectioStore();
    const shared = chant("Ps 44:2", "Ave, María, grátia plena");
    substituteChants({ introitus: [v(shared)] }, store);
    substituteChants({ introitus: [v(shared)] }, store);
    expect(Object.keys(store.entries())).toHaveLength(1);
  });

  it("keeps two chants sharing a reference but differing in text apart", () => {
    const store = createLectioStore();
    const out = substituteChants(
      {
        introitus: [v(chant("Ps 65:4", "Omnis terra")), v(chant("Ps 65:4", "Aliud"), ["octava"])],
      },
      store
    );
    const [a, b] = out.introitus as { value: string }[];
    expect(a!.value).toBe("ps-65-4");
    expect(b!.value).toBe("ps-65-4-2");
  });

  it("leaves the readings and prayers alone", () => {
    const store = createLectioStore();
    const obj = {
      lectio: [v({ ref: "Rom 1:1", verses: ["Paulus"] })],
      oratio: [v({ text: "Deus", closure: "Per Dominum" })],
    };
    expect(substituteChants(obj, store)).toEqual(obj);
    expect(store.entries()).toEqual({});
  });

  it("leaves a chant with no text inline", () => {
    const store = createLectioStore();
    const empty = { antiphon: { ref: "", text: "" }, verse: { ref: "", text: "" } };
    expect(substituteChants({ introitus: [v(empty)] }, store)).toEqual({
      introitus: [v(empty)],
    });
    expect(store.entries()).toEqual({});
  });
});

describe("step10 — variant collapse", () => {
  it("drops variants that repeat the default", () => {
    const same = { antiphon: "Omnis terra…", verse: "Jubiláte…" };
    const other = { antiphon: "Aliud…", verse: "Aliud…" };

    expect(
      collapseVariants({
        introitus: [
          v(same),
          v(same, ["cisterciensis"]),
          v(same, ["monastica"]),
          v(other, ["1570"]),
        ],
      })
    ).toEqual({ introitus: [v(same), v(other, ["1570"])] });
  });

  it("leaves only the default when every variant matches it", () => {
    const same = { text: "x", closure: "y" };
    expect(
      collapseVariants({
        oratio: [v(same), v(same, ["monastica"]), v(same, ["praedicatorum"])],
      })
    ).toEqual({ oratio: [v(same)] });
  });

  it("removes nothing when the section has no default", () => {
    const same = { text: "x", closure: "y" };
    const section = [v(same, ["1570"]), v(same, ["monastica"])];

    expect(collapseVariants({ oratio: section })).toEqual({ oratio: section });
  });

  it("compares whole values, not just their first field", () => {
    const base = { ref: "Ps 65:4", text: "a" };
    expect(
      collapseVariants({
        communio: [v(base), v({ ref: "Ps 65:4", text: "b" }, ["monastica"])],
      })
    ).toEqual({
      communio: [v(base), v({ ref: "Ps 65:4", text: "b" }, ["monastica"])],
    });
  });

  it("applies to every section, not only the covered ones", () => {
    const lines = ["a", "b"];
    expect(
      collapseVariants({
        lectio1: [v(lines), v(lines, ["monastica"])],
        "ant-laudes": [v(lines), v(lines, ["cisterciensis"])],
      })
    ).toEqual({ lectio1: [v(lines)], "ant-laudes": [v(lines)] });
  });

  it("keeps a variant whose condition is empty but is the default itself", () => {
    expect(collapseVariants({ oratio: [v({ text: "x" })] })).toEqual({
      oratio: [v({ text: "x" })],
    });
  });

  it("leaves a section that is not a variant list unchanged", () => {
    const obj = { prefatio: "trinitate", name: "Sanctæ Familiæ" };
    expect(collapseVariants(obj)).toEqual(obj);
  });
});

describe("step10 — transform", () => {
  it("collapses on the key, so a reading identical under every rubric folds to one", () => {
    const store = createLectioStore();
    const r = reading("Matt 11:25-30", "In illo témpore…");

    expect(
      transform(
        {
          evangelium: [
            v(r),
            v(r, ["cisterciensis"]),
            v(r, ["monastica"]),
            v(r, ["praedicatorum"]),
            v(r, ["transfer", "1570"]),
          ],
        },
        store
      )
    ).toEqual({ evangelium: [v("matt-11-25-30")] });

    expect(Object.keys(store.entries())).toEqual(["matt-11-25-30"]);
  });

  it("keeps a rubric that genuinely reads something else", () => {
    const store = createLectioStore();
    const out = transform(
      {
        lectio: [
          v(reading("2 Cor 1:1-5", "a")),
          v(reading("2 Cor 1:1-5", "a"), ["monastica"]),
          v(reading("Rom 12:6-16", "b"), ["1570"]),
        ],
      },
      store
    );

    expect(out).toEqual({
      lectio: [v("2-cor-1-1-5"), v("rom-12-6-16", ["1570"])],
    });
    expect(Object.keys(store.entries()).sort()).toEqual([
      "2-cor-1-1-5",
      "rom-12-6-16",
    ]);
  });

  it("does not collapse a covered section that has no default", () => {
    const store = createLectioStore();
    const r = reading("Matt 17:1-9", "x");

    expect(
      transform(
        { evangelium: [v(r, ["1570"]), v(r, ["monastica"])] },
        store
      )
    ).toEqual({
      evangelium: [v("matt-17-1-9", ["1570"]), v("matt-17-1-9", ["monastica"])],
    });
  });
});
