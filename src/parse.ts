import { Calendar, Commemoration, LiturgicalDay } from "./types";

export class CalendarBuilder {
  public result: Calendar = {};

  public add(
    month: number,
    day: number,
    liturgicalDayProp: Omit<LiturgicalDay, "commemorations">
  ) {
    const liturgicalDay = {
      title: liturgicalDayProp.title,
      type: liturgicalDayProp.type,
      liturgicalClass: liturgicalDayProp.liturgicalClass,
      commemorationType: liturgicalDayProp.commemorationType,
      acceptCommemorationTypes: liturgicalDayProp.acceptCommemorationTypes,
    };
    this.result[month] ??= {};

    if (!this.result[month][day]) {
      this.result[month][day] = { commemorations: [], ...liturgicalDay };
    } else {
      this.result[month][day] = {
        ...liturgicalDay,
        commemorations: [
          {
            ...this.result[month][day],
            commemorations: undefined,
          } as Commemoration,
          ...this.result[month][day]!.commemorations,
        ],
      };
    }
  }
}
