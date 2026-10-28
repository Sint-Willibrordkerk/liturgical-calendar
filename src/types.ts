import { weekdays, namedDates, colors, seasons } from "./constants";

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LiturgicalClass = 1 | 2 | 3 | 4;

export type DateString = `${0 | 1 | 2 | 3}${Digit}-${0 | 1}${Digit}`;
export type NamedDate = (typeof namedDates)[number];
export type RelativeDate = {
  date: NamedDate;
  difference: number;
};
export type LiturgicalDate = DateString | NamedDate | RelativeDate;

/** A color of the vestments: `white`, `red`, `green`, `violet`, `rose` or `black`. */
export type Color = (typeof colors)[number];
/** A season of the year, as the rubrics name it: `adventus`, `paschatis`, … */
export type Season = (typeof seasons)[number];


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

/**
 * Which fields of the object that holds it are said in a language other than
 * the one asked for, each by the code of the language it is said in:
 * `{ oratio: "la" }`. It appears only where something is: an object said wholly
 * in the language asked for carries none.
 *
 * Several languages may be passed, the first being the one asked for; the rest
 * say what it has no words for.
 */
export type Fallback = Record<string, string>;

export type RawMassProper = {
  /** The formal designation, from the source's officium. */
  title?: string;
  /** The short name of the celebration. */
  name?: string;
  /** The sections said in another language than the one asked for. */
  fallback?: Fallback;
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

/**
 * Where a day's Mass is read from, and how: the same in every language. The
 * days are settled from these alone, and the propers read through them after.
 */
export type ProperReference = {
  /** The title the propers are filed under. */
  title: string;
  /** The local calendars searched before the general ones, most particular first. */
  local?: string[];
  /** The date whose season decides what is sung; the day's own where absent. */
  season?: Date;
  /** A variant of the file read beside the rubric in force. */
  variant?: string;
  /**
   * The Preface said in place of the Mass's own: always, or only where the
   * Mass names one.
   */
  prefatio?: { name: string; always: boolean };
  /** Borrowed from another day: the Mass is said, but not that day's Office. */
  borrowed?: true;
};

export type Commemoration = {
  title?: string;
  type?: string;
  liturgicalClass: number;
  commemorationType?: string;
  acceptCommemorationTypes?: string[];
  /** Where the Mass is read from. Gone once it is read. */
  proper?: ProperReference;
  /**
   * The title as the calendar writes it, `$count` and `$day` still to fill,
   * and the count to fill them with: named in the language once the Mass is
   * read. Absent where the day is named for good. Gone once it is named.
   */
  naming?: { template: string; count: number };
  mass?: MassProper | MassProper[] | RawMassProper;
  /**
   * The propers of the Office, Hour by Hour. Present only when asked for, and
   * only on the celebration kept, where the language says something of its
   * Office: a commemoration carries none.
   */
  officium?: Officium;
};

export type LiturgicalDay = Commemoration & {
  commemorations: Commemoration[];
  /** The season the day falls in. */
  season: Season;
  /**
   * The color of the Mass said. A commemoration carries none: it is a collect
   * added to the day's Mass, not a Mass of its own.
   */
  color: Color;
  /**
   * A color that may be worn in place of `color`: rose on Gaudete and Laetare
   * Sunday. Absent on every other day.
   */
  alternativeColor?: Color;
  /**
   * The season, the color and the alternative color as the language names
   * them — "Advent", "paars". Present only where a language supplies them; the
   * identifiers above are what to compare against.
   */
  seasonName?: string;
  colorName?: string;
  alternativeColorName?: string;
  /**
   * The Martyrology printed under the day's date — read at Prime on the day
   * before it. Present only when asked for, and only in a language that has a
   * Martyrology.
   */
  martyrologium?: Martyrologium;
};

/** An antiphon. Its `*` marks where the choir takes up the intonation. */
export type Antiphona = { text: string };

/** A versicle and its response. */
export type Versus = { versus: string; responsum: string };

/**
 * What stands where a versicle is said. Usually the versicle; during the Easter
 * octave an antiphon (*Hæc dies*) takes its place. Tell them apart by `text`.
 */
export type VersusVelAntiphona = Versus | Antiphona;

/**
 * The antiphons of an Hour's psalms, in order. An antiphon names the psalm it
 * is said with; an entry with a psalm and no text is said under the antiphon
 * before it. At Matins a nocturn's versicle may stand among them.
 */
export type Psalmodia = {
  antiphonae: ({ text?: string; psalmus?: string } | Versus)[];
};

/** A hymn: its stanzas, and the doxology that closes it. */
export type Hymnus = { strophae: string[][]; doxologia?: string[] };

/** A chapter, or the short lesson of Prime. */
export type Capitulum = { ref?: string; text: string };

/**
 * A responsory: the response, its versicle, the part of the response repeated
 * after the versicle, and what is repeated after the *Glória Patri*, where it
 * is said. In the Office of the Dead the *Réquiem* stands in the *Glória Patri*'s
 * place, and `gloria` follows it.
 */
export type Responsorium = {
  responsum: string;
  versus: string;
  repetitio?: string;
  gloria?: string;
};

/** A homily: its author and its text, and the Gospel it expounds. */
export type Homilia = { ref?: string; text: string; evangelium: RawReading };

/** A lesson of Matins, numbered as it is read, with the responsory after it. */
export type LectioMatutini = {
  numerus: number;
  lectio: RawReading | Homilia;
  responsorium?: Responsorium;
  fallback?: Fallback;
};

export type Nocturnus = {
  versus?: Versus;
  lectiones: LectioMatutini[];
  fallback?: Fallback;
};

/** A small Hour: Terce, Sext or None. */
export type HoraMinor = {
  capitulum?: Capitulum;
  responsorium?: Responsorium;
  versus?: VersusVelAntiphona;
  fallback?: Fallback;
};

export type Vesperae = {
  psalmodia?: Psalmodia;
  capitulum?: Capitulum;
  hymnus?: Hymnus;
  versus?: VersusVelAntiphona;
  magnificat?: Antiphona;
  fallback?: Fallback;
};

/**
 * The propers of the Office of a day: what it says at each Hour of its own, or
 * takes from its common. An Hour, or a part of one, the day says nothing of is
 * absent, and is said from the psalter. First Vespers are said on the evening
 * before.
 */
export type Officium = {
  primaeVesperae?: Vesperae;
  matutinum?: {
    invitatorium?: Antiphona;
    hymnus?: Hymnus;
    psalmodia?: Psalmodia;
    nocturni?: Nocturnus[];
    /** The saint's legend in one lesson, read as the last on a lesser day. */
    legenda?: RawReading;
    fallback?: Fallback;
  };
  laudes?: {
    psalmodia?: Psalmodia;
    capitulum?: Capitulum;
    hymnus?: Hymnus;
    versus?: VersusVelAntiphona;
    benedictus?: Antiphona;
    fallback?: Fallback;
  };
  prima?: { lectioBrevis?: Capitulum; fallback?: Fallback };
  tertia?: HoraMinor;
  sexta?: HoraMinor;
  nona?: HoraMinor;
  vesperae?: Vesperae;
  /** The collect, said at every Hour after Prime, and at Mass. */
  oratio?: { text?: string; closure?: string };
  /** The collect, where it is said in another language than the one asked for. */
  fallback?: Fallback;
};

/**
 * A day's reading of the Roman Martyrology, in the order it is read: the date
 * and the moon, the announcement of a movable day, the entries, the
 * conclusion.
 */
export type Martyrologium = {
  /** The date in the Roman reckoning: "Duodécimo Kaléndas Februárii". */
  titulus: string;
  /** The age of the moon, 1–30, as the Martyrology's tables reckon it. */
  luna?: number;
  /** The age of the moon as the language says it: "Luna secúnda". */
  lunaName?: string;
  /** The announcement of the movable day it is, read before the entries. */
  mobile?: string[];
  /** The entries — the elogia of the saints — in the order they are read. */
  elogia: string[];
  /** The versicle that closes every reading, and its response. */
  conclusio?: { versus: string; responsum: string };
  /** The parts said in another language than the one asked for. */
  fallback?: Fallback;
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

/**
 * A day of a `calendar` map: its title, or the title with the color its Mass
 * wears where that is not the default.
 */
export type CalendarEntry = string | { title: string; color?: string };

export type CalendarData = {
  "valid-types"?: string[];
  "valid-liturgical-classes"?: number[];
  "valid-commemoration-types"?: string[];
  "valid-colors"?: string[];

  /**
   * A local proper's: the local calendars of the sources its days are read
   * from, by their path below the day tree, the most particular first.
   */
  "local-calendars"?: string[];

  title?: string;
  type?: string;
  "liturgical-class"?: number;
  "commemoration-type"?: string;
  color?: string;

  "accept-commemoration-types"?: string[];

  occurence?: Occurence;

  calendar?: Record<DateString, CalendarEntry[] | CalendarEntry | undefined>;
  slot?: string;
  "slot-name"?: string;

  items?: CalendarData[];
};
