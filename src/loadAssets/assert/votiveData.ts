import { z } from "zod";
import type { VotiveData } from "../../types";
import { weekdays } from "../../constants";

const CATEGORIES = ["mysteries-of-the-lord", "blessed-virgin-mary", "angels"] as const;
const CLASSES = [3, 4] as const;
const weekdaySchema = z.enum(
  Object.keys(weekdays) as [keyof typeof weekdays, ...(keyof typeof weekdays)[]]
);

const votiveMassSchema = z.object({
  category: z.enum(CATEGORIES),
  "liturgical-class": z.union([z.literal(3), z.literal(4)]),
  rubric: z.string(),
  slug: z.string().optional(),
  occurrence: z
    .object({
      cadence: z.enum(["monthly", "weekly"]),
      weekday: weekdaySchema,
    })
    .optional(),
});

const votiveDataSchema = z.object({
  "valid-categories": z.array(z.string()).optional(),
  "valid-liturgical-classes": z.array(z.number()).optional(),
  items: z.record(z.string(), votiveMassSchema),
});

export function assertVotiveData(data: unknown): asserts data is VotiveData {
  votiveDataSchema.parse(data);
}
