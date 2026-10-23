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
