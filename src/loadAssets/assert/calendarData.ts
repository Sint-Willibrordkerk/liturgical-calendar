import { z } from "zod";
import type {
  CalendarData,
  CalendarEntry,
  Occurence,
  OccurenceType,
} from "../../types";
import { weekdays } from "../../constants";
import {
  dateStringSchema,
  liturgicalDateSchema,
  relativeDateSchema,
} from "./relativeDate";
import { issueOption, maybeArraySchema, zRegex } from "./utils";

const weekdayKeys = Object.keys(weekdays);

const occurenceTypeSchema: z.ZodType<OccurenceType> = zRegex(
  `!?(${weekdayKeys.join("|")})`,
  "occurence type"
);

const occurenceSchema: z.ZodType<Occurence> = z.union([
  occurenceTypeSchema,
  relativeDateSchema,
  z.object({
    type: occurenceTypeSchema.optional(),
    start: liturgicalDateSchema.optional(),
    end: liturgicalDateSchema.optional(),
    date: liturgicalDateSchema.optional(),
    default: liturgicalDateSchema.optional(),
  }),
]);

/** A day of a `calendar` map: a title, or a title with a color of its own. */
const calendarEntrySchema: z.ZodType<CalendarEntry> = z.union([
  z.string(),
  z.object({ title: z.string(), color: z.string().optional() }),
]);

// This needs to be a function because it's recursive and uses context
export function createCalendarDataSchema(
  parent?: Partial<CalendarData>
): z.ZodType<CalendarData> {
  return z
    .object({
      "valid-types": z.array(z.string()).optional(),
      "valid-liturgical-classes": z.array(z.number()).optional(),
      "valid-commemoration-types": z.array(z.string()).optional(),
      "valid-colors": z.array(z.string()).optional(),
      "local-calendars": z.array(z.string()).optional(),
      type: z.string().optional(),
      title: z.string().optional(),
      "liturgical-class": z.number().optional(),
      "commemoration-type": z.string().optional(),
      "accept-commemoration-types": z.array(z.string()).optional(),
      color: z.string().optional(),
      occurence: occurenceSchema.optional(),
      calendar: z
        .record(
          dateStringSchema as z.ZodString,
          maybeArraySchema(calendarEntrySchema)
        )
        .optional(),
      slot: z.string().optional(),
      "slot-name": z.string().optional(),
      items: z.array(z.unknown()).optional() as z.ZodType<CalendarData[]>,
    })
    .superRefine((data, ctx) => {
      const {
        "valid-types": validTypes,
        "valid-liturgical-classes": validLiturgicalClasses,
        "valid-commemoration-types": validCommemorationTypes,
        "valid-colors": validColors,
      } = {
        "valid-types": [],
        "valid-liturgical-classes": [],
        "valid-commemoration-types": [],
        "valid-colors": [],
        ...parent,
        ...data,
      };

      issueOption(ctx, "type", validTypes, data.type);
      issueOption(
        ctx,
        "liturgical-class",
        validLiturgicalClasses,
        data["liturgical-class"]
      );
      issueOption(
        ctx,
        "commemoration-type",
        validCommemorationTypes,
        data["commemoration-type"]
      );

      issueOption(ctx, "color", validColors, data.color);
      Object.entries(data.calendar ?? {}).forEach(([date, value]) => {
        const entries = Array.isArray(value) ? value : [value];
        entries.forEach((entry, index) => {
          if (typeof entry === "string") return;
          const path = Array.isArray(value) ? [date, index] : [date];
          issueOption(
            ctx,
            ["calendar", ...path, "color"].join("."),
            validColors,
            entry.color
          );
        });
      });

      data["accept-commemoration-types"]?.forEach((type, index) => {
        issueOption(
          ctx,
          "accept-commemoration-types",
          validCommemorationTypes,
          type
        );
      });

      if (data.items) {
        const { items: _items, ...childData } = data;
        const childSchema = createCalendarDataSchema({
          ...parent,
          ...childData,
        });
        data.items.forEach((item, index) => {
          const result = childSchema.safeParse(item);
          if (!result.success) {
            result.error.issues.forEach((issue) => {
              ctx.addIssue({
                ...issue,
                path: ["items", index, ...issue.path],
              });
            });
          }
        });
      }
    });
}

export function assertCalendarData(
  calendarData: any,
  parent?: any
): asserts calendarData is CalendarData {
  createCalendarDataSchema(parent).parse(calendarData);
}
