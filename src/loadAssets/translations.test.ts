import { describe, expect, it } from "vitest";
import { loadMassTitles, loadTranslations } from ".";
import type { Language, Translation } from "../language";

const language = (code: string, tempore: Record<string, Translation>): Language => ({
  code,
  assets: { translations: { tempore } },
});

describe("the titles the languages give", () => {
  const nl = language("nl", {
    "maria-in-sabbato-in-tempore-adventus": "Onze Lieve Vrouw op zaterdag in de Advent",
  });
  const en = language("en", {
    "maria-in-sabbato-in-tempore-adventus": {
      title: "Saturday of Our Lady",
      mass: "Saturday of Our Lady in Advent",
    },
    "andreae-apostoli": "St. Andrew, Apostle",
  });

  it("call a day by the day's title where the day and its Mass are called apart", () => {
    expect(loadTranslations([en])).toEqual({
      "maria-in-sabbato-in-tempore-adventus": "Saturday of Our Lady",
      "andreae-apostoli": "St. Andrew, Apostle",
    });
    expect(loadMassTitles([en])).toEqual({
      "maria-in-sabbato-in-tempore-adventus": "Saturday of Our Lady in Advent",
    });
  });

  it("come whole from the first language that has the key", () => {
    expect(loadTranslations([nl, en])).toEqual({
      "maria-in-sabbato-in-tempore-adventus": "Onze Lieve Vrouw op zaterdag in de Advent",
      "andreae-apostoli": "St. Andrew, Apostle",
    });
    // The Dutch calls the day and its Mass alike, so no English reaches the Mass.
    expect(loadMassTitles([nl, en])).toEqual({});
  });
});
