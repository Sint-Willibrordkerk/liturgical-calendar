import { beforeAll, describe, expect, it } from "vitest";
import { applyPropers } from "./propers";
import type { Language } from "./language";
import type { Calendar, LiturgicalDay } from "./types";

/**
 * The days hold where their Masses are filed; the propers are read from there,
 * in the languages asked for, once the days are settled.
 */
describe("applyPropers", () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = {
      "mass-propers/Sancti/adriani-martyris.yml": {
        title: "S. Adriani, Martyris",
        oratio: "praesta-1",
        prefatio: "communis",
        "ant-1": "ecce-quod-1",
      },
      "mass-propers/Sancti/pauli-primi-eremitae.yml": {
        title: "S. Pauli Primi Eremitæ",
        oratio: "deus-qui-1",
      },
    };
  });

  const latin: Language = {
    code: "la",
    assets: {
      masspropers: {
        oratio: {
          "praesta-1": { text: "Præsta", closure: "Per Dominum" },
          "deus-qui-1": { text: "Deus, qui", closure: "Per Dominum" },
        },
        antiphona: { "ecce-quod-1": { text: "Ecce, quod concupívi." } },
      },
    },
  };
  const dutch: Language = {
    code: "nl",
    assets: {
      masspropers: { oratio: { "praesta-1": { text: "Geef", closure: "Door onze Heer" } } },
    },
  };

  const adrian = { title: "S. Adriani, Martyris" };
  const paul = { title: "S. Pauli Primi Eremitæ" };

  const dayOf = (day: Partial<LiturgicalDay>): Calendar =>
    ({ 3: { 4: { commemorations: [], ...day } } }) as never;

  it("reads the day's Mass in the language", () => {
    const calendar = dayOf({ proper: adrian });
    applyPropers(calendar, 2026, [dutch]);
    expect(calendar[3]![4]!.mass).toMatchObject({ oratio: { text: "Geef" } });
  });

  it("says in the fallback what the language lacks", () => {
    const calendar = dayOf({ proper: paul });
    applyPropers(calendar, 2026, [dutch, latin]);
    expect(calendar[3]![4]!.mass).toMatchObject({
      oratio: { text: "Deus, qui" },
      fallback: { oratio: "la" },
    });
  });

  it("reads the Mass of each commemoration, and the Office of the celebration alone", () => {
    const calendar = dayOf({
      proper: adrian,
      commemorations: [{ liturgicalClass: 3, proper: paul }],
    });
    applyPropers(calendar, 2026, [latin], { officium: true });
    const day = calendar[3]![4]!;
    expect(day.commemorations[0]!.mass).toMatchObject({ oratio: { text: "Deus, qui" } });
    expect(day.officium).toBeDefined();
    expect(day.commemorations[0]!.officium).toBeUndefined();
  });

  it("reads no Office unless asked for", () => {
    const calendar = dayOf({ proper: adrian });
    applyPropers(calendar, 2026, [latin]);
    expect(calendar[3]![4]!.officium).toBeUndefined();
  });

  it("reads no Office of a borrowed Mass", () => {
    const calendar = dayOf({ proper: { ...adrian, borrowed: true } });
    applyPropers(calendar, 2026, [latin], { officium: true });
    expect(calendar[3]![4]!.mass).toBeDefined();
    expect(calendar[3]![4]!.officium).toBeUndefined();
  });

  it("says the Preface the day names in place of the Mass's own", () => {
    const calendar = dayOf({
      proper: { ...adrian, prefatio: { name: "trinitate", always: false } },
    });
    applyPropers(calendar, 2026, [latin]);
    expect(calendar[3]![4]!.mass).toMatchObject({ prefatio: "trinitate" });
  });

  it("adds none where the Mass names none, unless always", () => {
    const sometimes = dayOf({ proper: { ...paul, prefatio: { name: "communis", always: false } } });
    const always = dayOf({ proper: { ...paul, prefatio: { name: "epi", always: true } } });
    applyPropers(sometimes, 2026, [latin]);
    applyPropers(always, 2026, [latin]);
    expect(sometimes[3]![4]!.mass).not.toHaveProperty("prefatio");
    expect(always[3]![4]!.mass).toMatchObject({ prefatio: "epi" });
  });

  it("leaves a day with nowhere to read from without a Mass", () => {
    const calendar = dayOf({});
    applyPropers(calendar, 2026, [latin]);
    expect(calendar[3]![4]!.mass).toBeUndefined();
  });
});
