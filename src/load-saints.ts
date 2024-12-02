import { readFileSync } from "fs";
import { parse } from "yaml";

export type LiturgicalClass = 1 | 2 | 3 | 4;
export interface Saint {
  title: string;
  type: "feest" | "vigilie" | "lord" | "custom";
  subtitle?: string;
  class: LiturgicalClass;
}
export type Saints = Record<number, Record<number, Saint[]>>;

type RawCalendar = Record<
  LiturgicalClass,
  Record<`${number}-${number}`, string | string[]>
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
  const allRawSaints: RawSaints = parse(
    readFileSync(`./assets/saints/${lang}.yml`, "utf-8")
  );

  const saints: Saints = {};
  for (let class_ = 1; class_ <= 4; class_++) {
    Object.entries(calendar[class_ as LiturgicalClass]).forEach(
      ([key, val]) => {
        const day = Number.parseInt(key.split("-")[0]);
        const month = Number.parseInt(key.split("-")[1]);
        const ids = Array.isArray(val) ? val : [val];
        for (let id of ids) {
          const saint = allRawSaints[id];
          if (!saint) console.log(id);

          saints[month] ??= {};
          saints[month][day] ??= [];
          saints[month][day].push({
            title: saint.name.replace("H. ", "H.\u00A0"),
            subtitle: saint.title,
            type: saint.type ?? "feest",
            class: class_ as LiturgicalClass,
          });
        }
      }
    );
  }

  return saints;
}
