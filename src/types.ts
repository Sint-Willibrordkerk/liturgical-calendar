import {
  liturgicalTypes,
  sanctorumTypes,
  weekdays,
  properTypes,
  namedDates,
} from "./constants";

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LiturgicalClass = 1 | 2 | 3 | 4;

export type DateString = `${0 | 1 | 2 | 3}${Digit}-${0 | 1}${Digit}`;
export type NamedDate = (typeof namedDates)[number];
export type RelativeDate = {
  date: NamedDate;
  difference: number;
};
export type LiturgicalDate = DateString | NamedDate | RelativeDate;

export type SanctorumType = (typeof sanctorumTypes)[number];
export type LiturgicalType = (typeof liturgicalTypes)[number];
export type ProperType = (typeof properTypes)[number];

export type Weekday = keyof typeof weekdays;
export type OccurenceType = Weekday | `!${Weekday}`;

export type Occurence =
  | OccurenceType
  | RelativeDate
  | {
      type?: OccurenceType;
      start?: LiturgicalDate;
      end?: LiturgicalDate;
      date?: LiturgicalDate;
      default?: LiturgicalDate;
    };

export type Calendarium = Record<
  LiturgicalClass,
  Record<DateString, string | string[]>
>;

export type Sanctorum = Record<
  string,
  {
    titles?: string | string[];
    type?: SanctorumType;
  }
>;

export type Commemoration = {
  title?: string;
  type?: string;
  liturgicalClass: number;
  commemorationType?: string;
  acceptCommemorationTypes?: string[];
  mass?: MassProper;
};

export type LiturgicalDay = Commemoration & {
  commemorations: Commemoration[];
};

// Mass Proper Types

export type BiblicalReference = {
  book: string;
  chapter: number;
  verses: string; // e.g., "1-7" or "5"
  reference: string; // Display string like "Rom 1:1-7"
};

export type VerseText = {
  references?: string | string[]; // Single reference or array of references (e.g., "Ps 90:1" or ["Ps 90:15-16", "Ps 90:1"])
  text: string;
};

export type IntroitProper = {
  antiphon: VerseText;
  verse: VerseText;
  gloriaPatri: boolean;
};

export type CollectProper = {
  text: string;
  ending: string;
};

export type EpistleProper = {
  reference: BiblicalReference;
  incipit?: string;
  text: string;
};

export type GradualProper = {
  response: string;
  verse: VerseText;
};

export type AlleluiaProper = {
  alleluia: string;
  verse: VerseText;
};

export type TractProper = {
  verses: string[];
};

export type GospelProper = {
  reference: BiblicalReference;
  incipit?: string;
  text: string;
};

export type OffertoryProper = {
  antiphon: VerseText;
  verse?: VerseText;
};

export type SecretProper = {
  text: string;
  ending: string;
};

export type CommunionProper = {
  antiphon: VerseText;
  verse?: VerseText;
};

export type PostcommunionProper = {
  text: string;
  ending: string;
};

export type MassProper = {
  introit?: IntroitProper;
  collect?: CollectProper;
  epistle?: EpistleProper;
  gradual?: GradualProper;
  alleluia?: AlleluiaProper;
  tract?: TractProper;
  gospel?: GospelProper;
  offertory?: OffertoryProper;
  secret?: SecretProper;
  communion?: CommunionProper;
  postcommunion?: PostcommunionProper;
};

export type Calendar = Record<
  number,
  Record<number, LiturgicalDay | undefined> | undefined
>;

export type CalendarData = {
  "valid-types"?: string[];
  "valid-liturgical-classes"?: number[];
  "valid-commemoration-types"?: string[];

  title?: string;
  type?: string;
  "liturgical-class"?: number;
  "commemoration-type"?: string;

  "accept-commemoration-types"?: string[];

  occurence?: Occurence;

  calendar?: Record<DateString, string[] | string | undefined>;
  slot?: string;
  "slot-name"?: string;

  items?: CalendarData[];
};
