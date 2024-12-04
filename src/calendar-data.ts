import { Saint } from "./load-saints";

export type CalendarData = ClassData[];
export type ClassData = DataItem[];

export type Day =
  | "dominica"
  | "feriaII"
  | "feriaIII"
  | "feriaIV"
  | "feriaV"
  | "feriaVI"
  | "sabbato";
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
  | { type: "feria" | "octava" | "quartertemper"; occurence: Occurence }
  | {
      type: LiturgicalDay["type"];
      occurence:
        | Propers
        | RelativeDate
        | { type: "saints"; date: RelativeDate };
    }
  | (Omit<LiturgicalDay_, "title"> & {
      prefix: string;
      suffix: string;
      occurence: Occurence;
    })
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
  title_?: string; // nl_NL
  subtitle?: string;
  type: "dominica" | "feria" | "vigilia" | "festum" | "octava";
  isPrivileged?: boolean;
  class: 1 | 2 | 3 | 4;
}

// in accordance with the 1960 general rubrics XI:91
export const calendarData: CalendarData = [
  // 4th class
  [
    // 91.27
    {
      title: "S. Maria in sabbato",
      title_: "Onze Lieve Vrouw op zaterdag",
      type: "feria",
      occurence: "sabbato",
    },
  ],
  // 3rd class
  [
    // 91.26
    { type: "vigilia", occurence: "saints" },
    // 91.25
    {
      type: "feria",
      occurence: { start: "advent", end: "12-16" },
    },
    // 91.24
    { type: "festum", occurence: "saints" },
    // 91.23
    { type: "festum", occurence: "propers3rd" },
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
    { type: "vigilia", occurence: "saints" },
    {
      title: "In vigilia Ascensionis",
      title_: "Vigilie van Hemelvaart",
      type: "vigilia",
      occurence: easter(38),
    },
    // 91.20
    { type: "festum", occurence: "indults2nd" },
    // 91.19
    { type: "festum", occurence: "propers2nd" },
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
      type: "octava",
      occurence: { start: "12-26", end: "12-31" },
    },
    {
      title: "Dominica infra octavam Nativitatis Domini",
      title_: "Zondag onder het octaaf van Kerstmis",
      type: "dominica",
      occurence: { start: "12-26", end: "12-31" },
    },
    // 91.16
    { type: "festum", occurence: "saints" },
    // 91.15
    sundays("post Epiphaniam", "na Driekoningen", "01-07", easter(-70)),
    sunday("Dominica in Septuagesima", "Zondag Septuagesima", easter(-63)),
    sunday("Dominica in Sexagesima", "Zondag Sexagesima", easter(-56)),
    sunday("Dominica in Quinquagesima", "Zondag Quinquagesima", easter(-49)),
    sundays("post Pascha", "na Pasen", easter(7), easter(35)),
    sunday(
      "Dominica II post Pascha",
      "Tweede zondag na Pasen, Zondag Goede herder",
      easter(14)
    ),
    sunday("Dominica post Ascensionem", "Zondag na Hemelvaart", easter(42)),
    sundays("post Pentecosten", "na Pinksteren", easter(56), easter(245)),
    // 91.14
    {
      title: "Ssm̃i Nominis Jesu",
      title_: "Feest van de H. Naam Jezus",
      type: "festum",
      occurence: {
        type: "dominica",
        start: "01-02",
        end: "01-05",
        default: "01-02",
      },
    },
    {
      title: "Dominica I post Epiphaniam, Sanctæ Familiæ Jesu, Mariæ, Joseph",
      title_: "Eerste zondag na Driekoningen, Feest van de H. Familie",
      type: "festum",
      commemorations: [],
      occurence: {
        type: "dominica",
        start: "01-07",
        end: "01-13",
      },
    },
    {
      title: "Dominica II post Pentecosten",
      title_: "Sacramentsdag, Tweede zondag na Pinksteren",
      type: "festum",
      commemorations: [],
      occurence: easter(63),
    },
    { type: "domini", occurence: "saints" },
  ],
  // 1st class
  [
    // 91.13
    { type: "festum", occurence: "indults1st" },
    // 91.12
    { type: "festum", occurence: "propers1st" },
    // 91.11
    { type: "festum", occurence: "saints" },
    // 91.10
    {
      type: "octava",
      occurence: { start: easter(2), end: easter(7) },
    },
    {
      title: "Feria II infra octavam Paschæ",
      title_: "Tweede Paasdag",
      type: "octava",
      occurence: easter(1),
    },
    {
      type: "octava",
      occurence: { start: easter(51), end: easter(56) },
    },
    quartertemper(easter(52)),
    {
      title: "Feria II infra octavam Pentecostes",
      title_: "Tweede Pinksterdag",
      type: "octava",
      occurence: easter(50),
    },
    // 91.9
    {
      title: "Sabbato in vigilia Pentecostes",
      title_: "Vigilie van Pinksteren",
      type: "vigilia",
      occurence: easter(48),
    },
    // 91.8
    {
      type: "feria",
      occurence: {
        type: "!dominica",
        start: "11-02",
        end: "11-03",
      },
    },
    // 91.7
    {
      title: "Feria quarta cinerum",
      title_: "Aswoensdag",
      type: "feria",
      occurence: easter(-46),
    },
    {
      type: "feria",
      occurence: { start: easter(-6), end: easter(-4) },
    },
    // 91.6
    sundays("Adventus", "van de Advent", "11-27", "12-24"),
    sundays("in Quadragesima", "van de Vasten", easter(-42), easter(-21)),
    sunday("Dominica I Passionis", "Passiezondag", easter(-14)),
    sunday("Dominica II Passionis seu in Palmis", "Palmzondag", easter(-7)),
    sunday("Dominica in albis", "Beloken Pasen", easter(7)),
    // 91.5
    { type: "vigilia", occurence: { type: "saints", date: "12-24" } },
    { type: "octava", occurence: { type: "saints", date: "01-01" } },
    // 91.4
    { type: "festum", occurence: { type: "saints", date: "12-08" } },
    { type: "festum", occurence: { type: "saints", date: "08-15" } },
    // 91.3
    { type: "festum", occurence: { type: "saints", date: "01-06" } },
    {
      title: "Hemelvaart",
      type: "festum",
      occurence: easter(39),
    },
    sunday(
      "In festo Sanctissimæ Trinitatis",
      "Feest van de H. Drieëenheid",
      easter(56)
    ),
    {
      title: "In festo Ssm̃i Corporis Christi",
      title_: "Feest van het Allerheiligst Sacrament",
      type: "festum",
      occurence: easter(60),
    },
    {
      title: "In festo Sacratissimi Cordis Jesu",
      title_: "Feest van het Allerheiligst Hart van Jezus",
      type: "festum",
      occurence: easter(68),
    },
    {
      title: "D.N. Jesu Christi Regis",
      title_: "Feest van Christus Koning",
      type: "festum",
      occurence: {
        type: "dominica",
        start: "10-25",
        end: "10-31",
      },
    },
    // 91.2
    {
      title: "Feria V in Cena Domini",
      title_: "Witte Donderdag",
      type: "feria",
      occurence: easter(-3),
    },
    {
      title: "Feria VI in Passione et Morte Domini",
      title_: "Goede Vrijdag",
      type: "feria",
      occurence: easter(-2),
    },
    {
      title: "Sabbato sancto",
      title_: "Paaszaterdag",
      type: "feria",
      occurence: easter(-1),
    },
    // 91.1
    { type: "festum", occurence: { type: "saints", date: "12-25" } },
    {
      title: "Hoogfeest van Pasen",
      type: "festum",
      occurence: "easter",
    },
    {
      title: "Dominica Resurrectionis",
      title_: "Hoogfeest van Pinksteren",
      type: "festum",
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

function sunday(title: string, title_: string, date: RelativeDate): DataItem {
  return {
    title,
    type: "dominica",
    occurence: date,
  };
}

function sundays(
  suffix: string,
  suffix_: string,
  start: RelativeDate,
  end: RelativeDate
): DataItem {
  return {
    type: "dominica",
    prefix: "Dominica",
    suffix,
    occurence: {
      start,
      end,
    },
  };
}
