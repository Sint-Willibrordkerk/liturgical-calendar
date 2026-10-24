import { beforeAll, describe, expect, it } from "vitest";
import { loadMassPropersByTitle } from "./index";
import { NO_LANGUAGE, type Language } from "../language";

/**
 * A day is published once, holding keys, and bundled with the calendar; a
 * language is its stores. The Mass of a day is the one read through the other.
 */
describe("the Mass of a day, in a language", () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = {
      "mass-propers/Sancti/adriani-martyris.yml": {
        title: "S. Adriani, Martyris",
        name: "adriani",
        lectio: "sap-10-10-14",
        oratio: "praesta-1",
      },
      "mass-propers/Sancti/pii-v-papae-et-confessoris.yml": {
        title: "S. Pii V Papæ et Confessoris",
        oratio: "praesta-1",
        secreta: { text: "", closure: "" },
      },
    };
  });

  const language = (code: string, stores: Record<string, unknown>): Language => ({
    code,
    assets: Object.fromEntries(
      Object.entries(stores).map(([file, store]) => [
        `mass-propers/${code}/${file}.yml`,
        store,
      ])
    ),
  });

  const latin = language("la", {
    lectio: { "sap-10-10-14": { ref: "Sap 10:10-14", verses: ["Justum dedúxit"] } },
    oratio: { "praesta-1": { text: "Præsta, ut beáti N. Mártyris", closure: "Per Dominum" } },
    nomen: { adriani: "Adriáni" },
  });

  const dutch = language("nl", {
    oratio: { "praesta-1": { text: "Geef, dat wij op voorspraak van N.", closure: "Door onze Heer" } },
    nomen: { adriani: "Hadrianus" },
  });

  it("reads the day in the language's own words", () => {
    expect(loadMassPropersByTitle("S. Adriani, Martyris", latin)).toEqual({
      title: "S. Adriani, Martyris",
      name: "Adriáni",
      lectio: { ref: "Sap 10:10-14", verses: ["Justum dedúxit"] },
      oratio: { text: "Præsta, ut beáti Adriáni Mártyris", closure: "Per Dominum" },
    });
  });

  it("reads the same day in another language, leaving out what it does not say", () => {
    expect(loadMassPropersByTitle("S. Adriani, Martyris", dutch)).toEqual({
      title: "S. Adriani, Martyris",
      name: "Hadrianus",
      oratio: { text: "Geef, dat wij op voorspraak van Hadrianus", closure: "Door onze Heer" },
    });
  });

  it("has no Mass in a language that says nothing of the day", () => {
    expect(loadMassPropersByTitle("S. Adriani, Martyris", language("en", {}))).toBeUndefined();
  });

  it("has no Mass without a language", () => {
    expect(loadMassPropersByTitle("S. Adriani, Martyris", NO_LANGUAGE)).toBeUndefined();
  });

  it("has no Mass where the language says none of the day's texts", () => {
    expect(
      loadMassPropersByTitle("S. Pii V Papæ et Confessoris", NO_LANGUAGE)
    ).toBeUndefined();
    expect(loadMassPropersByTitle("S. Pii V Papæ et Confessoris", latin)).toMatchObject({
      oratio: { closure: "Per Dominum" },
      secreta: { text: "", closure: "" },
    });
  });

  it("has no Mass for a day that is not published", () => {
    expect(loadMassPropersByTitle("S. Nemini", latin)).toBeUndefined();
  });
});

/**
 * A local calendar's days are published at its own path, beside the general
 * day of the same name. A calendar reads them only where its local proper names
 * that local calendar, the most particular first.
 */
describe("the Mass of a day kept in a local calendar", () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = {
      "mass-propers/Sancti/martini-episcopi-et-confessoris.yml": {
        title: "S. Martini",
        oratio: "generalis",
      },
      "mass-propers/Sancti/Neerlandia/Ultrajectum/martini-episcopi-et-confessoris.yml": {
        title: "S. Martini, Patroni",
        oratio: "ultrajectensis",
      },
      "mass-propers/Sancti/Neerlandia/gertrudis-virginis.yml": {
        title: "S. Gertrudis",
        oratio: "neerlandica",
      },
      "mass-propers/Sancti/Neerlandia/martini-episcopi-et-confessoris.yml": {
        title: "S. Martini, in Neerlandia",
        oratio: "neerlandica",
      },
    };
  });

  const latin: Language = {
    code: "la",
    assets: {
      "mass-propers/la/oratio.yml": {
        generalis: { text: "Deus", closure: "Per Dominum" },
        ultrajectensis: { text: "Deus, Ultrajecti", closure: "Per Dominum" },
        neerlandica: { text: "Deus, in Neerlandia", closure: "Per Dominum" },
      },
    },
  };
  const UTRECHT = ["Neerlandia/Ultrajectum", "Neerlandia"];

  it("reads the general day where no local calendar is named", () => {
    expect(
      loadMassPropersByTitle("martini-episcopi-et-confessoris", latin)?.title
    ).toBe("S. Martini");
    expect(loadMassPropersByTitle("gertrudis-virginis", latin)).toBeUndefined();
  });

  it("reads the most particular local calendar that keeps the day", () => {
    expect(
      loadMassPropersByTitle("martini-episcopi-et-confessoris", latin, undefined, undefined, UTRECHT)
        ?.title
    ).toBe("S. Martini, Patroni");
  });

  it("falls back to the wider local calendar, then to the general day", () => {
    expect(
      loadMassPropersByTitle("gertrudis-virginis", latin, undefined, undefined, UTRECHT)?.title
    ).toBe("S. Gertrudis");
    expect(
      loadMassPropersByTitle("martini-episcopi-et-confessoris", latin, undefined, undefined, [
        "Neerlandia/Groningen",
      ])?.title
    ).toBe("S. Martini");
  });
});

