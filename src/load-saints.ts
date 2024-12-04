import { AssertionError } from "assert";
import { readFileSync } from "fs";
import { parse } from "yaml";

export type LiturgicalClass = 1 | 2 | 3 | 4;

type Calendar = Record<
  LiturgicalClass,
  Record<`${number}-${number}`, string | string[]>
>;

type LatinSaints = Record<
  string,
  {
    titles?: string[];
    type?: "vigilia" | "domini" | "custom";
  }
>;

export interface Saint {
  title: string;
  subtitle?: string;
  type: "festum" | "vigilia" | "domini" | "custom";
  class: LiturgicalClass;
}
export type Saints = Record<number, Record<number, Saint[]>>;

function assert(condition: any, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

function assertString(val: any): asserts val is string {
  assert(typeof val === "string", `value should be string: ${val}`);
}

function assertMaybeArray(val: any, assert: (val: any) => void) {
  if (Array.isArray(val)) val.forEach(assert);
  else assert(val);
}

function assertObject(
  val: any,
  validateEntries: ([key, val]: [string, any]) => void
): asserts val is object {
  assert(typeof val === "object", `Value should be object: ${val}`);
  Object.entries(val).forEach(([key, val]) => {
    try {
      return validateEntries([key, val]);
    } catch (err) {
      throw new Error(
        `Failed to validate object entry for key: ${key}, caused by ${err.stack}\n`
      );
    }
  });
}

function parseCalendar(): Calendar {
  const calendar = parse(
    readFileSync(__dirname + "/../assets/calendar.yml", "utf-8")
  );

  assertObject(calendar, ([_class, entry]) => {
    assert(/[1-4]/.test(_class), `invalid class: ${_class}`);
    assertObject(entry, ([date, saints]) => {
      assert(/\d{2}-\d{2}/.test(date), `Invalid date: ${date}`);
      assertMaybeArray(saints, assertString);
    });
  });
  assert(Object.keys(calendar).length === 4, "calendar needs the keys 1-4");

  return calendar as Calendar;
}

function parseLatinSaints(): LatinSaints {
  const latinSaints = parse(
    readFileSync(__dirname + "/../assets/saints/la_VA.yml", "utf-8")
  );

  assertObject(latinSaints, ([, saint]) => {
    assertObject(saint, ([key, val]) => {
      switch (key) {
        case "type":
          assert(/(vigilia|domini|custom)/.test(val), `invalid type: ${val}`);
          break;
        case "titles":
          assertMaybeArray(val, assertString);
          break;
        default:
          throw new Error(`unkonwn key: ${key}`);
      }
    });
  });

  return latinSaints as LatinSaints;
}

export function loadSaints(lang: string): Saints {
  const calendar = parseCalendar();
  const latinSaints = parseLatinSaints();
  const langSaints: Saints | null =
    lang === "la_VA"
      ? null
      : parse(readFileSync(`./assets/saints/${lang}.yml`, "utf-8"));

  const saints: Saints = {};
  for (let class_ = 1; class_ <= 4; class_++) {
    Object.entries(calendar[class_ as LiturgicalClass]).forEach(
      ([key, val]) => {
        const [day, month] = key.split("-").map((day) => Number.parseInt(day));
        const ids = Array.isArray(val) ? val : [val];
        for (let id of ids) {
          const saint = latinSaints[id];
          if (!saint) console.error(`Saint not found: ${id}`);

          saints[month] ??= {};
          saints[month][day] ??= [];
          saints[month][day].push({
            title: langSaints ? langSaints[id].name : id,
            subtitle:
              typeof saint.titles === "string"
                ? saint.titles
                : Array.isArray(saint.titles)
                ? saint.titles.length > 1
                  ? `${saint.titles
                      .slice(0, -1)
                      .join(", ")} en ${saint.titles.slice(-1)}`
                  : saint.titles.length
                  ? saint.titles[0]
                  : undefined
                : undefined,
            type: saint.type ?? "festum",
            class: class_ as LiturgicalClass,
          });
        }
      }
    );
  }

  return saints;
}
