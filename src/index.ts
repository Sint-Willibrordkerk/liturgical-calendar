import {
  CalendarData,
  Commemoration,
  DataItem,
  DateString,
  LiturgicalDay,
  Occurence,
  OccurenceType,
  Occurence_,
  RelativeDate,
  calendarData,
} from "./calendar-data";
import { Saint, Saints, loadSaints } from "./load-saints";
import ordinals from "./ordinals";

export type Calendar = Record<
  number,
  Record<number, LiturgicalDay & { commemorations: Commemoration[] }>
>;

export default function generateCalendar(year: number, lang: string = 'la_VA'): Calendar {
  return new Calendar_(
    year,
    lang,
    structuredClone(calendarData),
    structuredClone(propers)
  ).calendar;
}

const WEEKDAYS = {
  dominica: 0,
  feriaII: 1,
  feriaIII: 2,
  feriaIV: 3,
  feriaV: 4,
  feriaVI: 5,
  sabbato: 6,
};

type Propers = Record<
  | "propers4th"
  | "propers3rd"
  | "indults2nd"
  | "propers2nd"
  | "indults1st"
  | "propers1st",
  { title: string; subtitle?: string; occurence: `${number}-${number}` }[]
>;

const propers: Propers = {
  propers4th: [
    // {
    //   title: "H. Adelbertus",
    //   subtitle: "Belijder",
    //   occurence: "06-25",
    // },
    // {
    //   title: "Overbrenging der relikwieën van de H. Martinus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "07-04",
    // },
  ],
  propers3rd: [
    // {
    //   title: "H. Radboud",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "11-29",
    // },
    // {
    //   title: "H. Hungerus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "12-22",
    // },
    // {
    //   title: "H. Switbertus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "03-01",
    // },
    // {
    //   title: "H. Albricus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "03-04",
    // },
    // {
    //   title: "H. Gertrudis",
    //   subtitle: "Maagd",
    //   occurence: "03-17",
    // },
    // {
    //   title: "H. Ludgerus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "03-26",
    // },
    // {
    //   title: "H. Lidwina",
    //   subtitle: "Maagd",
    //   occurence: "04-14",
    // },
    // {
    //   title: "H. Egbertus",
    //   subtitle: "Belijder",
    //   occurence: "04-24",
    // },
    // {
    //   title: "H. Aufridus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "05-12",
    // },
    // {
    //   title: "H. Odulfus",
    //   subtitle: "Belijder",
    //   occurence: "06-12",
    // },
    // {
    //   title: "HH. Martelaren van Gorcum",
    //   occurence: "07-09",
    // },
    // {
    //   title: "H. Marcellinus",
    //   subtitle: "Belijder",
    //   occurence: "07-14",
    // },
    // {
    //   title: "H. Plechelmus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "07-15",
    // },
    // {
    //   title: "H. Fredericus",
    //   subtitle: "Bisschop en Martelaar",
    //   occurence: "07-18",
    // },
    // {
    //   title: "H. Bernulfus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "07-19",
    // },
    // {
    //   title: "H. Werenfridus",
    //   subtitle: "Belijder",
    //   occurence: "08-18",
    // },
    // {
    //   title: "H. Gregorius",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "08-25",
    // },
    // {
    //   title: "H. Wilfridus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "10-12",
    // },
  ],
  indults2nd: [],
  propers2nd: [
    // {
    //   title: "HH. Bonifatius, Bisschop, en gezellen",
    //   subtitle: "Martelaren",
    //   occurence: "06-05",
    // },
  ],
  indults1st: [],
  propers1st: [
    // {
    //   title: "Wijding der metropolitaankerk",
    //   occurence: "08-23",
    // },
    // {
    //   title: "H. Willibrordus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "11-07",
    // },
    // {
    //   title: "H. Martinus",
    //   subtitle: "Bisschop en Belijder",
    //   occurence: "11-11",
    // },
    // {
    //   title: "H. Lebuinus",
    //   subtitle: "Belijder",
    //   occurence: "11-12",
    // },
  ],
};

class Calendar_ {
  private year: number;
  private lang: string;
  private propers: Propers;
  private saints: Saints;
  private advent: Date;
  private easter: Date;
  public calendar: Calendar = {};

  constructor(
    year: number,
    lang: string,
    data: CalendarData,
    propers: Propers
  ) {
    this.year = year;
    this.lang = lang;
    this.propers = propers;
    this.saints = loadSaints(lang);
    this.calculateAdvent();
    this.calculateEaster();
    this.initCalendar();
    this.addCommemorations();
    this.fillCalendar(data);
    this.cleanCalendar();
  }

  private calculateAdvent() {
    this.advent = new Date(Date.UTC(this.year, 11, 3));
    this.advent.setDate(this.advent.getDate() - this.advent.getDay());
  }

