import { describe, expect, it } from "vitest";
import {
  transform,
  linesToVerse,
  linesToPrayer,
  linesToAntiphonal,
  linesToGraduale,
  transformRule,
  getSectionType,
  stripTrailingAlleluia,
} from "./step5";

const v = (value: unknown, condition: string[] = []) => ({ value, condition });

describe("step5 missa structuring", () => {
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

  it("lifts the gradual's alleluia into a section of its own", () => {
    const out = transform({
      graduale: [v(["!Ps 1:1", "Beatus vir", "!Alleluia", "Alleluia text"])],
    });
    expect(out.graduale).toEqual([
      v({
        antiphon: { ref: "Ps 1:1", text: "Beatus vir" },
        verse: { ref: "", text: "" },
      }),
    ]);
    expect(out.alleluia).toEqual([
      v({ ref: "Alleluia", text: "Alleluia text" }),
    ]);
  });

  it("publishes the paschal gradual as the extended alleluia it is", () => {
    // `gradualep` is not a gradual: it is the Alleluia that replaces the
    // Gradual in paschaltide, and so a list of verses.
    const out = transform({
      gradualep: [
        v([
          "Allelúja, allelúja.",
          "!Num 17:8",
          "v. Virga Jesse flóruit. Allelúja.",
          "!Luc 1:28",
          "Ave, María. Allelúja.",
        ]),
      ],
    });
    expect(out.gradualep).toBeUndefined();
    expect(out.alleluiap).toEqual([
      v({
        verses: [
          { ref: "Num 17:8", text: "Virga Jesse flóruit." },
          { ref: "Luc 1:28", text: "Ave, María." },
        ],
      }),
    ]);
  });

  it("keeps a verse the source gives no reference for", () => {
    const out = transform({
      gradualep: [
        v([
          "Allelúja, allelúja.",
          "!Ps 109:4",
          "Tu es sacérdos. Allelúja.",
          "V. Hic est sacérdos. Allelúja.",
        ]),
      ],
    });
    expect(out.alleluiap).toEqual([
      v({
        verses: [
          { ref: "Ps 109:4", text: "Tu es sacérdos." },
          { ref: "", text: "Hic est sacérdos." },
        ],
      }),
    ]);
  });

  it("keeps an antiphon and verse given before the reference", () => {
    // The commons give the gradual's words first and name their source after;
    // those lines used to be dropped, leaving an antiphon with no text.
    const out = transform({
      graduale: [
        v([
          "Benedícta et venerábilis es, Virgo María.",
          "V. Virgo, Dei Génetrix.",
          "!Luc 1:28",
          "Ave, María. Allelúja.",
        ]),
      ],
    });
    expect(out.graduale).toEqual([
      v({
        antiphon: { ref: "", text: "Benedícta et venerábilis es, Virgo María." },
        verse: { ref: "", text: "Virgo, Dei Génetrix." },
      }),
    ]);
    expect(out.alleluia).toEqual([
      v({ ref: "Luc 1:28", text: "Ave, María." }),
    ]);
  });

  it("keeps an introit antiphon given before the reference", () => {
    const out = transform({
      introitus: [
        v(["v. In excélso throno vidi sedére virum.", "!Ps 99:1", "Jubiláte Deo."]),
      ],
    });
    expect(out.introitus).toEqual([
      v({
        antiphon: { ref: "", text: "In excélso throno vidi sedére virum." },
        verse: { ref: "Ps 99:1", text: "Jubiláte Deo." },
      }),
    ]);
  });

  it("still skips a leading cue, which is not antiphon text", () => {
    const out = transform({
      graduale: [
        v([
          "Allelúja, allelúja.",
          "!Ps 88:6",
          "Confitebúntur cœli.",
          "!Ps 20:4",
          "Posuísti corónam.",
        ]),
      ],
    });
    expect(out.graduale).toEqual([
      v({
        antiphon: { ref: "Ps 88:6", text: "Confitebúntur cœli." },
        verse: { ref: "", text: "" },
      }),
    ]);
  });

  it("splits off an alleluia its cue introduces, with no reference of its own", () => {
    // The Assumption's gradual gives one combined reference and then marks the
    // Alleluia only by its cue; it used to be swallowed into the verse.
    const out = transform({
      graduale: [
        v([
          "!Ps 44:11-12; 44:14",
          "Audi, fília, et vide.",
          "V. Tota decóra ingréditur fília regis.",
          "Allelúja, allelúja.",
          "V. Assumpta est María in cœlum. Allelúja.",
        ]),
      ],
    });
    expect(out.graduale).toEqual([
      v({
        antiphon: { ref: "Ps 44:11-12", text: "Audi, fília, et vide." },
        verse: { ref: "Ps 44:14", text: "Tota decóra ingréditur fília regis." },
      }),
    ]);
    expect(out.alleluia).toEqual([
      v({ ref: "", text: "Assumpta est María in cœlum." }),
    ]);
  });

  it("prefers an alleluia the source gives a reference for", () => {
    const out = transform({
      graduale: [
        v(["!Ps 1:1", "Beatus vir", "v. qui timet", "!Ps 2:2", "Referenced"]),
      ],
    });
    expect(out.alleluia).toEqual([v({ ref: "Ps 2:2", text: "Referenced" })]);
  });

  it("splits at the cue when the gradual spans two references (St Justin)", () => {
    // The gradual's antiphon and verse are given under separate references, in
    // verse-first order; the cue then opens the Alleluia. The `v.` marker, not
    // position, tells antiphon from verse, and the Alleluia verse that merely
    // repeats the gradual verse is dropped in favour of the distinctive one.
    const out = transform({
      graduale: [
        v([
          "!1 Cor 3:19; 3:20",
          "v. Sapiéntia hujus mundi stultítia est apud Deum.",
          "!1 Cor 1:19",
          "Perdam sapiéntiam sapiéntium et prudentiam prudéntium reprobábo.",
          "Alleluja, alleluja.",
          "v. Sapiéntia hujus mundi stultítia est apud Deum, alleluia",
          "!Phil 3:8",
          "Verúmtamen exístimo ómnia detriméntum esse. Allelúja.",
        ]),
      ],
    });
    expect(out.graduale).toEqual([
      v({
        antiphon: {
          ref: "1 Cor 1:19",
          text: "Perdam sapiéntiam sapiéntium et prudentiam prudéntium reprobábo.",
        },
        verse: {
          ref: "1 Cor 3:19; 3:20",
          text: "Sapiéntia hujus mundi stultítia est apud Deum.",
        },
      }),
    ]);
    expect(out.alleluia).toEqual([
      v({ ref: "Phil 3:8", text: "Verúmtamen exístimo ómnia detriméntum esse." }),
    ]);
  });

  it("splits an inline cue and reads two unmarked gradual blocks in order (St Paul)", () => {
    // The cue trails the Gradual verse's line, and the antiphon and verse are
    // given under two references with no `v.` marker.
    const out = transform({
      graduale: [
        v([
          "!Gal 2:8-9",
          "Qui operátus est Petro in apostolátum.",
          "!1 Cor 15:10",
          "Grátia Dei in me vácua non fuit. Allelúja, allelúja.",
          "V. Sancte Paule Apóstole, intercéde pro nobis. Allelúja.",
        ]),
      ],
    });
    expect(out.graduale).toEqual([
      v({
        antiphon: {
          ref: "Gal 2:8-9",
          text: "Qui operátus est Petro in apostolátum.",
        },
        verse: { ref: "1 Cor 15:10", text: "Grátia Dei in me vácua non fuit." },
      }),
    ]);
    expect(out.alleluia).toEqual([
      v({ ref: "", text: "Sancte Paule Apóstole, intercéde pro nobis." }),
    ]);
  });

  it("reads two unmarked gradual blocks in order under a standalone cue (Agnes)", () => {
    const out = transform({
      graduale: [
        v([
          "!Ps 44:3",
          "Diffúsa est grátia in lábiis tuis.",
          "!Ps 44:5",
          "Propter veritátem et mansuetúdinem.",
          "Allelúja, allelúja.",
          "!Matt 25:6",
          "Quinque prudéntes vírgines. Allelúja.",
        ]),
      ],
    });
    expect(out.graduale).toEqual([
      v({
        antiphon: { ref: "Ps 44:3", text: "Diffúsa est grátia in lábiis tuis." },
        verse: { ref: "Ps 44:5", text: "Propter veritátem et mansuetúdinem." },
      }),
    ]);
    expect(out.alleluia).toEqual([
      v({ ref: "Matt 25:6", text: "Quinque prudéntes vírgines." }),
    ]);
  });

  it("strips the alleluia a chant trails off with", () => {
    // The Alleluia is the response sung after the words, not part of them.
    expect(stripTrailingAlleluia("Assumpta est María. Allelúja.")).toBe(
      "Assumpta est María."
    );
    expect(stripTrailingAlleluia("sánguinis Dómini, allelúja.")).toBe(
      "sánguinis Dómini."
    );
    expect(
      stripTrailingAlleluia("lac concupíscite, allelúja, allelúja, allelúja.")
    ).toBe("lac concupíscite.");
  });

  it("strips a parenthesized alleluia, the paschaltide-only cue", () => {
    expect(
      stripTrailingAlleluia("nisi Jesum Christum, et hunc crucifíxum. (Alleluia.)")
    ).toBe("nisi Jesum Christum, et hunc crucifíxum.");
    expect(
      stripTrailingAlleluia("ut sédeat cum princípibus. (Allelúja, allelúja).")
    ).toBe("ut sédeat cum princípibus.");
    expect(stripTrailingAlleluia("quam reddet mihi Dóminus. (Alleluia)")).toBe(
      "quam reddet mihi Dóminus."
    );
  });

  it("leaves a parenthetical that is not an alleluia alone", () => {
    expect(stripTrailingAlleluia("Dóminus (Deus noster).")).toBe(
      "Dóminus (Deus noster)."
    );
  });

  it("leaves text that does not end in an alleluia", () => {
    expect(stripTrailingAlleluia("Signum magnum appáruit in cœlo.")).toBe(
      "Signum magnum appáruit in cœlo."
    );
    expect(stripTrailingAlleluia("")).toBe("");
  });

  it("empties a text that is only the response", () => {
    expect(stripTrailingAlleluia("Allelúja.")).toBe("");
    expect(stripTrailingAlleluia("Allelúja, allelúja.")).toBe("");
  });

  it("strips it from every chant, not only the alleluia", () => {
    const out = transform({
      communio: [v(["!Ps 1:1", "Beátus vir. Allelúja."])],
      introitus: [v(["!Ps 2:1", "Quare fremuérunt, allelúja.", "!Ps 2:2", "Astitérunt. Allelúja."])],
    });
    expect(out.communio).toEqual([v({ ref: "Ps 1:1", text: "Beátus vir." })]);
    expect(out.introitus).toEqual([
      v({
        antiphon: { ref: "Ps 2:1", text: "Quare fremuérunt." },
        verse: { ref: "Ps 2:2", text: "Astitérunt." },
      }),
    ]);
  });

  it("publishes a tract as the verses it is", () => {
    const out = transform({
      tractus: [
        v([
          "!Ps 106:32",
          "Exáltent eum.",
          "V. Confiteántur Dómino.",
          "!Ps 39:10",
          "Annuntiávi justítiam.",
        ]),
      ],
    });
    expect(out.tractus).toEqual([
      v({
        verses: [
          { ref: "Ps 106:32", text: "Exáltent eum." },
          { ref: "", text: "Confiteántur Dómino." },
          { ref: "Ps 39:10", text: "Annuntiávi justítiam." },
        ],
      }),
    ]);
  });

  it("takes only what follows a !Tractus label, which names the chant", () => {
    // The source section holds the gradual first, then labels the tract; the
    // label is not a reference and must not name the tract either.
    const out = transform({
      tractus: [
        v([
          "Benedícta et venerábilis es.",
          "V. Virgo, Dei Génetrix.",
          "_",
          "!Tractus",
          "Gaude, María Virgo.",
        ]),
      ],
    });
    expect(out.tractus).toEqual([
      v({ verses: [{ ref: "", text: "Gaude, María Virgo." }] }),
    ]);
  });

  it("drops the opening cue, which every alleluia repeats", () => {
    const out = transform({
      gradualep: [v(["Allelúja, allelúja.", "!Ps 1:1", "Beatus vir. Allelúja."])],
    });
    expect(out.alleluiap).toEqual([
      v({ verses: [{ ref: "Ps 1:1", text: "Beatus vir." }] }),
    ]);
  });

  it("keeps each alleluia on the condition of the variant it came from", () => {
    const out = transform({
      graduale: [
        v(["!Ps 1:1", "a", "!All", "first"]),
        v(["!Ps 2:1", "b", "!All", "second"], ["octava"]),
      ],
    });
    expect(out.alleluia).toEqual([
      v({ ref: "All", text: "first" }),
      v({ ref: "All", text: "second" }, ["octava"]),
    ]);
  });

  it("emits no alleluia where the gradual has none", () => {
    // A `!Tractus` second block is a tract, not an alleluia.
    const out = transform({
      graduale: [v(["!Ps 1:1", "Beatus vir", "!Tractus", "tract text"])],
    });
    expect(out.alleluia).toBeUndefined();
    expect(out.graduale).toBeDefined();
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

  it("reads a condition after the preface as the rubric it applies under", () => {
    // The third Sunday after Pentecost: the Sacred Heart preface under the
    // Divino rubrics.
    const out = transform({
      rule: [v(["Gloria", "Prefatio=Cord (rubrica divino)"], ["1962"])],
    });
    expect(out.prefatio).toEqual([v("cord", ["1962", "divino"])]);
  });

  it("gives a preface under each of several rubrics", () => {
    const out = transform({ rule: [v(["Prefatio=Apostolis (rubrica 1570 aut rubrica divino)"])] });
    expect(out.prefatio).toEqual([v("apostolis", ["1570"]), v("apostolis", ["divino"])]);
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

describe("step5 readings — a biblical reference", () => {
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

describe("step5 readings — any other reference", () => {
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

describe("step5 readings — no or several references", () => {
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

  it("reads a homily as the homily, with the Gospel it expounds beside it", () => {
    const out = transform({
      lectio7: [
        v([
          "Léctio sancti Evangélii secúndum Matthǽum",
          "!Matt 25:14-23",
          "In illo témpore: Dixit Jesus discípulis suis parábolam hanc. Et réliqua.",
          "_",
          "Homilía sancti Gregórii Papæ",
          "!Homilía 9 in Evangelia",
          "Léctio sancti Evangélii, fratres caríssimi, sollícite consideráre nos ádmonet.",
        ]),
      ],
    });
    expect(out.lectio7).toEqual([
      v({
        ref: "Homilía 9 in Evangelia",
        text: "Homilía sancti Gregórii Papæ\nLéctio sancti Evangélii, fratres caríssimi, sollícite consideráre nos ádmonet.",
        evangelium: {
          ref: "Matt 25:14-23",
          verses: ["In illo témpore: Dixit Jesus discípulis suis parábolam hanc. Et réliqua."],
        },
      }),
    ]);
  });

  it("keeps the lines of a lesson in two parts that are not each one reading", () => {
    const lines = ["!Matt 5:1", "In illo témpore", "!Matt 5:3", "Beáti", "_", "Homilía", "!Sermo 1", "Text"];
    expect(transform({ lectio7: [v(lines)] })).toEqual({ lectio7: [v(lines)] });
  });

  it("does not read a Mass reading as a homily", () => {
    const lines = ["Munda cor meum", "_", "!Matt 26:36-75", "Tunc venit Jesus", "!Hic genuflectitur.", "Et ecce"];
    expect(transform({ evangelium: [v(lines)] })).toEqual({ evangelium: [v(lines)] });
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
      v({ ref: "Is 1:1", verses: ["Vísio Isaíæ…"] }),
      v(several, ["monastica"]),
    ]);
  });
});

describe("step5 the Office", () => {
  it("keeps an antiphon's words, its asterisk included", () => {
    const out = transform({
      invit: [v(["Regem Vírginum Dóminum, * Veníte, adorémus."])],
      "ant-2": [v(["Ecce, quod concupívi, * jam vídeo."])],
    });
    expect(out.invit).toEqual([v({ text: "Regem Vírginum Dóminum, * Veníte, adorémus." })]);
    expect(out["ant-2"]).toEqual([v({ text: "Ecce, quod concupívi, * jam vídeo." })]);
  });

  it("reads the psalmody line by line, each antiphon with its psalm", () => {
    const out = transform({
      "ant-vespera": [
        v([
          "Hæc est Virgo sápiens, * et una de número prudéntum.;;109",
          "Veni, elécta mea, * et ponam in te thronum meum.",
        ]),
      ],
    });
    expect(out["ant-vespera"]).toEqual([
      v({
        antiphonae: [
          { text: "Hæc est Virgo sápiens, * et una de número prudéntum.", psalmus: "109" },
          { text: "Veni, elécta mea, * et ponam in te thronum meum." },
        ],
      }),
    ]);
  });

  it("reads a bare psalm as said under the antiphon before it", () => {
    const out = transform({
      "ant-matutinum": [v(["Invéntæ Crucis festa recólimus, * allelúja.;;1", ";;2", ";;3"])],
    });
    expect(out["ant-matutinum"]).toEqual([
      v({
        antiphonae: [
          { text: "Invéntæ Crucis festa recólimus, * allelúja.", psalmus: "1" },
          { psalmus: "2" },
          { psalmus: "3" },
        ],
      }),
    ]);
  });

  it("keeps a nocturn's versicle in its place among the antiphons", () => {
    const out = transform({
      "ant-matutinum": [
        v([
          "Dómine, Dóminus noster, * quam admirábile.;;8",
          "V. Glória et honóre coronásti eum.",
          "R. Et constituísti eum super ópera mánuum tuárum.",
        ]),
      ],
    });
    expect(out["ant-matutinum"]).toEqual([
      v({
        antiphonae: [
          { text: "Dómine, Dóminus noster, * quam admirábile.", psalmus: "8" },
          {
            versus: "Glória et honóre coronásti eum.",
            responsum: "Et constituísti eum super ópera mánuum tuárum.",
          },
        ],
      }),
    ]);
  });

  it("reads a hymn into its stanzas, the doxology apart", () => {
    const out = transform({
      "hymnus-laudes": [
        v([
          "{:H-Jesucoronavirginum:}v. Jesu, coróna Vírginum,",
          "Quem Mater illa cóncipit",
          "_",
          "Qui pergis inter lília",
          "Septus choréis Vírginum,",
          "_",
          "* Virtus, honor, laus, glória",
          "Deo Patri cum Fílio,",
          "Amen.",
        ]),
      ],
    });
    expect(out["hymnus-laudes"]).toEqual([
      v({
        strophae: [
          ["Jesu, coróna Vírginum,", "Quem Mater illa cóncipit"],
          ["Qui pergis inter lília", "Septus choréis Vírginum,"],
        ],
        doxologia: ["Virtus, honor, laus, glória", "Deo Patri cum Fílio,", "Amen."],
      }),
    ]);
  });

  it("drops a direction to the reader from a hymn", () => {
    const out = transform({
      "hymnus-vespera": [
        v([
          "/:Prima stropha sequentis hymni dicitur flexis genibus.:/",
          "v. Vexílla Regis pródeunt;",
          "_",
          "!Sequens stropha dicitur flexis genibus.",
          "O Crux, ave, spes única,",
        ]),
      ],
    });
    expect(out["hymnus-vespera"]).toEqual([
      v({ strophae: [["Vexílla Regis pródeunt;"], ["O Crux, ave, spes única,"]] }),
    ]);
  });

  it("reads a hymn without a doxology as its stanzas alone", () => {
    const out = transform({
      "hymnus-vespera": [v(["v. Iste Conféssor", "Dómini colentes", "_", "Qui pius, prudens"])],
    });
    expect(out["hymnus-vespera"]).toEqual([
      v({ strophae: [["Iste Conféssor", "Dómini colentes"], ["Qui pius, prudens"]] }),
    ]);
  });

  it("reads a chapter, and the short lesson of Prime, as a reference and its text", () => {
    const out = transform({
      "capitulum-laudes": [
        v(["!Sir 51:1-3", "v. Confitébor tibi, Dómine, Rex.", "$Deo gratias"]),
      ],
      "lectio-prima": [v(["!Sir 51:13-14", "v. Dómine, Deus meus, exaltásti."])],
    });
    expect(out["capitulum-laudes"]).toEqual([
      v({ ref: "Sir 51:1-3", text: "Confitébor tibi, Dómine, Rex." }),
    ]);
    expect(out["lectio-prima"]).toEqual([
      v({ ref: "Sir 51:13-14", text: "Dómine, Deus meus, exaltásti." }),
    ]);
  });

  it("reads a responsory of Matins", () => {
    const out = transform({
      responsory3: [
        v([
          "R. Amo Christum, in cujus thálamum introíbo: ",
          "* Quem cum amávero, casta sum.",
          "V. Anulo fídei suæ subarrhávit me.",
          "R. Quem cum amávero, casta sum.",
          "&Gloria",
          "R. Quem cum amávero, casta sum.",
        ]),
      ],
      responsory1: [
        v([
          "R. Diem festum celebrémus:",
          "* Quia solum vitæ diléxit auctórem.",
          "V. Infántia quidem computabátur in annis.",
          "R. Quia solum vitæ diléxit auctórem.",
        ]),
      ],
    });
    expect(out.responsory3).toEqual([
      v({
        responsum: "Amo Christum, in cujus thálamum introíbo: * Quem cum amávero, casta sum.",
        versus: "Anulo fídei suæ subarrhávit me.",
        repetitio: "Quem cum amávero, casta sum.",
        gloria: "Quem cum amávero, casta sum.",
      }),
    ]);
    expect(out.responsory1).toEqual([
      v({
        responsum: "Diem festum celebrémus: * Quia solum vitæ diléxit auctórem.",
        versus: "Infántia quidem computabátur in annis.",
        repetitio: "Quia solum vitæ diléxit auctórem.",
      }),
    ]);
  });

  it("reads a short responsory, dropping the choir's repetition of it", () => {
    const out = transform({
      "responsory-breve-tertia": [
        v([
          "R.br. Glória et honóre * Coronásti eum, Dómine.",
          "R. Glória et honóre * Coronásti eum, Dómine.",
          "V. Et constituísti eum super ópera mánuum tuárum.",
          "R. Coronásti eum, Dómine.",
          "&Gloria",
          "R. Glória et honóre * Coronásti eum, Dómine.",
        ]),
      ],
    });
    expect(out["responsory-breve-tertia"]).toEqual([
      v({
        responsum: "Glória et honóre * Coronásti eum, Dómine.",
        versus: "Et constituísti eum super ópera mánuum tuárum.",
        repetitio: "Coronásti eum, Dómine.",
        gloria: "Glória et honóre * Coronásti eum, Dómine.",
      }),
    ]);
  });

  it("reads a versicle and its response", () => {
    const out = transform({
      "versum-2": [v(["V. Diffúsa est grátia in lábiis tuis.", "R. Proptérea benedíxit te Deus."])],
    });
    expect(out["versum-2"]).toEqual([
      v({ versus: "Diffúsa est grátia in lábiis tuis.", responsum: "Proptérea benedíxit te Deus." }),
    ]);
  });

  it("keeps the lines of a section its marks do not fit", () => {
    const unresolved = ["@Commune/C6:Responsory4:1-2"];
    const odd = ["R. Sancta Dei Génetrix,", "V. Intercéde pro nobis."];
    expect(transform({ responsory2: [v(unresolved)], "versum-1": [v(odd)] })).toEqual({
      responsory2: [v(unresolved)],
      "versum-1": [v(odd)],
    });
  });

  it("leaves the uses' sections and the small Hours' antiphons as lines", () => {
    const lines = ["v. Te lucis ante términum"];
    expect(
      transform({ "hymnusm-laudes": [v(lines)], "ant-tertia": [v(["Hæc est Virgo"])] })
    ).toEqual({ "hymnusm-laudes": [v(lines)], "ant-tertia": [v(["Hæc est Virgo"])] });
  });
});
