import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calendarOf } from "./generate";
import { calendarAssets } from "../scripts/assets.mjs";
import { calculateAdvent, calculateEaster, daysBetween } from "./utils";

/**
 * The calendar is the same wherever it is generated. A day falls on its date
 * by the clock of the place, on either side of Greenwich and across the
 * changes of the clock.
 */
describe.each(["America/New_York", "Pacific/Honolulu", "Europe/Amsterdam", "Asia/Tokyo"])(
  "the calendar in %s",
  (zone) => {
    const before = process.env.TZ;
    const generateCalendar = calendarOf(calendarAssets("assets", { days: false }));

    beforeAll(() => {
      process.env.TZ = zone;
    });

    afterAll(() => {
      process.env.TZ = before;
    });

    it("reckons Easter and Advent on their own dates", () => {
      const easter = calculateEaster(2026);
      expect([easter.getMonth() + 1, easter.getDate()]).toEqual([4, 5]);
      const advent = calculateAdvent(2026);
      expect([advent.getMonth() + 1, advent.getDate(), advent.getDay()]).toEqual([11, 29, 0]);
    });

    it("keeps each day on its date", () => {
      const calendar = generateCalendar({ year: 2026 });
      expect(calendar[12]![25]!.id).toBe("in-die-nativitatis-domini");
      expect(calendar[12]![24]!.id).toBe("in-vigilia-nativitatis-domini");
      expect(calendar[4]![5]!.id).toBe("dominica-resurrectionis");
      expect(calendar[1]![6]!.id).toBe("in-epiphania-domini");
      expect(calendar[11]![29]!.id).toBe("dominica-i-adventus");
    });

    it("gives every date of the year a day", () => {
      const calendar = generateCalendar({ year: 2028 });
      expect(Object.values(calendar).flatMap((month) => Object.keys(month ?? {}))).toHaveLength(366);
    });

    it("counts whole days across the changes of the clock", () => {
      expect(daysBetween(new Date(2026, 2, 1), new Date(2026, 3, 1))).toBe(31);
      expect(daysBetween(new Date(2026, 9, 1), new Date(2026, 10, 30))).toBe(60);
    });
  }
);
