/**
 * The day as it is published, built from the day as it was settled.
 *
 * A day is settled with more on it than is published: how it is commemorated,
 * what it admits, where its Mass is filed. The published day is built here
 * field by field, in the order it reads in, so that what is published is
 * exactly what its type says: a field of the settling cannot reach it, and a
 * field added to the type must be given here before this compiles.
 */
import type { Commemoration, LiturgicalDay, WorkingCommemoration, WorkingDay } from "./types";

/** Every field of `T`, named: one left out does not compile. */
type Every<T> = { [K in keyof Required<T>]: T[K] | undefined };

/** `fields` without those that hold nothing: a day has no key for what it has not. */
function present<T>(fields: Every<T>): T {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as T;
}

/** A commemoration as it is published: what it is, what it is called, its Mass. */
function publishCommemoration(settled: WorkingCommemoration): Commemoration {
  return present<Commemoration>({
    id: settled.id,
    title: settled.title,
    // Every day of the calendar has a type: it is checked as the calendar loads.
    type: settled.type!,
    liturgicalClass: settled.liturgicalClass,
    mass: settled.mass,
  });
}

/** The day as it is published, with the days commemorated with it. */
export function publish(settled: WorkingDay): LiturgicalDay {
  return present<LiturgicalDay>({
    id: settled.id,
    title: settled.title,
    type: settled.type!,
    liturgicalClass: settled.liturgicalClass,
    color: settled.color,
    mass: settled.mass,
    officium: settled.officium,
    season: settled.season,
    alternativeColor: settled.alternativeColor,
    // No commemorations is no list of them.
    commemorations:
      settled.commemorations.length > 0
        ? settled.commemorations.map(publishCommemoration)
        : undefined,
    martyrologium: settled.martyrologium,
    seasonName: settled.seasonName,
    colorName: settled.colorName,
    alternativeColorName: settled.alternativeColorName,
  });
}
