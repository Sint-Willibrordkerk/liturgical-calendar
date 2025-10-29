import { Commemoration, LiturgicalDay } from "./types";
import { eachDay } from "./utils";
import { parseCalendarData } from "./parseCalendarData";

function deleteFields(day: Partial<LiturgicalDay | Commemoration>) {
  if ("commemorations" in day && day.commemorations) {
    day.commemorations.forEach(deleteFields);
    if (!day.commemorations.length) {
      delete day.commemorations;
    }
  }

  delete day.commemorationType;
  delete day.acceptCommemorationTypes;
}

export default (year: number, propers: string[], lang: string) => {
  const calendar = parseCalendarData(year, propers);

  eachDay(year, ({ month, day }) => {
    const dayData = calendar[month]![day]!;
    dayData.commemorations = dayData.commemorations.filter(
      (commemoration: Commemoration) =>
        dayData.acceptCommemorationTypes?.includes(
          commemoration.commemorationType!
        )
    );
    deleteFields(dayData);
  });
  return calendar;
};
