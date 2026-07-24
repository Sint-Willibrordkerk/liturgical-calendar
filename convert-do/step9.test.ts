import { describe, expect, it } from "vitest";
import {
  transform,
  linesToVerse,
  linesToPrayer,
  linesToAntiphonal,
  linesToGraduale,
  transformRule,
  getSectionType,
} from "./step9";

const v = (value: unknown, condition: string[] = []) => ({ value, condition });

describe("step9 missa structuring", () => {
  it("maps section keys to their type", () => {
    expect(getSectionType("lectio")).toBe("verse");
    expect(getSectionType("oratio")).toBe("prayer");
    expect(getSectionType("graduale")).toBe("antiphonal");
    expect(getSectionType("preamble")).toBeNull();
  });

  it("treats the matins readings as verses", () => {
    expect(getSectionType("lectio1")).toBe("verse");
    expect(getSectionType("lectio9")).toBe("verse");
    expect(getSectionType("lectio7-in-2-loco")).toBe("verse");
    expect(getSectionType("lectio4-in-4-loco")).toBe("verse");
  });

  it("does not mistake a neighbouring key for a matins reading", () => {
    expect(getSectionType("lectio-prima")).toBeNull();
    expect(getSectionType("ant-laudes")).toBeNull();
  });

  it("verse: pulls !ref, drops $-lines and leading v.", () => {
    expect(linesToVerse(["!Io 1:1", "v. In principio", "erat Verbum"])).toEqual({
      ref: "Io 1:1",
      text: "In principio\nerat Verbum",
    });
  });

  it("prayer: separates $-closure from the body", () => {
    expect(linesToPrayer(["Oremus.", "Deus qui", "$Per Dominum"])).toEqual({
      text: "Oremus.\nDeus qui",
      closure: "Per Dominum",
    });
  });

  it("antiphonal: splits antiphon and verse by ref, dropping a repeated antiphon tail", () => {
    const out = linesToAntiphonal([
      "!Ps 42:1",
      "Introduce me",
      "!Ps 42:2",
      "Emitte lucem",
      "v. Introduce me",
    ]);
    expect(out.antiphon).toEqual({ ref: "Ps 42:1", text: "Introduce me" });
    expect(out.verse).toEqual({ ref: "Ps 42:2", text: "Emitte lucem" });
  });

  it("graduale: parses antiphon/verse and alleluia blocks", () => {
    const out = linesToGraduale([
      "!Ps 1:1",
      "Beatus vir",
      "v. qui timet",
      "!Alleluia",
      "Alleluia text",
    ]);
    expect(out.antiphon.text).toBe("Beatus vir");
    expect(out.verse.text).toBe("qui timet");
    expect(out.alleluia).toEqual({ ref: "Alleluia", text: "Alleluia text" });
  });

  it("graduale: a !Tractus second block yields no alleluia", () => {
    const out = linesToGraduale(["!Ps 1:1", "Beatus vir", "!Tractus", "tract text"]);
    expect(out.alleluia).toEqual({ ref: "", text: "" });
  });

  it("rule: drops Gloria/Credo and lifts Prefatio", () => {
    expect(transformRule(["Gloria", "Credo", "Prefatio=De Trinitate", "keep"])).toEqual(
      { rule: ["keep"], prefatio: "de trinitate" }
    );
  });

  it("transform structures each variant and emits prefatio alongside rule", () => {
    const out = transform({
      oratio: [v(["Deus", "$Per Dominum"])],
      rule: [v(["Gloria", "Prefatio=Communis"])],
      name: [v(["Something"])],
    });
    expect(out.oratio).toEqual([v({ text: "Deus", closure: "Per Dominum" })]);
    expect(out.rule).toEqual([v([])]);
    expect(out.prefatio).toEqual([v("communis")]);
    expect(out.name).toEqual([v(["Something"])]);
  });

  it("structures each rubric variant of a section independently", () => {
    const out = transform({
      oratio: [v(["A", "$Per Dominum"]), v(["B", "$Per Christum"], ["1570"])],
    });
    expect(out.oratio).toEqual([
      v({ text: "A", closure: "Per Dominum" }),
      v({ text: "B", closure: "Per Christum" }, ["1570"]),
    ]);
  });
});

