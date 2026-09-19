import { weekdays, namedDates } from "./constants";

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LiturgicalClass = 1 | 2 | 3 | 4;

export type DateString = `${0 | 1 | 2 | 3}${Digit}-${0 | 1}${Digit}`;
export type NamedDate = (typeof namedDates)[number];
export type RelativeDate = {
  date: NamedDate;
  difference: number;
};
export type LiturgicalDate = DateString | NamedDate | RelativeDate;


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

/** An antiphon or verse: a reference and its text. */
export type RawVerse = { ref?: string; text?: string };

/**
 * A reading. A biblical one carries `verses`, one per verse; anything else
 * carries `text`. A reading the pipeline could not structure carries its lines.
 */
export type RawReading =
  | { ref?: string; verses: string[] }
  | { ref?: string; text: string }
  | string[];

export type RawMassProper = {
  /** The formal designation, from the source's officium. */
  title?: string;
  /** The short name of the celebration. */
  name?: string;
  prefatio?: string;
  introitus?: { antiphon?: RawVerse; verse?: RawVerse };
  oratio?: { text?: string; closure?: string };
  lectio?: RawReading;
  graduale?: { antiphon?: RawVerse; verse?: RawVerse };
  /** The Alleluia sung after the Gradual. */
  alleluia?: RawVerse;
  /**
   * The extended Alleluia that replaces the Gradual in paschaltide — the source
   * calls it a `gradualep`, but it is an Alleluia, and so a list of verses.
   */
  alleluiap?: { verses: RawVerse[] };
  /** A tract is a series of verses, not an antiphon and a verse. */
  tractus?: { verses: RawVerse[] };
  evangelium?: RawReading;
  "ultima-evangelium"?: RawReading;
  offertorium?: RawVerse;
  secreta?: { text?: string; closure?: string };
  communio?: RawVerse;
  postcommunio?: { text?: string; closure?: string };
};

export type Commemoration = {
  title?: string;
  type?: string;
  liturgicalClass: number;
  commemorationType?: string;
  acceptCommemorationTypes?: string[];
  mass?: MassProper | MassProper[] | RawMassProper;
};

export type LiturgicalDay = Commemoration & {
  commemorations: Commemoration[];
};

// Mass Proper Types

export type VerseText = {
  references?: string | string[]; // Single reference or array of references (e.g., "Ps 90:1" or ["Ps 90:15-16", "Ps 90:1"])
  text: string;
};

export type IntroitProper = {
  antiphon: VerseText;
  verse: VerseText;
};

export type CollectProper = {
  text: string;
  ending: string;
};

export type EpistleProper = VerseText;

export type GradualProper = {
  antiphon: VerseText;
  verse: VerseText;
};

export type AlleluiaProper = VerseText;

export type TractProper = {
  verses: string[];
};

export type GospelProper = VerseText;

export type OffertoryProper = VerseText;

export type SecretProper = {
  text: string;
  ending: string;
};

export type CommunionProper = VerseText;

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

// Votive Masses

/** What a votive Mass is of (§307). */
export type VotiveCategory =
  | "mysteries-of-the-lord"
  | "blessed-virgin-mary"
  | "angels";

/** A votive Mass named by its Latin slug — a key into the catalog. */
export type VotiveMassId = string;

/**
 * Where the rubrics fix a recurring day: the first such weekday, or every one.
 * The weekday is a number (Sunday 0 … Saturday 6); `votive.yml` names it, and
 * the loader resolves the name to this number.
 */
export type VotiveOccurrence = { cadence: "monthly" | "weekly"; weekday: number };

/** One votive Mass, as read from `votive.yml` and keyed by its id. */
export type VotiveMass = {
  id: VotiveMassId;
  category: VotiveCategory;
  liturgicalClass: 3 | 4;
  rubric: string;
  /** The propers' lookup slug, where a proper is filed for it. */
  slug?: string;
  /** Present only where the rubrics fix a day; absent votives are not placed. */
  occurrence?: VotiveOccurrence;
};

/** The whole catalog, keyed by id. */
export type VotiveCatalog = Record<VotiveMassId, VotiveMass>;

/** The raw shape of `votive.yml`, before it is keyed into a catalog. */
export type VotiveData = {
  "valid-categories"?: string[];
  "valid-liturgical-classes"?: number[];
  items: Record<
    string,
    {
      category: VotiveCategory;
      "liturgical-class": 3 | 4;
      rubric: string;
      slug?: string;
      occurrence?: { cadence: "monthly" | "weekly"; weekday: Weekday };
    }
  >;
};
