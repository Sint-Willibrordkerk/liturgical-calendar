import { LiturgicalClass } from "./types";
import {
  assert,
  assertMaybeArray,
  assertObject,
  assertString,
  loadAsset,
} from "./parse/utils";
import {
  parseCalendar,
  parseSaints,
  parseSaintsTranslation,
  parseTempore,
} from "./parse";

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

function loadSaint(
  name: string,
  titles: string | string[] | undefined,
  type: LatinSaints[string]["type"],
  class_: LiturgicalClass
): Saint {
  return {
    title: name,
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
  const latinSaints = parseSaints();
  const calendar = parseCalendar(Object.keys(latinSaints));
  const tempore = parseTempore();
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
    const langSaints = parseSaintsTranslation(lang, Object.keys(latinSaints));
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