describe("step9 readings — a biblical reference", () => {
  it("drops the introduction and splits the numbered body into verses", () => {
    const out = transform({
      lectio1: [
        v([
          "Léctio Epístolæ beáti Pauli Apóstoli ad Corínthios",
          "!2 Cor 1:1-5",
          "1 Paulus, Apóstolus Jesu Christi",
          "2 Grátia vobis, et pax a Deo",
          "3 Benedíctus Deus et Pater",
        ]),
      ],
    });
    expect(out.lectio1).toEqual([
      v({
        ref: "2 Cor 1:1-5",
        verses: [
          "Paulus, Apóstolus Jesu Christi",
          "Grátia vobis, et pax a Deo",
          "Benedíctus Deus et Pater",
        ],
      }),
    ]);
  });

  it("recognises the introduction in its several forms", () => {
    for (const intro of [
      "De Epístola beáti Pauli Apóstoli ad Romános",
      "De libro Sapiéntiæ",
      "Sequéntia ++ sancti Evangélii secúndum Matthǽum",
      "Incipit Epístola secúnda beáti Pauli",
    ]) {
      const out = transform({ lectio: [v([intro, "!Rom 1:1", "1 Paulus"])] });
      expect(out.lectio).toEqual([v({ ref: "Rom 1:1", verses: ["Paulus"] })]);
    }
  });

  it("takes each line as a verse when the body is not numbered", () => {
    const out = transform({
      evangelium: [v(["!Matt 5:1", "In illo témpore…", "Beáti páuperes…"])],
    });
    expect(out.evangelium).toEqual([
      v({ ref: "Matt 5:1", verses: ["In illo témpore…", "Beáti páuperes…"] }),
    ]);
  });

  it("keeps a number that belongs to the text rather than opening a verse", () => {
    const out = transform({
      lectio2: [v(["!Gen 5:1", "1 Hic est liber", "et vixit annos 930"])],
    });
    expect(out.lectio2).toEqual([
      v({ ref: "Gen 5:1", verses: ["Hic est liber", "et vixit annos 930"] }),
    ]);
  });
});

describe("step9 readings — any other reference", () => {
  it("keeps the introduction, since it names the author", () => {
    const out = transform({
      lectio4: [
        v([
          "Sermo sancti Augustíni Epíscopi",
          "!Sermo 1 de Nativitate Domini",
          "Hódie, fratres caríssimi…",
        ]),
      ],
    });
    expect(out.lectio4).toEqual([
      v({
        ref: "Sermo 1 de Nativitate Domini",
        text: "Sermo sancti Augustíni Epíscopi\nHódie, fratres caríssimi…",
      }),
    ]);
  });

  it("does not split a patristic reading into verses", () => {
    const out = transform({
      lectio7: [v(["Ex libro Morálium sancti Gregórii", "!Lib. 10. cap. 16.", "Beátus Job…"])],
    });
    expect(out.lectio7).toEqual([
      v({
        ref: "Lib. 10. cap. 16.",
        text: "Ex libro Morálium sancti Gregórii\nBeátus Job…",
      }),
    ]);
  });
});

describe("step9 readings — no or several references", () => {
  it("keeps a reading with no reference as text", () => {
    const out = transform({
      lectio5: [v(["Sed et reprobórum duos ördines", "Verum his cum timóre"])],
    });
    expect(out.lectio5).toEqual([
      v({ text: "Sed et reprobórum duos ördines\nVerum his cum timóre" }),
    ]);
  });

  it("leaves a reading drawn from several passages as its lines", () => {
    const lines = ["!Eccli 44:1", "Beátus vir…", "!Eccli 45:2", "Diléctus Deo…"];
    expect(transform({ lectio7: [v(lines)] })).toEqual({ lectio7: [v(lines)] });
  });

  it("carries an unresolved reference through as text, for step 10 to decline", () => {
    expect(transform({ lectio3: [v(["@Tempora/Epi2-0::1-4"])] })).toEqual({
      lectio3: [v({ text: "@Tempora/Epi2-0::1-4" })],
    });
  });

  it("applies the same rules to an -in-N-loco reading", () => {
    const out = transform({
      "lectio7-in-2-loco": [v(["!Matt 5:1", "In illo témpore…"])],
    });
    expect(out["lectio7-in-2-loco"]).toEqual([
      v({ ref: "Matt 5:1", verses: ["In illo témpore…"] }),
    ]);
  });

  it("decides per variant, so rubrics of one section may differ in shape", () => {
    const several = ["!Isa 1:1", "a", "!Isa 2:2", "b"];
    const out = transform({
      lectio5: [v(["!Isa 1:1", "Vísio Isaíæ…"]), v(several, ["monastica"])],
    });
    expect(out.lectio5).toEqual([
      v({ ref: "Isa 1:1", verses: ["Vísio Isaíæ…"] }),
      v(several, ["monastica"]),
    ]);
  });
});