/**
 * A language may lack words for a text the day refers to. A fallback language,
 * handed in beside it, says that text instead, and the Mass names the sections
 * it said so a reader can tell which language each came in. The fallback is
 * never part of the language it backs.
 */
describe("the Mass of a day, with a fallback language", () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = {
      "mass-propers/Sancti/willibrordi.yml": {
        title: "S. Willibrordi",
        name: "willibrordo",
        introitus: "eccli-45-30",
        oratio: "deus-qui-beatum",
        lectio: "hebr-13-7-9-13-15-17",
        secreta: "munera-1",
        postcommunio: "hostia-1",
      },
      "mass-propers/Sancti/nemini.yml": {
        title: "S. Nemini",
        oratio: "deus-qui-beatum",
      },
    };
  });

  const language = (code: string, stores: Record<string, unknown>): Language => ({
    code,
    assets: Object.fromEntries(
      Object.entries(stores).map(([file, store]) => [
        `mass-propers/${code}/${file}.yml`,
        store,
      ])
    ),
  });

  const latin = language("la", {
    antiphona: { "eccli-45-30": { antiphon: { text: "Státuit" } } },
    oratio: {
      "deus-qui-beatum": { text: "Deus, qui beátum", closure: "Per Dominum" },
      "munera-1": { text: "Múnera N.", closure: "Per Dominum" },
      "hostia-1": { text: "Omnípotens Deus", closure: "Per Dominum" },
    },
    lectio: { "hebr-13-7-9-13-15-17": { ref: "Hebr 13:7-9", verses: ["Fratres"] } },
    nomen: { willibrordo: "Willibrórdo" },
  });

  const dutch = language("nl", {
    antiphona: { "eccli-45-30": { antiphon: { text: "De Heer" } } },
    oratio: { "hostia-1": { text: "Almachtige God", closure: "Door Christus" } },
  });

  it("says what the language lacks in the fallback and names the sections", () => {
    expect(
      loadMassPropersByTitle("S. Willibrordi", dutch, undefined, undefined, [], latin)
    ).toEqual({
      title: "S. Willibrordi",
      introitus: { antiphon: { text: "De Heer" } },
      oratio: { text: "Deus, qui beátum", closure: "Per Dominum" },
      lectio: { ref: "Hebr 13:7-9", verses: ["Fratres"] },
      secreta: { text: "Múnera Willibrórdo", closure: "Per Dominum" },
      postcommunio: { text: "Almachtige God", closure: "Door Christus" },
      fallback: { oratio: "la", lectio: "la", secreta: "la" },
    });
  });

  it("leaves out what the language lacks when no fallback is given", () => {
    const mass = loadMassPropersByTitle("S. Willibrordi", dutch);
    expect(mass).toEqual({
      title: "S. Willibrordi",
      introitus: { antiphon: { text: "De Heer" } },
      postcommunio: { text: "Almachtige God", closure: "Door Christus" },
    });
    expect(mass).not.toHaveProperty("fallback");
  });

  it("carries no marker where the language says the whole Mass itself", () => {
    expect(
      loadMassPropersByTitle("S. Willibrordi", latin, undefined, undefined, [], dutch)
    ).not.toHaveProperty("fallback");
  });

  it("does not read a language as its own fallback", () => {
    expect(
      loadMassPropersByTitle("S. Willibrordi", dutch, undefined, undefined, [], dutch)
    ).not.toHaveProperty("fallback");
  });

  it("says a day wholly in the fallback where the language has no words for it", () => {
    expect(
      loadMassPropersByTitle("S. Nemini", language("nl", {}), undefined, undefined, [], latin)
    ).toEqual({
      title: "S. Nemini",
      oratio: { text: "Deus, qui beátum", closure: "Per Dominum" },
      fallback: { oratio: "la" },
    });
  });

  it("has no Mass where neither language says anything of the day", () => {
    expect(
      loadMassPropersByTitle("S. Nemini", language("nl", {}), undefined, undefined, [], language("la", {}))
    ).toBeUndefined();
  });

  it("names only the sections the season leaves", () => {
    // Before Easter the alleluia gives way to the tract; a marker for the one
    // set aside would name a text the Mass no longer holds.
    (globalThis as Record<string, unknown>).bundledAssets = {
      "mass-propers/Sancti/cantus.yml": {
        title: "Cantus",
        alleluia: "alleluia-1",
        tractus: "tractus-1",
      },
    };
    const la = language("la", {
      antiphona: {
        "alleluia-1": { text: "Allelúja" },
        "tractus-1": { verses: [{ text: "Laudáte" }] },
      },
    });
    const easter = new Date(2026, 3, 5);
    const lent = new Date(2026, 2, 1);
    const mass = loadMassPropersByTitle(
      "cantus",
      language("nl", {}),
      undefined,
      { date: lent, easter },
      [],
      la
    );
    expect(mass).toMatchObject({ fallback: { tractus: "la" } });
    expect(mass).not.toHaveProperty("alleluia");
    expect(mass?.fallback).not.toHaveProperty("alleluia");
  });
});
