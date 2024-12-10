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

type LangSaints = Record<
  string,
  {
    name?: string;
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
      if (err instanceof Error)
        throw new Error(
          `Failed to validate object entry for key: ${key}, caused by ${err.stack}\n`
        );
    }
  });
}

function parseLatinSaints(): LatinSaints {
  const latinSaints = parse(
    readFileSync(`${__dirname}/../assets/saints/la_VA.yml`, "utf-8")
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
          throw new Error(`unknown key: ${key}`);
      }
    });
  });

  return latinSaints as LatinSaints;
}

function parseCalendar(latinSaints: LatinSaints): Calendar {
  const calendar = parse(
    readFileSync(`${__dirname}/../assets/calendar.yml`, "utf-8")
  );

  assertObject(calendar, ([_class, entry]) => {
    assert(/[1-4]/.test(_class), `invalid class: ${_class}`);
    assertObject(entry, ([date, saints]) => {
      assert(/\d{2}-\d{2}/.test(date), `Invalid date: ${date}`);
      assertMaybeArray(saints, (val) => {
        assert(val in latinSaints, `${val} must be in latinSaints`);
        assertString(val);
      });
    });
  });
  assert(Object.keys(calendar).length === 4, "calendar needs the keys 1-4");

  return calendar as Calendar;
}

function parseLangSaints(lang: string, latinSaints: LatinSaints) {
  const langSaints = parse(
    readFileSync(`${__dirname}/../assets/saints/${lang}.yml`, "utf-8")
  );

  assertObject(langSaints, ([key, val]) => {
    assert(key in latinSaints, `langSaints key: ${key} must be in latinSaints`);
    assertObject(val, ([key, val]) => {
      assert(/name/.test(key), `Invalid key ${key}`);
      assertString(val);
    });
  });
  Object.keys(latinSaints).forEach((key) =>
    assert(key in langSaints, `latinSaints key: ${key} must be in langSaints`)
  );

  return langSaints as LangSaints;
}

function loadSaint(
  name: string,
  titles: string | string[] | undefined,
  type: LatinSaints[string]["type"],
  class_: LiturgicalClass
): Saint {
  return {
    title: name.replace("H. ", "H.\u00A0"),
    subtitle:
      typeof titles === "string"
        ? titles
        : Array.isArray(titles)
        ? titles.length > 1
          ? `${titles.slice(0, -1).join(", ")} en ${titles.slice(-1)}`
          : titles.length
          ? titles[0]
          : undefined
        : undefined,
    type: type ?? "festum",
    class: class_,
  };
}

export function loadSaints(lang: string): Saints {
  const latinSaints = parseLatinSaints();
  const calendar = parseCalendar(latinSaints);
  const saints: Saints = {};

  for (
    let class_: LiturgicalClass = 1;
    class_ <= 4;
    class_ = (class_ + 1) as LiturgicalClass
  ) {
    Object.entries(calendar[class_]).forEach(([date, val]) => {
      const [day, month] = date.split("-").map((date) => Number.parseInt(date));
      const names = Array.isArray(val) ? val : [val];

      for (let name of names) {
        const latinSaint = latinSaints[name];
        if (!latinSaint) console.error(`Saint not found: ${name}`);

        saints[month] ??= {};
        saints[month][day] ??= [];
        saints[month][day].push(
          loadSaint(name, latinSaint.titles, latinSaint.type, class_)
        );
      }
    });
  }

  if (lang !== "la_VA") {
    const langSaints = parseLangSaints(lang, latinSaints);
    Object.values(saints).forEach((month) => {
      Object.values(month).forEach((day) => {
        day.forEach((saint) => {
          saint.title = langSaints[saint.title].name ?? saint.title;
        });
      });
    });
  }

  return saints;
}
