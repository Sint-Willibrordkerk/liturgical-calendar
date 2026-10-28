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
      color: liturgicalDayProp.color,
      mass: liturgicalDayProp.mass,
      officium: liturgicalDayProp.officium,
      proper: liturgicalDayProp.proper,
      naming: liturgicalDayProp.naming,
      season: liturgicalDayProp.season,
      alternativeColor: liturgicalDayProp.alternativeColor,
    };
    this.result[month] ??= {};

    const existing = this.result[month][day];
    if (!existing) {
      this.result[month][day] = { commemorations: [], ...liturgicalDay };
    } else {
      // The day gives way and is commemorated. The season belongs to the date
      // and the color to the Mass that is said, so neither follows it down: a
      // commemoration is a collect added to that Mass, not a Mass of its own.
      // Nor does the Office, which is that of the celebration kept.
      const {
        commemorations,
        officium: _officium,
        season: _season,
        color: _color,
        alternativeColor: _alternativeColor,
        ...commemorated
      } = existing;
      this.result[month][day] = {
        ...liturgicalDay,
        commemorations: [commemorated as Commemoration, ...commemorations],
      };
    }
  }
}
