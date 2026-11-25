import { bundledAssets } from "./bundledAssets";
import { calendarOf } from "./generate";

export { type Language } from "./language";
export type { Options } from "./generate";
export type {
  Calendar,
  Color,
  Commemoration,
  Fallback,
  LiturgicalDay,
  Martyrologium,
  Officium,
  Season,
} from "./types";

/**
 * The liturgical calendar of a year, from the calendar and the days this
 * package is published with: `generateCalendar({ year, languages: [nl, la] })`.
 * See `calendarOf` for what it takes and gives.
 */
export default calendarOf(bundledAssets);
