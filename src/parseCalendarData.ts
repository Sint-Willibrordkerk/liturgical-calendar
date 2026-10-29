import type {
  CalendarData,
  CalendarEntry,
  Color,
  DateString,
  Occurence,
  RelativeDate,
  Weekday,
} from "./types";
import { CalendarBuilder } from "./parse";
import { calculateAdvent, calculateEaster, getDate } from "./utils";
import { weekdays } from "./constants";
import { loadCalendarData, loadPropers } from "./loadAssets";
import { idOf } from "./naming";
import { defaultColor, mayWearRose, seasonOf } from "./seasons";

type ParsedCalendarData = {
  type: string;
  id?: string;
  liturgicalClass: number;
  commemorationType: string;
  acceptCommemorationTypes: string[];
  color?: string;
  occurence?: Occurence;
  calendar?: Record<DateString, CalendarEntry[] | CalendarEntry | undefined>;
  slot?: string;
  slotName?: string;
  /**
   * The local calendars of the sources a local proper's own day is read from,
   * before the general ones. A day of the base calendar reads only the general
   * ones, so it keeps its own propers whatever local proper is chosen: a local
   * calendar may file a different saint under the same name.
   */
  localCalendars?: string[];
};

function flattenCalendarData(
  item: CalendarData,
  parent: Partial<ParsedCalendarData>,
  slots: Record<string, ParsedCalendarData[]> = {}
) {
  const list: ParsedCalendarData[] = [];
  const merged: Partial<ParsedCalendarData> = {
    id: item.id ?? parent.id,
    type: item.type ?? parent.type,
    liturgicalClass: item["liturgical-class"] ?? parent.liturgicalClass,
    commemorationType: item["commemoration-type"] ?? parent.commemorationType,
    acceptCommemorationTypes:
      item["accept-commemoration-types"] ?? parent.acceptCommemorationTypes,
    color: item.color ?? parent.color,
    occurence: item.occurence ?? parent.occurence,
    slotName: item["slot-name"] ?? parent.slotName,
  };

  if (item.slot) {
    list.push(
      ...((slots[item.slot]?.map((slot) => ({
        ...merged,
        ...Object.fromEntries(
          Object.entries(slot).filter(([_, value]) => value !== undefined)
        ),
      })) ?? []) as ParsedCalendarData[])
    );
  } else if (item.items?.length)
    list.push(
      ...item.items.flatMap((subItem) =>
        flattenCalendarData(subItem, merged as ParsedCalendarData, slots)
      )
    );
  else if (Object.keys(item.calendar ?? {}).length) {
    Object.entries(item.calendar!).forEach(([date, value]) => {
      if (value === undefined) return;
      // Copied before reversing: the data is shared by every calendar built
      // from it, and reversing it in place would flip the order each time.
      const entries = Array.isArray(value) ? [...value] : [value];
      entries.reverse().forEach((entry) => {
        const { id, color } =
          typeof entry === "string" ? { id: entry, color: undefined } : entry;
        list.push({
          ...(merged as ParsedCalendarData),
          id,
          color: color ?? merged.color,
          occurence: { date: date as DateString },
        });
      });
    });
  } else list.push(merged as ParsedCalendarData);

  return list;
}

function getDates(
  occurence: Occurence,
  advent: Date,
  easter: Date,
  year: number
) {
  const dates = [];

  if (typeof occurence === "object") {
    if (
      "start" in occurence &&
      "end" in occurence &&
      occurence.start &&
      occurence.end
    ) {
      const date = getDate(occurence.start, advent, easter, year);
      const end = getDate(occurence.end, advent, easter, year);

      while (date.getTime() <= end.getTime()) {
        if (
          !occurence.type ||
          (occurence.type in weekdays &&
            weekdays[occurence.type as Weekday] === date.getDay()) ||
          (occurence.type &&
            occurence.type.startsWith("!") &&
            weekdays[occurence.type.slice(1) as Weekday] !== date.getDay())
        )
          dates.push(new Date(date));
        date.setDate(date.getDate() + 1);
      }
    }

    if ("date" in occurence && occurence.date) {
      const date = getDate(occurence as RelativeDate, advent, easter, year);
      dates.push(new Date(date));
    }

    if (!dates.length && "default" in occurence && occurence.default) {
      const date = getDate(occurence.default, advent, easter, year);
      dates.push(new Date(date));
    }
  }

  return dates;
}

/**
 * The days of `year`, with the local `propers` named laid over the general
 * calendar: which is kept on each date and which commemorated, its color and
 * its season, and where each one's Mass is filed.
 *
 * The days are the same in every language, so none is asked for. Each has the
 * id the calendar gives it, and carries what a language needs to name it and
 * to read its propers after.
 */
export function parseCalendarData(year: number, propers: readonly string[]) {
  const calendarData = loadCalendarData();
  const calendarBuilder = new CalendarBuilder();

  const slots: Record<string, ParsedCalendarData[]> = {};
  [...propers].reverse().forEach((proper) => {
    const data = loadPropers(proper);
    const localCalendars = data["local-calendars"];
    const properData = flattenCalendarData(data, {});
    properData.forEach(({ slotName, ...item }) => {
      slots[slotName!] ??= [];
      slots[slotName!]!.push({ ...item, localCalendars });
    });
  });

  const list = flattenCalendarData(calendarData, {}, slots);
  const advent = calculateAdvent(year);
  const easter = calculateEaster(year);

  list.reverse().forEach((item) => {
    if (item.occurence) {
      const dates = getDates(item.occurence, advent, easter, year);
      dates.forEach((date, index) => {
        const count = index + 1;
        const id = item.id === undefined ? undefined : idOf(item.id, count, date);

        // The season belongs to the date; the color to the day's own Mass,
        // where the calendar names one, and to the season otherwise.
        const season = seasonOf(date, easter, advent);
        const color =
          (item.color as Color | undefined) ?? defaultColor(item.type, season);
        const alternativeColor =
          item.type === "dominica" && mayWearRose(date, easter, advent)
            ? ("rose" as const)
            : undefined;

        calendarBuilder.add(date.getMonth() + 1, date.getDate(), {
          ...item,
          id,
          proper: id
            ? item.localCalendars === undefined
              ? { id }
              : { id, local: item.localCalendars }
            : undefined,
          naming: item.id === undefined ? undefined : { template: item.id, count },
          color,
          season,
          alternativeColor,
        });
      });
    }
  });

  return calendarBuilder.result;
}
