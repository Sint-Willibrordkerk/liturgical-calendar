import { beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { calendarAssets, readLanguage } from "../scripts/assets.mjs";
import { calendarOf } from "./generate";
import type { Language, LiturgicalDay } from "./index";

/**
 * The days as the published languages call them: the calendar and the language
 * packages as their builds read them.
 *
 * It reads what `pnpm pipeline && pnpm copy-mass-propers` writes, and is skipped
 * where that has not run.
 */
const GENERATED = [
  "assets/mass-propers/Sancti",
  "languages/la/assets/mass-propers/la",
  "languages/nl/assets/mass-propers/nl",
  "languages/en/assets/mass-propers/en",
];
const generated = GENERATED.every((path) => existsSync(path));
// In CI the propers are generated before the tests run, so there a missing one
// is a failure: these tests never pass by being skipped.
if (!generated && process.env.CI) {
  throw new Error(`The propers are not generated: ${GENERATED.filter((path) => !existsSync(path)).join(", ")}`);
}

describe.skipIf(!generated)("the Saturday of Our Lady as published", () => {
  const languages: Record<string, Language> = {};

  // Every generated file is read and parsed, some seconds' work: more than a
  // hook is given by default once other files run beside it.
  let generateCalendar: ReturnType<typeof calendarOf>;
  beforeAll(() => {
    generateCalendar = calendarOf(calendarAssets("assets"));
    for (const code of ["la", "nl", "en"]) languages[code] = readLanguage(join("languages", code));
  }, 60_000);

  /** Every Saturday of Our Lady kept in 2026, in `codes`. */
  const saturdays = (...codes: string[]): LiturgicalDay[] =>
    Object.values(generateCalendar({ year: 2026, languages: codes.map((code) => languages[code]!) }))
      .flatMap((month) => Object.values(month ?? {}))
      .filter((day): day is LiturgicalDay => day?.id?.startsWith("maria-in-sabbato-") === true);

  it("calls the day the same all year, and its Mass by when it is said", () => {
    const days = saturdays("nl");
    expect(new Set(days.map((day) => day.title))).toEqual(new Set(["Onze Lieve Vrouw op zaterdag"]));
    // 28 November 2026, between Trinity Sunday and Advent.
    expect(days.find((day) => day.id === "maria-in-sabbato-a-festo-trinitatis-usque-ad-sabbatum-ante-dominicam-i-adventus")?.mass?.title).toBe(
      "Onze Lieve Vrouw op zaterdag vanaf Zondag Trinitate tot de zaterdag voor de eerste zondag van de Advent"
    );
    // Each Mass its own title, as each is filed under its own id.
    const masses = new Map(days.map((day) => [day.id, day.mass?.title]));
    expect(new Set(masses.values()).size).toBe(masses.size);
  });

  it("does the same in English", () => {
    const days = saturdays("en");
    expect(new Set(days.map((day) => day.title))).toEqual(new Set(["Saturday of Our Lady"]));
    expect(days.map((day) => day.mass?.title)).toContain("Saturday of Our Lady in Paschaltide");
  });

  it("keeps the Latin title of the Mass where the language calls it as the day", () => {
    const days = saturdays("la");
    expect(new Set(days.flatMap((day) => [day.title, day.mass?.title]))).toEqual(new Set(["Sanctæ Mariæ Sabbato"]));
  });
});
