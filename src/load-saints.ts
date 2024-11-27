export interface Saint {
  title: string;
  type: "feest" | "vigilie" | "lord" | "custom";
  subtitle?: string;
  class: 1 | 2 | 3 | 4;
}
export type Saints = Record<string, Record<string, Saint[]>>;

type RawSaint = {
  name: string;
  titles: string[];
  type: "vigilie" | "lord" | "custom";
  class: 1 | 2 | 3 | 4;
};
type RawSaints = Record<string, Record<string, RawSaint | RawSaint[]>>;

export function loadSaints(): Saints {
  const allRawSaints: RawSaints = require("../assets/saints.json");
  const saints: Saints = {};

  for (let month = 1; month <= 12; month++) {
    saints[month] = {};
    Object.entries(allRawSaints[month]).forEach(([day, value]) => {
      const rawSaints = Array.isArray(value) ? value : [value];
      saints[month][day] = rawSaints.map((rawSaint) => ({
        // replace space with nbsp
        title: rawSaint.name.replace("H. ", "H.\u00A0"),
        type: rawSaint.type ?? "feest",
        subtitle: rawSaint.titles
          ? rawSaint.titles.length > 1
            ? `${rawSaint.titles
                .slice(0, -1)
                .join(", ")} en ${rawSaint.titles.slice(-1)}`
            : rawSaint.titles[0]
          : undefined,
        class: rawSaint.class,
      }));
    });
  }

  return saints;
}