  private calculateEaster() {
    const a = this.year % 19,
      k = Math.floor(this.year / 100),
      p = Math.floor((13 + 8 * k) / 25),
      q = Math.floor(k / 4),
      m = (15 - p + k - q) % 30,
      d = (19 * a + m) % 30;
    this.easter = new Date(Date.UTC(this.year, 2, 21 + d + 6));
    this.easter.setDate(this.easter.getDate() - this.easter.getDay());
  }

  private initCalendar() {
    for (let i = 0; i < 12; i++) this.calendar[i] = {};
    const date = new Date(this.year, 0, 1);
    const end = new Date(this.year + 1, 0, 0);
    while (date.getTime() <= end.getTime()) {
      this.calendar[date.getMonth()][date.getDate()] = {
        title: "Feria",
        type: "feria",
        class: 4,
        commemorations: [],
      };
      date.setDate(date.getDate() + 1);
    }

    for (let i = 0; i < this.propers["propers4th"].length; i++) {
      const proper = this.propers["propers4th"][i];
      const date = this.getDate(proper.occurence);

      this.calendar[date.getMonth()][date.getDate()].commemorations.push({
        title: proper.title,
        subtitle: proper.subtitle,
        type: "festum",
        class: 4,
      });
    }
  }

  private addCommemorations() {
    this.eachSaint((saint, month, day) => {
      if (saint.class == 4)
        this.calendar[month][day].commemorations.push(saint as Commemoration);
    });
  }

  private fillCalendar(data: CalendarData) {
    data.forEach((classData, i) => {
      const class_ = (4 - i) as 1 | 2 | 3 | 4;
      classData.forEach((dataItem) => {
        const occurence = this.getOccurence(dataItem.occurence);
        let prefix, suffix: string;
        if ("prefix" in dataItem && "suffix" in dataItem) {
          prefix = dataItem.prefix;
          suffix = dataItem.suffix;
        }

        this.fillDataItem(dataItem, occurence, prefix, suffix, class_);
      });
    });
  }

