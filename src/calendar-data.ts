import { Saint } from "./load-saints";

export type CalendarData = ClassData[];
export type ClassData = DataItem[];

export type Day =
  | "zondag"
  | "maandag"
  | "dinsdag"
  | "woensdag"
  | "donderdag"
  | "vrijdag"
  | "zaterdag";
export type DateString = "advent" | "easter";
export type Propers =
  | "propers3rd"
  | "indults2nd"
  | "propers2nd"
  | "indults1st"
  | "propers1st";
export type LiturgicalDay_ = Omit<LiturgicalDay, "class">;

export type DataItem = (
  | (LiturgicalDay_ & { occurence: Occurence })
  | { type: Saint["type"]; occurence: "saints" }
  | { type: "feria" | "octaaf" | "quartertemper"; occurence: Occurence }
  | {
      type: LiturgicalDay["type"];
      occurence:
        | Propers
        | RelativeDate
        | { type: "saints"; date: RelativeDate };
    }
  | (Omit<LiturgicalDay_, "title"> & { suffix: string; occurence: Occurence })
) & {
  isPrivileged?: boolean;
};

export type Occurence = Occurence_ | OccurenceType;

export type Occurence_ = {
  date?: RelativeDate;
  type?: OccurenceType;
  start?: RelativeDate;
  end?: RelativeDate;
  default?: RelativeDate;
};
export type OccurenceType =
  | Propers
  | "saints"
  | "ember"
  | Day
  | `!${Day}`
  | RelativeDate;
export type RelativeDate =
  | DateString
  | `${number}-${number}`
  | { date: string; difference: number };

export type LiturgicalDay = Commemoration & {
  commemorations?: Commemoration[];
};

export interface Commemoration {
  title: string;
  subtitle?: string;
  type: "zondag" | "feria" | "vigilie" | "feest" | "octaaf";
  isPrivileged?: boolean;
  class: 1 | 2 | 3 | 4;
}

