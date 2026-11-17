import type { CalendarData, CalendarDay, DateString } from "../types";

/**
 * The calendar's tree as a list of its dated days, in the order written, each
 * with what its groups say of it, the nearest group winning. What falls on no
 * date, such as an empty slot, is left out.
 */
export function flattenCalendar(
  item: CalendarData,
  parent: Partial<CalendarDay> = {}
): CalendarDay[] {
  const merged = {
    id: item.id ?? parent.id,
    type: item.type ?? parent.type,
    liturgicalClass: item["liturgical-class"] ?? parent.liturgicalClass,
    commemorated: item.commemorated ?? parent.commemorated,
    admits: item.admits ?? parent.admits,
    omittedOn: item["omitted-on"] ?? parent.omittedOn,
    honours: item.honours ?? parent.honours,
    ofTheSeason: item["of-the-season"] ?? parent.ofTheSeason,
    color: item.color ?? parent.color,
    occurence: item.occurence ?? parent.occurence,
    localCalendar: item["local-calendar"] ?? parent.localCalendar,
  } as CalendarDay;

  if (item.items?.length) return item.items.flatMap((child) => flattenCalendar(child, merged));

  if (item.calendar && Object.keys(item.calendar).length > 0) {
    return Object.entries(item.calendar).flatMap(([date, value]) =>
      [value ?? []]
        .flat()
        .toReversed()
        .map((entry) => {
          const { id, color, honours } = typeof entry === "string" ? { id: entry } as const : entry;
          return {
            ...merged,
            id,
            color: color ?? merged.color,
            honours: honours ?? merged.honours,
            occurence: { date: date as DateString },
          };
        })
    );
  }

  return merged.occurence === undefined ? [] : [merged];
}
