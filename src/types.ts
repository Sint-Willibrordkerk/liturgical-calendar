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
};

export type LiturgicalDay = Commemoration & {
  commemorations: Commemoration[];
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
