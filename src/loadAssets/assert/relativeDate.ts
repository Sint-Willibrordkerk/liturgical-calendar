import { z } from "zod";
import type {
  DateString,
  LiturgicalDate,
  NamedDate,
  RelativeDate,
} from "../../types";
import { namedDates } from "../../constants";

export const dateStringSchema: z.ZodType<DateString> = z
  .string()
  .regex(
    new RegExp(`^(${namedDates.join("|")}|[0123]\\d-[01]\\d)$`)
  ) as z.ZodType<DateString>;

export const namedDateSchema: z.ZodType<NamedDate> = z
  .string()
  .regex(new RegExp(`^(${namedDates.join("|")})$`)) as z.ZodType<NamedDate>;

export const relativeDateSchema: z.ZodType<RelativeDate> = z.object({
  date: z.enum(namedDates),
  difference: z.number(),
});

export const liturgicalDateSchema: z.ZodType<LiturgicalDate> = z.union([
  dateStringSchema,
  namedDateSchema,
  relativeDateSchema,
]);
