import { Commemoration, LiturgicalDay } from "./types";
import { eachDay } from "./utils";
import { parseCalendarData } from "./parseCalendarData";
import { loadTranslations } from "./loadAssets";

function deleteFields(day: Partial<LiturgicalDay | Commemoration>) {
  if ("commemorations" in day && day.commemorations) {
    day.commemorations.forEach(deleteFields);
    if (!day.commemorations.length) {
      delete day.commemorations;
    }
  }

  delete day.commemorationType;
  delete day.acceptCommemorationTypes;
  // Note: mass field is preserved and not deleted
}

export default (year: number, propers: string[] = [], lang?: string) => {
  const translations = lang ? loadTranslations(lang) : {};
  const calendar = parseCalendarData(year, propers, translations);

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
