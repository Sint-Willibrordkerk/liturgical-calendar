import type { Calendar, Color, Commemorated, LiturgicalDay, Occurence, RelativeDate, Weekday } from "./types";
import { calculateAdvent, calculateEaster, daysBetween, getDate } from "./utils";
import { weekdays } from "./constants";
import type { Assets } from "./assets";
import { loadCalendar, loadPropers } from "./loadAssets";
import { idOf } from "./naming";
import { defaultColor, mayWearRose, seasonOf } from "./seasons";

/**
 * Put a day on its date. The day already there gives way and is commemorated:
 * the days are placed lowest first. The season belongs to the date and the
 * color to the Mass that is said, so neither follows it down: a commemoration
 * is a collect added to that Mass, not a Mass of its own. Nor does the Office,
 * which is that of the celebration kept.
 */
function place(calendar: Calendar, date: Date, day: Omit<LiturgicalDay, "commemorations">) {
  const month = (calendar[date.getMonth() + 1] ??= {});
  const existing = month[date.getDate()];
  if (existing === undefined) {
    month[date.getDate()] = { commemorations: [], ...day };
    return;
  }
  const {
    commemorations,
    officium: _officium,
    season: _season,
    color: _color,
    alternativeColor: _alternativeColor,
    ...commemorated
  } = existing;
  month[date.getDate()] = { ...day, commemorations: [commemorated, ...commemorations] };
}

function getDates(occurence: Occurence, advent: Date, easter: Date, year: number) {
  const dates = [];

  if (typeof occurence === "object") {
    if ("start" in occurence && "end" in occurence && occurence.start && occurence.end) {
      const date = getDate(occurence.start, advent, easter, year);
      const end = getDate(occurence.end, advent, easter, year);

      while (daysBetween(date, end) >= 0) {
        if (
          !occurence.type ||
          (occurence.type in weekdays && weekdays[occurence.type as Weekday] === date.getDay()) ||
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
export function parseCalendarData(
  assets: Assets,
  year: number,
  properNames: readonly string[]
) {
  // The propers are put in their slots, and every day checked, as it loads.
  const { days } = loadCalendar(
    assets,
    properNames.map((name) => loadPropers(assets, name))
  );
  const calendar: Calendar = {};
  const advent = calculateAdvent(year);
  const easter = calculateEaster(year);

  days.toReversed().forEach(({ occurence, localCalendar, id: template, ...item }) => {
    getDates(occurence, advent, easter, year).forEach((date, index) => {
      const count = index + 1;
      const id = template === undefined ? undefined : idOf(template, count, date);

      // The season belongs to the date; the color to the day's own Mass,
      // where the calendar names one, and to the season otherwise.
      const season = seasonOf(date, easter, advent);
      const color = (item.color as Color | undefined) ?? defaultColor(item.type, season);
      const alternativeColor =
        item.type === "dominica" && mayWearRose(date, easter, advent)
          ? ("rose" as const)
          : undefined;

      // The fields a language adds later hold their place here, so that a
      // published day reads in the same order every time.
      place(calendar, date, {
        id,
        title: undefined,
        ...item,
        // Checked against the calendar's list as it loaded.
        commemorated: item.commemorated as Commemorated | undefined,
        color,
        mass: undefined,
        officium: undefined,
        proper: id ? { id, ...(localCalendar && { local: localCalendar }) } : undefined,
        naming: template === undefined ? undefined : { template, count },
        season,
        alternativeColor,
      });
    });
  });

  return calendar;
}
