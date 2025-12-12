import { z } from "zod";
import type { CalendarData, Occurence, OccurenceType } from "src/types";
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

// This needs to be a function because it's recursive and uses context
export function createCalendarDataSchema(
  parent?: Partial<CalendarData>
): z.ZodType<CalendarData> {
  return z
    .object({
      "valid-types": z.array(z.string()).optional(),
      "valid-liturgical-classes": z.array(z.number()).optional(),
      "valid-commemoration-types": z.array(z.string()).optional(),
      type: z.string().optional(),
      title: z.string().optional(),
      "liturgical-class": z.number().optional(),
      "commemoration-type": z.string().optional(),
      "accept-commemoration-types": z.array(z.string()).optional(),
      occurence: occurenceSchema.optional(),
      calendar: z
        .record(dateStringSchema as z.ZodString, maybeArraySchema(z.string()))
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
      } = {
        "valid-types": [],
        "valid-liturgical-classes": [],
        "valid-commemoration-types": [],
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