// in accordance with general rubrics 1960 XI:91
export const calendarData: CalendarData = [
  // 4th class
  [
    // 91.27
    {
      title: "Onze Lieve Vrouw op zaterdag",
      type: "feria",
      occurence: "zaterdag",
    },
  ],
  // 3rd class
  [
    // 91.26
    { type: "vigilie", occurence: "saints" },
    // 91.25
    {
      type: "feria",
      occurence: { start: "advent", end: "12-16" },
    },
    // 91.24
    { type: "feest", occurence: "saints" },
    // 91.23
    { type: "feest", occurence: "propers3rd" },
    // 91.22
    {
      type: "feria",
      isPrivileged: true,
      occurence: { start: easter(-46), end: "easter" },
    },
  ],
  // 2nd class
  [
    // 91.21
    { type: "vigilie", occurence: "saints" },
    {
      title: "Vigilie van Hemelvaart",
      type: "vigilie",
      occurence: easter(38),
    },
    // 91.20
    { type: "feest", occurence: "indults2nd" },
    // 91.19
    { type: "feest", occurence: "propers2nd" },
    // 91.18
    {
      type: "feria",
      occurence: { start: "12-17", end: "12-23" },
    },
    quartertemper("12-15"),
    quartertemper(easter(-39)),
    quartertemper("09-18"),
    // 91.17
    {
      type: "octaaf",
      occurence: { start: "12-26", end: "12-31" },
    },
    {
      title: "Zondag onder het octaaf van Kerstmis",
      type: "zondag",
      occurence: { start: "12-26", end: "12-31" },
    },
    // 91.16
    { type: "feest", occurence: "saints" },
    // 91.15
    sundays("na Driekoningen", "01-07", easter(-70)),
    sunday("Zondag Septuagesima", easter(-63)),
    sunday("Zondag Sexagesima", easter(-56)),
    sunday("Zondag Quinquagesima", easter(-49)),
    sundays("na Pasen", easter(7), easter(35)),
    sunday("Tweede zondag na Pasen, Zondag Goede herder", easter(14)),
    sunday("Zondag na Hemelvaart", easter(42)),
    sundays("na Pinksteren", easter(56), easter(245)),
    // 91.14
    {
      title: "Feest van de H. Naam Jezus",
      type: "feest",
      occurence: {
        type: "zondag",
        start: "01-02",
        end: "01-05",
        default: "01-02",
      },
    },
    {
      title: "Eerste zondag na Driekoningen, Feest van de H. Familie",
      type: "feest",
      commemorations: [],
      occurence: {
        type: "zondag",
        start: "01-07",
        end: "01-13",
      },
    },
    {
      title: "Sacramentsdag, Tweede zondag na Driekoningen",
      type: "feest",
      commemorations: [],
      occurence: easter(63),
    },
    { type: "lord", occurence: "saints" },
  ],
  // 1st class
  [
    // 91.13
    { type: "feest", occurence: "indults1st" },
    // 91.12
    { type: "feest", occurence: "propers1st" },
    // 91.11
    { type: "feest", occurence: "saints" },
    // 91.10
    {
      type: "octaaf",
      occurence: { start: easter(2), end: easter(7) },
    },
    {
      title: "Tweede Paasdag",
      type: "octaaf",
      occurence: easter(1),
    },
    {
      type: "octaaf",
      occurence: { start: easter(51), end: easter(56) },
    },
    quartertemper(easter(52)),
    {
      title: "Tweede Pinksterdag",
      type: "octaaf",
      occurence: easter(50),
    },
    // 91.9
    {
      title: "Vigilie van Pinksteren",
      type: "vigilie",
      occurence: easter(48),
    },
    // 91.8
    {
      type: "feria",
      occurence: {
        type: "!zondag",
        start: "11-02",
        end: "11-03",
      },
    },
    // 91.7
    {
      title: "Aswoensdag",
      type: "feria",
      occurence: easter(-46),
    },
    {
      type: "feria",
      occurence: { start: easter(-6), end: easter(-4) },
    },
    // 91.6
    sundays("van de Advent", "11-27", "12-24"),
    sundays("van de Vasten", easter(-42), easter(-21)),
    sunday("Passiezondag", easter(-14)),
    sunday("Palmzondag", easter(-7)),
    sunday("Beloken Pasen", easter(7)),
    // 91.5
    { type: "vigilie", occurence: { type: "saints", date: "12-24" } },
    { type: "octaaf", occurence: { type: "saints", date: "01-01" } },
    // 91.4
    { type: "feest", occurence: { type: "saints", date: "12-08" } },
    { type: "feest", occurence: { type: "saints", date: "08-15" } },
    // 91.3
    { type: "feest", occurence: { type: "saints", date: "01-06" } },
    {
      title: "Hemelvaart",
      type: "feest",
      occurence: easter(39),
    },
    sunday("Feest van de H. Drieëenheid", easter(56)),
    {
      title: "Feest van het Allerheiligst Sacrament",
      type: "feest",
      occurence: easter(60),
    },
    {
      title: "Feest van het Allerheiligst Hart van Jezus",
      type: "feest",
      occurence: easter(68),
    },
    {
      title: "Feest van Christus Koning",
      type: "feest",
      occurence: {
        type: "zondag",
        start: "10-25",
        end: "10-31",
      },
    },
    // 91.2
    {
      title: "Witte Donderdag",
      type: "feria",
      occurence: easter(-3),
    },
    {
      title: "Goede Vrijdag",
      type: "feria",
      occurence: easter(-2),
    },
    {
      title: "Paaszaterdag",
      type: "feria",
      occurence: easter(-1),
    },
    // 91.1
    { type: "feest", occurence: { type: "saints", date: "12-25" } },
    {
      title: "Hoogfeest van Pasen",
      type: "feest",
      occurence: "easter",
    },
    {
      title: "Hoogfeest van Pinksteren",
      type: "feest",
      occurence: easter(49),
    },
  ],
];

function easter(difference: number): RelativeDate {
  return { date: "easter", difference };
}

function quartertemper(start: RelativeDate): DataItem {
  return {
    type: "quartertemper",
    occurence: { type: "ember", start },
  };
}

function sunday(title: string, date: RelativeDate): DataItem {
  return {
    title,
    type: "zondag",
    occurence: date,
  };
}

function sundays(
  suffix: string,
  start: RelativeDate,
  end: RelativeDate
): DataItem {
  return {
    type: "zondag",
    suffix: `zondag ${suffix}`,
    occurence: {
      start,
      end,
    },
  };
}