  private fillDataItem(
    dataItem: DataItem,
    occurence: Occurence_,
    prefix: string,
    suffix: string,
    class_: 1 | 2 | 3 | 4
  ) {
    if (occurence.date)
      this.fillDate(
        this.getDate(occurence.date),
        occurence.type,
        dataItem,
        class_
      );
    else if (occurence.type == "saints")
      this.fillSaints(dataItem.type as Saint["type"], class_);
    else if (
      typeof occurence.type === "string" &&
      this.propers[occurence.type]
    ) {
      for (let i = 0; i < this.propers[occurence.type].length; i++) {
        const proper = this.propers[occurence.type][i];
        const date = this.getDate(proper.occurence);
        delete proper.occurence;
        this.set(date, {
          ...proper,
          type: "festum",
          class: class_,
        });
      }
    } else {
      const start = this.getDate(
        occurence.start,
        new Date(Date.UTC(this.year, 0, 1))
      );
      const end = this.getDate(
        occurence.end,
        new Date(Date.UTC(this.year + 1, 0, 0))
      );
      if (occurence.type == "ember") {
        start.setDate(
          // find next Wednesday
          start.getDate() - start.getDay() + (start.getDay() > 3 ? 10 : 3)
        );
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 3);
      }

      this.fillDates(
        start,
        end,
        occurence.default,
        occurence.type,
        prefix,
        suffix,
        dataItem,
        class_
      );
    }
  }

  private fillDate(
    date: Date,
    type: OccurenceType,
    dataItem: DataItem,
    class_: 1 | 2 | 3 | 4
  ) {
    if ("title" in dataItem && this.lang === "nl_NL" && "title_" in dataItem) {
      dataItem.title = dataItem.title_;
    }
    if (type == "saints") {
      const saint = this.saints[date.getMonth() + 1][date.getDate()][0];
      this.set(date, {
        ...saint,
        ...dataItem,
        type: dataItem.type as LiturgicalDay["type"],
        class: class_,
      });
    } else if ("title" in dataItem)
      this.set(date, {
        ...dataItem,
        class: class_,
      });
    else this.invalidData(dataItem, class_, type);
  }

  private fillSaints(type: Saint["type"], class_: 1 | 2 | 3 | 4) {
    this.eachSaint((saint, month, day) => {
      if (saint.class == class_ && saint.type === type)
        this.set_(month, day, {
          ...saint,
          type:
            saint.type === "domini"
              ? "festum"
              : (saint.type as LiturgicalDay["type"]),
        });
    });
  }

  private fillDates(
    date: Date,
    end: Date,
    default_: RelativeDate,
    type: OccurenceType,
    prefix: string,
    suffix: string,
    dataItem: DataItem,
    class_: 1 | 2 | 3 | 4
  ) {
    if ("title" in dataItem && this.lang === "nl_NL" && "title_" in dataItem) {
      dataItem.title = dataItem.title_;
    }
    let i = 0;
    while (date.getTime() <= end.getTime()) {
      if (
        (type != "ember" || date.getDay() != 4) &&
        (typeof type !== "string" ||
          WEEKDAYS[type] === undefined ||
          WEEKDAYS[type] === date.getDay()) &&
        (dataItem.type !== "dominica" || date.getDay() === 0)
      ) {
        this.set(date, {
          title: suffix ? `${prefix} ${ordinals[i + 1]} ${suffix}` : undefined,
          ...structuredClone(dataItem),
          type: dataItem.type as LiturgicalDay["type"],
          class: class_,
        });
        i++;
      }
      date.setDate(date.getDate() + 1);
    }
    if (i == 0) {
      if (default_ && "title" in dataItem)
        this.set(this.getDate(default_), {
          ...dataItem,
          class: class_,
          title: dataItem.title,
          type: dataItem.type as LiturgicalDay["type"],
        });
      else this.invalidData(dataItem, class_, type);
    }
  }

  private cleanCalendar() {
    this.eachDay((day) => {
      day.commemorations = day.commemorations.sort(
        (day1, day2) =>
          day1.class - day2.class + +(!!day2.isPrivileged && !day1.isPrivileged)
      );
      if (day.class == 1)
        day.commemorations = day.commemorations.filter(
          (item) => item.isPrivileged
        );
      if (day.class <= 2) day.commemorations = day.commemorations.slice(0, 1);
      if (day.type == "dominica")
        day.commemorations = day.commemorations.filter(
          (item) =>
            item.type != "feria" &&
            item.type != "dominica" &&
            (item.isPrivileged || (item.class <= 2 && item.type != "octava"))
        );
      if (day.type == "feria")
        day.commemorations = day.commemorations.filter(
          (item) => item.type != "feria"
        );
      if (day.commemorations.length == 0) delete day.commemorations;
    });
  }

  private getOccurence(occurence: Occurence): Occurence_ {
    let newOccurence: Occurence_ = {};
    if (typeof occurence == "string") {
      if (isDateString(occurence)) newOccurence.date = occurence;
      else newOccurence.type = occurence;
    } else if ("difference" in occurence) newOccurence.date = occurence;
    else newOccurence = occurence;
    return newOccurence;
  }

  private eachSaint(
    process: (saint: Saint, month: number, day: number) => void
  ) {
    for (let i = 1; i <= 12; i++)
      Object.entries(this.saints[i]).forEach(([day, value]) => {
        value.forEach((value) => process(value, i - 1, Number.parseInt(day)));
      });
  }

  private eachDay(process: (day: LiturgicalDay) => void) {
    Object.values(this.calendar).forEach((month) =>
      Object.values(month).forEach((day) => process(day))
    );
  }

  private set_(month: number, date: number, value: LiturgicalDay) {
    const old = this.calendar[month][date];
    const override = !!value.commemorations;
    if (!override) value.commemorations = old.commemorations;
    delete old.commemorations;

    if (old.class == 1 && old.type == "festum") {
      const date_ = new Date(Date.UTC(this.year, month, date));
      while (this.calendar[date_.getMonth()][date_.getDate()].class <= 2)
        date_.setDate(date_.getDate() + 1);
      this.set(date_, old);
    } else if (old.class < 4 && !override) {
      value.commemorations.push(old);
    }

    this.calendar[month][date] = value as Required<LiturgicalDay>;
  }

  private set(date: Date, value: LiturgicalDay) {
    this.set_(date.getMonth(), date.getDate(), value);
  }

  private getDate(input: RelativeDate, default_: Date = undefined) {
    if (!input) return default_;
    if (typeof input == "string") return this.matchDateString(input);
    else {
      const date = this.matchDateString(input.date);
      date.setDate(date.getDate() + input.difference);
      return date;
    }
  }

  private matchDateString(date: string) {
    switch (date) {
      case "advent":
        return new Date(this.advent);
      case "easter":
        return new Date(this.easter);
      default:
        return new Date(`${this.year}-${date}`);
    }
  }

  private invalidData(
    dataItem: DataItem,
    class_: number,
    occurence: Occurence
  ) {
    throw Error(
      `invalid data: ${JSON.stringify(
        dataItem
      )}, class: ${class_}, occurence: ${JSON.stringify(occurence)}`
    );
  }
}

function isDateString(
  occurence: string
): occurence is DateString & `${number}-${number}` {
  return (
    occurence.includes("-") || occurence === "easter" || occurence === "advent"
  );
}
