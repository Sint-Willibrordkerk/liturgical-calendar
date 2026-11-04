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
import { issueOption, maybeArraySchema, zRegex } from "./utils";

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

const commemoratedSchema = z.enum(["privileged", "ordinary", "never"]);

const oneOrMany = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.array(schema)]);

/**
 * A kind of day, by its own fields. Strict, so a field misspelt is refused
 * rather than never matching.
 */
const matcherSchema: z.ZodType<Matcher> = z
  .object({
    type: oneOrMany(z.string()).optional(),
    class: oneOrMany(z.number()).optional(),
    commemorated: oneOrMany(commemoratedSchema).optional(),
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
    "over-the-count": z.literal("omitted"),
  })
  .strict();

/** The matchers a day holds, wherever they are, to be checked against the lists. */
function matchersOf(data: CalendarData): [string, Matcher][] {
  const out: [string, Matcher][] = [];
  data.admits?.of?.forEach((m, i) => out.push([`admits.of.${i}`, m]));
  data["omitted-on"]?.forEach((m, i) => out.push([`omitted-on.${i}`, m]));
  data.commemorations?.excludes.forEach((rule, i) => {
    if (rule !== "honours")
      rule.forEach((m, j) => out.push([`commemorations.excludes.${i}.${j}`, m]));
  });
  data.commemorations?.order.forEach((m, i) => {
    if (m !== "precedence") out.push([`commemorations.order.${i}`, m]);
  });
  return out;
}

// This needs to be a function because it's recursive and uses context
export function createCalendarDataSchema(parent?: Partial<CalendarData>): z.ZodType<CalendarData> {
  return z
    .object({
      "valid-types": z.array(z.string()).optional(),
      "valid-liturgical-classes": z.array(z.number()).optional(),
      "valid-commemorated": z.array(commemoratedSchema).optional(),
      "valid-colors": z.array(z.string()).optional(),

      id: idSchema.optional(),
      type: z.string().optional(),
      "liturgical-class": z.number().optional(),
      color: z.string().optional(),

      commemorations: commemorationRulesSchema.optional(),
      "local-calendars": z.array(z.string()).optional(),
      commemorated: commemoratedSchema.optional(),
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
      items: z.array(z.unknown()).optional() as z.ZodType<CalendarData[]>,
    })
    .superRefine((data, ctx) => {
      const {
        "valid-types": validTypes,
        "valid-liturgical-classes": validLiturgicalClasses,
        "valid-commemorated": validCommemorated,
        "valid-colors": validColors,
      } = {
        "valid-types": [],
        "valid-liturgical-classes": [],
        "valid-commemorated": [],
        "valid-colors": [],
        ...parent,
        ...data,
      };

      issueOption(ctx, "type", validTypes, data.type);
      issueOption(ctx, "liturgical-class", validLiturgicalClasses, data["liturgical-class"]);
      issueOption(ctx, "commemorated", validCommemorated, data.commemorated);
      for (const [path, matcher] of matchersOf(data)) {
        [matcher.type ?? []]
          .flat()
          .forEach((type) => issueOption(ctx, `${path}.type`, validTypes, type));
        [matcher.class ?? []]
          .flat()
          .forEach((c) => issueOption(ctx, `${path}.class`, validLiturgicalClasses, c));
        [matcher.commemorated ?? []]
          .flat()
          .forEach((c) => issueOption(ctx, `${path}.commemorated`, validCommemorated, c));
      }

      issueOption(ctx, "color", validColors, data.color);
      Object.entries(data.calendar ?? {}).forEach(([date, value]) => {
        const entries = Array.isArray(value) ? value : [value];
        entries.forEach((entry, index) => {
          if (typeof entry === "string") return;
          const path = Array.isArray(value) ? [date, index] : [date];
          issueOption(ctx, ["calendar", ...path, "color"].join("."), validColors, entry.color);
        });
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
  parent?: any,
): asserts calendarData is CalendarData {
  createCalendarDataSchema(parent).parse(calendarData);
}
