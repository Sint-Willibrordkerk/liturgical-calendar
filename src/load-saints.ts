import { readFileSync } from "fs";
import { parse } from "yaml";

export type LiturgicalClass = 1 | 2 | 3 | 4;
export interface Saint {
  title: string;
  type: "festum" | "vigilia" | "domini" | "custom";
  subtitle?: string;
  class: LiturgicalClass;
}
export type Saints = Record<number, Record<number, Saint[]>>;

type RawCalendar = Record<
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
type RawSaints = Record<
  string,
  {
    name: string;
    title?: string;
    type?: "vigilie" | "lord" | "custom";
  }
>;

export function loadSaints(lang: string): Saints {
  const calendar: RawCalendar = parse(
    readFileSync("./assets/calendar.yml", "utf-8")
  );
  const latinSaints: LatinSaints = parse(
    readFileSync(`./assets/saints/la_VA.yml`, "utf-8")
  );

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
            title: id.replace("H. ", "H.\u00A0"),
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
