import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";
import { applyCommemorations, honoursOf, type CommemorationRules } from "./commemorations";
import { parseCalendarData } from "./parseCalendarData";
import generateCalendar from "./index";
import type { Calendar, Commemoration, LiturgicalDay } from "./types";

/**
 * Which of the days falling on a date are commemorated with the day kept
 * (nn. 106-114). The rules are the calendar's: each day says how it is
 * commemorated and what it admits, and the head of the file says what
 * excludes what and in which order they are said.
 */

const RULES: CommemorationRules = {
  excludes: [
    "honours",
    [{ "of-the-season": true }, { "of-the-season": true }],
  ],
  order: [{ "of-the-season": true }, "precedence"],
};

const day = (fields: Partial<Commemoration>): Commemoration =>
  ({ type: "festum", liturgicalClass: 3, commemorated: "ordinary", honours: [], ...fields }) as Commemoration;

/** The day kept, with the others on its date in the order of precedence. */
function kept(fields: Partial<LiturgicalDay>, others: Commemoration[]): Calendar {
  return {
    3: { 4: { ...day({ admits: { count: 2 } }), ...fields, commemorations: others } as LiturgicalDay },
  } as Calendar;
}

/** The ids commemorated on the one day, after the rules. */
function commemorated(calendar: Calendar, rules = RULES): (string | undefined)[] {
  applyCommemorations(calendar, 2026, rules);
  return calendar[3]![4]!.commemorations.map((c) => c.id);
}

describe("applyCommemorations", () => {
  it("never commemorates a day that is never commemorated (n. 26)", () => {
    const calendar = kept({}, [day({ id: "feria", type: "feria", liturgicalClass: 4, commemorated: "never" })]);
    expect(commemorated(calendar)).toEqual([]);
  });

  it("leaves out a day on the days it is omitted on (n. 33)", () => {
    const vigil = day({
      id: "in-vigilia-assumptionis-bmv",
      type: "vigilia",
      liturgicalClass: 2,
      omittedOn: [{ type: "dominica" }, { class: 1, type: "festum" }],
    });
    expect(commemorated(kept({ type: "dominica", liturgicalClass: 2 }, [vigil]))).toEqual([]);
    expect(commemorated(kept({ type: "festum", liturgicalClass: 1 }, [{ ...vigil }]))).toEqual([]);
    expect(commemorated(kept({ type: "festum", liturgicalClass: 2 }, [{ ...vigil }]))).toEqual([
      "in-vigilia-assumptionis-bmv",
    ]);
  });

  it("admits only what the day kept admits (n. 111a)", () => {
    const calendar = kept(
      { liturgicalClass: 1, admits: { of: [{ commemorated: "privileged" }] } },
      [day({ id: "feria-adventus", type: "feria", commemorated: "privileged" }), day({ id: "barbarae" })]
    );
    expect(commemorated(calendar)).toEqual(["feria-adventus"]);
  });

  it("admits none where the day admits none (n. 30)", () => {
    const calendar = kept({ type: "vigilia", liturgicalClass: 1, admits: { count: 0 } }, [
      day({ id: "dominica-iv-adventus", type: "dominica", liturgicalClass: 1, commemorated: "privileged" }),
    ]);
    expect(commemorated(calendar)).toEqual([]);
  });

  it("admits no more than the day's count, the rest omitted (nn. 111c, 114)", () => {
    const calendar = kept({ liturgicalClass: 2, admits: { count: 1 } }, [
      day({ id: "first" }),
      day({ id: "second" }),
    ]);
    expect(commemorated(calendar)).toEqual(["first"]);
  });

  it("on a Sunday admits a feast of the second class, but a privileged one first (n. 111b)", () => {
    const sunday = {
      type: "dominica",
      liturgicalClass: 2,
      admits: {
        count: 1,
        of: [{ commemorated: "privileged" as const }, { class: 2, type: "festum" }],
        "privileged-first": true,
      },
    };
    expect(
      commemorated(kept(sunday, [day({ id: "matthiae-apostoli", liturgicalClass: 2 }), day({ id: "zephirini" })]))
    ).toEqual(["matthiae-apostoli"]);
    expect(
      commemorated(
        kept(sunday, [
          day({ id: "matthiae-apostoli", liturgicalClass: 2 }),
          day({ id: "die-v-infra-octavam", type: "octava", liturgicalClass: 2, commemorated: "privileged" }),
        ])
      )
    ).toEqual(["die-v-infra-octavam"]);
  });

  it("excludes what honours the same Person or saint as the day or another commemoration (n. 112a, b, d)", () => {
    const sunday = kept({ type: "dominica", liturgicalClass: 2, honours: ["domini"] }, [
      day({ id: "in-transfiguratione", honours: ["domini"] }),
      day({ id: "agnetis", honours: ["agnetis"] }),
      day({ id: "agnetis-secundo", honours: ["agnetis"] }),
    ]);
    expect(commemorated(sunday)).toEqual(["agnetis"]);
  });

  it("does not exclude a day that honours no one", () => {
    const calendar = kept({ honours: ["beatae-mariae-virginis"] }, [day({ type: "feria", honours: [] })]);
    expect(commemorated(calendar)).toHaveLength(1);
  });

  it("excludes a second commemoration of the season (n. 112c)", () => {
    const calendar = kept({}, [
      day({ id: "one", type: "vigilia", "ofTheSeason": true }),
      day({ id: "two", type: "octava", "ofTheSeason": true }),
    ]);
    expect(commemorated(calendar)).toEqual(["one"]);
  });

  it("says the commemoration of the season first, then the others by precedence (n. 113)", () => {
    const calendar = kept({}, [
      day({ id: "barbarae", liturgicalClass: 4 }),
      day({ id: "feria-adventus", type: "feria", ofTheSeason: true, commemorated: "privileged" }),
    ]);
    expect(commemorated(calendar)).toEqual(["feria-adventus", "barbarae"]);
  });
});

