import { z } from "zod";
import type {
  MassProper,
  VerseText,
  IntroitProper,
  CollectProper,
  EpistleProper,
  GradualProper,
  AlleluiaProper,
  TractProper,
  GospelProper,
  OffertoryProper,
  SecretProper,
  CommunionProper,
  PostcommunionProper,
} from "../../types";
import { maybeArraySchema } from "./utils";

const verseTextSchema: z.ZodType<VerseText> = z.object({
  references: maybeArraySchema(z.string()).optional(),
  text: z.string(),
});

const introitProperSchema: z.ZodType<IntroitProper> = z.object({
  antiphon: verseTextSchema,
  verse: verseTextSchema,
});

const collectProperSchema: z.ZodType<CollectProper> = z.object({
  text: z.string(),
  ending: z.string(),
});

const epistleProperSchema: z.ZodType<EpistleProper> = verseTextSchema;

const gradualProperSchema: z.ZodType<GradualProper> = z.object({
  antiphon: verseTextSchema,
  verse: verseTextSchema,
});

const alleluiaProperSchema: z.ZodType<AlleluiaProper> = verseTextSchema;

const tractProperSchema: z.ZodType<TractProper> = z.object({
  verses: z.array(z.string()),
});

const gospelProperSchema: z.ZodType<GospelProper> = verseTextSchema;

const offertoryProperSchema: z.ZodType<OffertoryProper> = verseTextSchema;

const secretProperSchema: z.ZodType<SecretProper> = z.object({
  text: z.string(),
  ending: z.string(),
});

const communionProperSchema: z.ZodType<CommunionProper> = verseTextSchema;

const postcommunionProperSchema: z.ZodType<PostcommunionProper> = z.object({
  text: z.string(),
  ending: z.string(),
});

export const massProperSchema: z.ZodType<MassProper> = z.object({
  introit: introitProperSchema.optional(),
  collect: collectProperSchema.optional(),
  epistle: epistleProperSchema.optional(),
  gradual: gradualProperSchema.optional(),
  alleluia: alleluiaProperSchema.optional(),
  tract: tractProperSchema.optional(),
  gospel: gospelProperSchema.optional(),
  offertory: offertoryProperSchema.optional(),
  secret: secretProperSchema.optional(),
  communion: communionProperSchema.optional(),
  postcommunion: postcommunionProperSchema.optional(),
});

export type MassPropersData = Record<string, MassProper | MassProper[]>;

export const massPropersDataSchema: z.ZodType<MassPropersData> = z.record(
  z.string(),
  maybeArraySchema(massProperSchema)
);

export function assertMassPropers(
  massPropers: any
): asserts massPropers is MassPropersData {
  massPropersDataSchema.parse(massPropers);
}
