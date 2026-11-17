/**
 * The local propers laid into the calendar.
 *
 * The calendar leaves a slot wherever the table of precedence puts a proper's
 * days, and a proper says which days fill each slot. They take the slot's
 * place in the calendar's own tree, so they rank where the table ranks them.
 */
import type { CalendarData, CalendarMap } from "../types";

/** A local proper: the name it is asked for by, and its days by slot. */
export type LocalProper = { name: string; days: Record<string, CalendarMap> };

/**
 * The local calendar of Divinum Officium a proper's days are read from. A
 * proper is filed as the sources file it, slugified: `neerlandia/ultrajectum`
 * is their `Neerlandia/Ultrajectum`.
 */
function localCalendarOf(name: string): string {
  return name.replace(/(^|\/)./g, (start) => start.toUpperCase());
}

/**
 * The calendar with the propers' days in their slots, and the slots they name
 * that it does not leave. Of several propers filling one slot, the last named
 * comes first.
 */
export function insertPropers(
  calendar: CalendarData,
  propers: readonly LocalProper[]
): { calendar: CalendarData; problems: string[] } {
  const slots = new Set<string>();

  const insert = ({ slot, items, ...own }: CalendarData): CalendarData => {
    if (slot === undefined) return items ? { ...own, items: items.map(insert) } : own;
    slots.add(slot);
    const filling = propers.toReversed().filter(({ days }) => days[slot] !== undefined);
    return {
      ...own,
      items: filling.map(({ name, days }) => ({
        calendar: days[slot]!,
        "local-calendar": localCalendarOf(name),
      })),
    };
  };

  const inserted = insert(calendar);
  const problems = propers.flatMap(({ name, days }) =>
    Object.keys(days)
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${name}: no slot "${slot}" in the calendar`)
  );
  return { calendar: inserted, problems };
}
