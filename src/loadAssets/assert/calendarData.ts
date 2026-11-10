import { z } from "zod";
import type {
  Admits,
  CalendarData,
  CalendarEntry,
  CommemorationRules,
  Matcher,
  Occurence,
  OccurenceType,
} from "../../types";
import { weekdays } from "../../constants";
import { dateStringSchema, liturgicalDateSchema, relativeDateSchema } from "./relativeDate";
import { maybeArraySchema, zRegex } from "./utils";
import { insertPropers, type LocalProper } from "../insertPropers";
import { problemsOf } from "../../calendarValidity";

const weekdayKeys = Object.keys(weekdays);

const occurenceTypeSchema: z.ZodType<OccurenceType> = zRegex(
  `!?(${weekdayKeys.join("|")})`,
  "occurence type",
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

/**
 * A day's id: a slug — lowercase, digits and hyphens — with `$count`, `$day`
 * or `$feria` where the date fills it in. It names the day; what the day is
 * called is the language's to say.
 */
const idSchema = z
  .string()
  .regex(/^[a-z0-9$]+(?:-[a-z0-9$]+)*$/, "an id is a slug: lowercase, digits and hyphens");

/** Whom a day honours: slugs, as an id is (n. 112). */
const honoursSchema = z.array(idSchema);

/**
 * A day of a `calendar` map: an id, or an id with a color of its own or with
 * whom it honours.
 */
const calendarEntrySchema: z.ZodType<CalendarEntry> = z.union([
  idSchema,
  z
    .object({ id: idSchema, color: z.string().optional(), honours: honoursSchema.optional() })
    .strict(),
]);

const oneOrMany = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.array(schema)]);

/**
 * A kind of day, by its own fields. Strict, so a field misspelt is refused
 * rather than never matching; its values are checked once merged.
 */
const matcherSchema: z.ZodType<Matcher> = z
  .object({
    type: oneOrMany(z.string()).optional(),
    class: oneOrMany(z.number()).optional(),
    commemorated: oneOrMany(z.string()).optional(),
    "of-the-season": z.boolean().optional(),
  })
  .strict();

const admitsSchema: z.ZodType<Admits> = z
  .object({
    count: z.number().int().nonnegative().optional(),
    of: z.array(matcherSchema).optional(),
    "privileged-first": z.boolean().optional(),
  })
  .strict();

const commemorationRulesSchema: z.ZodType<CommemorationRules> = z
  .object({
    excludes: z.array(z.union([z.literal("honours"), z.tuple([matcherSchema, matcherSchema])])),
    order: z.array(z.union([matcherSchema, z.literal("precedence")])),
  })
  .strict();

/**
 * The shape of a calendar or a proper: which fields it has, at any depth, and
 * what kind of value each holds. Any type, class, color or commemoration is
 * taken here; whether the calendar declares it is asked once the propers are
 * merged into it, against the calendar's own lists.
 */
export const calendarDataSchema: z.ZodType<CalendarData> = z.lazy(() =>
  z
    .object({
      "valid-types": z.array(z.string()).optional(),
      "valid-liturgical-classes": z.array(z.number()).optional(),
      "valid-commemorated": z.array(z.string()).optional(),
      "valid-colors": z.array(z.string()).optional(),
      commemorations: commemorationRulesSchema.optional(),

      id: idSchema.optional(),
      type: z.string().optional(),
      "liturgical-class": z.number().optional(),
      color: z.string().optional(),

      commemorated: z.string().optional(),
      admits: admitsSchema.optional(),
      "omitted-on": z.array(matcherSchema).optional(),
      honours: honoursSchema.optional(),
      "of-the-season": z.boolean().optional(),

      occurence: occurenceSchema.optional(),
      calendar: z
        .record(dateStringSchema as z.ZodString, maybeArraySchema(calendarEntrySchema))
        .optional(),
      slot: z.string().optional(),
      "slot-name": z.string().optional(),
      items: z.array(calendarDataSchema).optional(),
    })
    .strict()
);

/**
 * The calendar, its propers inserted and checked: its shape read, the
 * propers' days put in the slots they name, and every day then checked against
 * the lists the calendar declares.
 */
export function calendarSchema(propers: readonly LocalProper[]): z.ZodType<CalendarData> {
  return calendarDataSchema
    .transform((calendar, ctx) => {
      const inserted = insertPropers(calendar, propers);
      for (const message of inserted.problems) ctx.addIssue({ code: "custom", message });
      return inserted.calendar;
    })
    .superRefine((calendar, ctx) => {
      for (const message of problemsOf(calendar)) ctx.addIssue({ code: "custom", message });
    });
}
