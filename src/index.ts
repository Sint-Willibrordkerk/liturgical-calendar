import { Commemoration, LiturgicalDay } from "./types";
import { eachDay, calculateEaster } from "./utils";
import { parseCalendarData } from "./parseCalendarData";
import { loadTranslations, loadMassPropersByTitle } from "./loadAssets";
import { applyFerialMass, SUNDAY_AFTER_EPIPHANY_MASS } from "./ferias";

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

export default (year: number, propers: string[] = [], lang: string = "la") => {
  const translations = loadTranslations(lang);
  const calendar = parseCalendarData(year, propers, lang, translations);

  // A fourth-class feria has no Mass of its own; it takes one from the day the
  // rubrics point at, which needs the whole year built first. The ferias after
  // the First Sunday after the Epiphany take that Sunday's own Mass, which no
  // day of the calendar carries — the Sunday itself is kept as the Holy Family.
  applyFerialMass(
    calendar,
    year,
    loadMassPropersByTitle(SUNDAY_AFTER_EPIPHANY_MASS, lang, undefined, {
      date: new Date(year, 0, 12),
      easter: calculateEaster(year),
    })
  );

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
