import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import generateCalendar, { type Language } from "./index";

describe("the Office in the calendar", () => {
  const latin: Language = {
    code: "la",
    assets: {
      "mass-propers/la/oratio.yml": {
        "omnipotens-1": { text: "Omnípotens sempitérne Deus", closure: "Per Dominum" },
      },
      "mass-propers/la/antiphona.yml": {
        "ecce-quod-1": { text: "Ecce, quod concupívi, * jam vídeo." },
      },
    },
  };

  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = {
      "calendar1962.yml": parse(readFileSync(join("assets", "calendar1962.yml"), "utf-8")),
      "mass-propers/Sancti/agnetis-virginis-et-martyris.yml": {
        title: "S. Agnetis Virginis et Martyris",
        oratio: "omnipotens-1",
        "ant-2": "ecce-quod-1",
      },
    };
  });

  it("is read only when asked for", () => {
    const calendar = generateCalendar(2026, [], latin);
    expect(calendar[1]![21]!.officium).toBeUndefined();
    expect(calendar[1]![21]!.mass).toBeDefined();
  });

  it("gives a day the Office of its celebration", () => {
    const calendar = generateCalendar(2026, [], latin, { officium: true });
    expect(calendar[1]![21]!.officium).toEqual({
      laudes: { benedictus: { text: "Ecce, quod concupívi, * jam vídeo." } },
      oratio: { text: "Omnípotens sempitérne Deus", closure: "Per Dominum" },
    });
  });

  it("leaves a day whose file the calendar does not find without one", () => {
    const calendar = generateCalendar(2026, [], latin, { officium: true });
    expect(calendar[8]![15]!.officium).toBeUndefined();
  });
});
