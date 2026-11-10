/**
 * The local propers laid into the calendar.
 *
 * The calendar leaves a slot wherever the table of precedence puts a proper's
 * days — the principal patron of a diocese, its third-class feasts — and a
 * proper names the slot each of its days fills. Its days take the slot's place
 * in the calendar's own tree, so they rank where the table ranks them.
 */
import type { CalendarData } from "../types";

/** A local proper: the name it is asked for by, and what it says. */
export type LocalProper = { name: string; data: CalendarData };

/**
 * The local calendar of Divinum Officium a proper's days are read from. A
 * proper is filed as the sources file it, slugified: `neerlandia/ultrajectum`
 * is their `Neerlandia/Ultrajectum`.
 */
function localCalendarOf(name: string): string {
  return name
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("/");
}

/**
 * A proper's days, each with what its own groups say of it, in their order. A
 * group's dates are not its days', so a `calendar` stays with the day it is on.
 */
function daysOf(node: CalendarData, inherited: CalendarData = {}): CalendarData[] {
  const { items, ...own } = node;
  const merged = { ...inherited, ...own };
  if (!items?.length) return [merged];
  const { calendar: _calendar, ...passed } = merged;
  return items.flatMap((item) => daysOf(item, passed));
}

/** The names of the slots the calendar leaves. */
function slotsOf(node: CalendarData): string[] {
  return [...(node.slot === undefined ? [] : [node.slot]), ...(node.items ?? []).flatMap(slotsOf)];
}

/**
 * The calendar with the propers' days in the slots they name, and what is
 * wrong with them: a day that names no slot, or a slot the calendar does not
 * leave. Of several propers filling one slot, the last named comes first. A
 * slot no proper fills is left empty. The calendar given is not changed.
 */
export function insertPropers(
  calendar: CalendarData,
  propers: readonly LocalProper[]
): { calendar: CalendarData; problems: string[] } {
  const slots = new Set(slotsOf(calendar));
  const problems: string[] = [];
  const filling = new Map<string, CalendarData[]>();

  for (const { name, data } of propers.toReversed()) {
    for (const { "slot-name": slot, ...day } of daysOf(data)) {
      if (slot === undefined) {
        problems.push(`${name}: a day in no slot`);
      } else if (!slots.has(slot)) {
        problems.push(`${name}: no slot "${slot}" in the calendar`);
      } else {
        filling.set(slot, [...(filling.get(slot) ?? []), { ...day, "local-calendar": localCalendarOf(name) }]);
      }
    }
  }

  const insert = (node: CalendarData): CalendarData => {
    const { slot, items, ...own } = node;
    if (slot !== undefined) return { ...own, items: filling.get(slot) ?? [] };
    return items === undefined ? node : { ...own, items: items.map(insert) };
  };
  return { calendar: insert(calendar), problems };
}
