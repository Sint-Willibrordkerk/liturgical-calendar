import { z } from "zod";
import type {
  MassProper,
  BiblicalReference,
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

const biblicalReferenceSchema: z.ZodType<BiblicalReference> = z.object({
  book: z.string(),
  chapter: z.number(),
  verses: z.string(),
  reference: z.string(),
});

const verseTextSchema: z.ZodType<VerseText> = z.object({
  references: maybeArraySchema(z.string()).optional(),
  text: z.string(),
});

const introitProperSchema: z.ZodType<IntroitProper> = z.object({
  antiphon: verseTextSchema,
  verse: verseTextSchema,
  gloriaPatri: z.boolean(),
});

const collectProperSchema: z.ZodType<CollectProper> = z.object({
  text: z.string(),
  ending: z.string(),
});

const epistleProperSchema: z.ZodType<EpistleProper> = z.object({
  reference: biblicalReferenceSchema,
  incipit: z.string().optional(),
  text: z.string(),
});

const gradualProperSchema: z.ZodType<GradualProper> = z.object({
  response: z.string(),
  verse: verseTextSchema,
});

const alleluiaProperSchema: z.ZodType<AlleluiaProper> = z.object({
  alleluia: z.string(),
  verse: verseTextSchema,
});

const tractProperSchema: z.ZodType<TractProper> = z.object({
  verses: z.array(z.string()),
});

const gospelProperSchema: z.ZodType<GospelProper> = z.object({
  reference: biblicalReferenceSchema,
  incipit: z.string().optional(),
  text: z.string(),
});

const offertoryProperSchema: z.ZodType<OffertoryProper> = z.object({
  antiphon: verseTextSchema,
  verse: verseTextSchema.optional(),
});

const secretProperSchema: z.ZodType<SecretProper> = z.object({
  text: z.string(),
  ending: z.string(),
});

const communionProperSchema: z.ZodType<CommunionProper> = z.object({
  antiphon: verseTextSchema,
  verse: verseTextSchema.optional(),
});

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

export type MassPropersData = Record<string, MassProper>;

export const massPropersDataSchema: z.ZodType<MassPropersData> = z.record(
  z.string(),
  massProperSchema
);

export function assertMassPropers(
  massPropers: any
): asserts massPropers is MassPropersData {
  massPropersDataSchema.parse(massPropers);
}