describe("honoursOf", () => {

  const feast = (id: string) => ({ id, type: "festum" });

  it("is whom the day says it honours", () => {
    expect(honoursOf({ ...feast("joseph-opificis"), honours: ["joseph"] })).toEqual(["joseph"]);
  });

  it("is otherwise, for a feast, the saint its id names, the titles stripped", () => {
    expect(honoursOf(feast("agnetis-virginis-et-martyris"))).toEqual(["agnetis"]);
    expect(honoursOf(feast("agnetis-virginis-et-martyris-secundo"))).toEqual(["agnetis"]);
    expect(honoursOf(feast("felicis-i-papae-et-martyris"))).toEqual(["felicis"]);
  });

  it("strips the date some ids carry", () => {
    expect(honoursOf(feast("quadraginta-martyrum-03-10"))).toEqual(["quadraginta"]);
  });

  it("is no one for a day whose id names no saint, or that has none", () => {
    expect(honoursOf({ id: "feria-iv-cinerum", type: "feria" })).toEqual([]);
    expect(honoursOf({ type: "festum" })).toEqual([]);
  });
});

describe("the commemorations of the calendar", () => {
  beforeAll(() => {
    const bundled: Record<string, unknown> = {
      "calendar1962.yml": parse(readFileSync(join("assets", "calendar1962.yml"), "utf-8")),
    };
    for (const file of (readdirSync(join("assets", "propers"), { recursive: true }) as string[]).map((f) => f.replace(/\\/g, "/"))) {
      if (!file.endsWith(".yml")) continue;
      bundled[`propers/${file}`] = parse(readFileSync(join("assets", "propers", file), "utf-8"));
    }
    (globalThis as Record<string, unknown>).bundledAssets = bundled;
  });

  const on = (year: number, month: number, date: number, propers: string[] = []) =>
    generateCalendar({ year, propers })[month]![date]!;
  // The calendar leaves an empty list of commemorations out.
  const ids = (entry: LiturgicalDay) => (entry.commemorations ?? []).map((c) => c.id ?? `(${c.type})`);
  /** The first year from 2024 in which the date falls on the weekday. */
  const yearWith = (month: number, date: number, weekday: number) => {
    for (let year = 2024; ; year++) if (new Date(year, month - 1, date).getDay() === weekday) return year;
  };

  it("commemorates the Advent feria on the Immaculate Conception (nn. 108e, 111a)", () => {
    expect(ids(on(2026, 12, 8))).toEqual(["(feria)"]);
  });

  it("commemorates one feria on a second-class feast of Advent (n. 111c)", () => {
    // St Thomas, 21 December 2026.
    expect(ids(on(2026, 12, 21))).toEqual(["(feria)"]);
    expect(on(2026, 12, 21).commemorations[0]!.liturgicalClass).toBe(2);
  });

  it("commemorates its feria once on St Joseph in Lent (n. 111a)", () => {
    expect(ids(on(2026, 3, 19))).toEqual(["feria-quinta-infra-hebdomadam-iv-in-quadragesima"]);
  });

  it("keeps the Ember day of Advent among the ferias of the 17th to the 23rd (n. 24)", () => {
    // 19 December 2026 is the Ember Saturday.
    expect(on(2026, 12, 19).id).toBe("sabbato-quattuor-temporum-adventus");
    expect(ids(on(2026, 12, 19))).toEqual([]);
  });

  it("commemorates on an Ember day of Lent one ordinary feast, not its own feria (nn. 111c, 112c)", () => {
    // The Ember Friday of Lent, 27 February 2026, with St Gabriel.
    expect(ids(on(2026, 2, 27))).toEqual(["gabrielis-a-virgine-perdolente-confessoris"]);
  });

  it("says the Advent feria before a saint on a feast of Advent (n. 113)", () => {
    // St Peter Chrysologus, 4 December 2026, with St Barbara.
    expect(ids(on(2026, 12, 4))).toEqual(["(feria)", "barbarae-virginis-et-martyris"]);
  });

  it("does not commemorate the Sunday a feast of the Lord takes (nn. 16a, 112b)", () => {
    const year = yearWith(8, 6, 0);
    const transfiguration = on(year, 8, 6);
    expect(transfiguration.id).toBe("in-transfiguratione-domini-nostri-jesu-christi");
    expect((transfiguration.commemorations ?? []).some((c) => c.type === "dominica")).toBe(false);
  });

  it("leaves out a vigil falling on a Sunday (n. 33)", () => {
    const year = yearWith(8, 14, 0);
    expect(ids(on(year, 8, 14))).not.toContain("in-vigilia-assumptionis-bmv");
  });

  it("commemorates nothing on the vigil of Christmas, the Fourth Sunday of Advent included (n. 30a)", () => {
    const year = yearWith(12, 24, 0);
    expect(on(year, 12, 24).id).toBe("in-vigilia-nativitatis-domini");
    expect(ids(on(year, 12, 24))).toEqual([]);
  });

  it("never has two ferias on one date, kept or commemorated", () => {
    for (let year = 2024; year <= 2040; year++) {
      const calendar = generateCalendar({ year });
      for (const month of Object.values(calendar)) {
        for (const entry of Object.values(month ?? {})) {
          if (entry === undefined) continue;
          const ferias = [entry, ...(entry.commemorations ?? [])].filter((c) => c.type === "feria");
          expect(ferias.map((c) => c.id ?? "(feria)"), `${year}`).toHaveLength(Math.min(ferias.length, 1));
        }
      }
    }
  }, 60_000);

  it("commemorates no Sunday after Pentecost in Advent (n. 77)", () => {
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      const calendar = generateCalendar({ year });
      for (const month of [11, 12]) {
        for (const entry of Object.values(calendar[month] ?? {})) {
          if (entry?.season !== "adventus") continue;
          expect(ids(entry).filter((id) => id.includes("post-pentecosten")), `${year}`).toEqual([]);
        }
      }
    }
  });

  it("keeps no two days of one saint together but the same saint's (n. 95)", () => {
    // Feasts whose ids name the same saint, and that meet on one date in some
    // year, must be the same saint — or be told apart by `honours`. Only these
    // are known to be one saint. A day that says whom it honours is left out:
    // what it shares, it shares on purpose.
    const sameSaint = new Set([
      "bonifatii-episcopi-et-martyris + bonifatii-episcopi-et-sociorum-martyrum",
    ]);
    const met = new Set<string>();
    for (let year = 2020; year <= 2060; year++) {
      for (const propers of [[], ["neerlandia/ultrajectum"], ["fsspx"]]) {
        const calendar = parseCalendarData(year, propers);
        for (const month of Object.values(calendar)) {
          for (const entry of Object.values(month ?? {})) {
            if (entry === undefined) continue;
            const all = [entry, ...entry.commemorations].filter(
              (c) => c.id !== undefined && c.honours === undefined
            );
            for (const [i, a] of all.entries()) {
              for (const b of all.slice(i + 1)) {
                const shared = honoursOf(a).some((h) => honoursOf(b).includes(h));
                if (shared && a.id !== b.id) met.add([a.id, b.id].sort().join(" + "));
              }
            }
          }
        }
      }
    }
    expect([...met].filter((pair) => !sameSaint.has(pair))).toEqual([]);
  }, 60_000);
});
