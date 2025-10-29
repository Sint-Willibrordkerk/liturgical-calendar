import type {
  CalendarData,
  DateString,
  Occurence,
  RelativeDate,
  Weekday,
} from "./types";
import { CalendarBuilder } from "./parse";
import { calculateAdvent, calculateEaster, getDate } from "./utils";
import { weekdays } from "./constants";
import { loadCalendarData, loadPropers } from "./loadAssets";
import { ordinals, days } from "./ordinals";

type ParsedCalendarData = {
  type: string;
  title?: string;
  liturgicalClass: number;
  commemorationType: string;
  acceptCommemorationTypes: string[];
  occurence?: Occurence;
  calendar?: Record<DateString, string[] | string | undefined>;
  slot?: string;
  slotName?: string;
};

function flattenCalendarData(
  item: CalendarData,
  parent: Partial<ParsedCalendarData>,
  slots: Record<string, ParsedCalendarData[]> = {}
) {
  const list: ParsedCalendarData[] = [];
  const merged: Partial<ParsedCalendarData> = {
    title: item.title ?? parent.title,
    type: item.type ?? parent.type,
    liturgicalClass: item["liturgical-class"] ?? parent.liturgicalClass,
    commemorationType: item["commemoration-type"] ?? parent.commemorationType,
    acceptCommemorationTypes:
      item["accept-commemoration-types"] ?? parent.acceptCommemorationTypes,
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
      const titles = Array.isArray(value) ? value : [value];
      titles.reverse().forEach((title) => {
        list.push({
          ...(merged as ParsedCalendarData),
          title,
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

export function parseCalendarData(year: number, propers: string[]) {
  const calendarData = loadCalendarData();
  const calendarBuilder = new CalendarBuilder();

  const slots: Record<string, ParsedCalendarData[]> = {};
  propers.reverse().forEach((proper) => {
    const properData = flattenCalendarData(loadPropers(proper), {});
    properData.forEach(({ slotName, ...item }) => {
      slots[slotName!] ??= [];
      slots[slotName!]!.push(item);
    });
  });

  const list = flattenCalendarData(calendarData, {}, slots);
  const advent = calculateAdvent(year);
  const easter = calculateEaster(year);

  list.reverse().forEach((item) => {
    if (item.occurence) {
      const dates = getDates(item.occurence, advent, easter, year);
      dates.forEach((date, index) => {
        calendarBuilder.add(date.getMonth() + 1, date.getDate(), {
          ...item,
          title: item.title
            ?.replace("$count", ordinals[(index + 1) as keyof typeof ordinals])
            .replace("$day", days[(date.getDay() + 1) as keyof typeof days]),
        });
      });
    }
  });

  return calendarBuilder.result;
}
