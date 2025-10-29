import { loadAsset } from "./assert/utils";
import { assertSanctorum } from "./assert/sanctorum";
import { assertCalendarData } from "./assert/calendarData";

export function loadCalendarData() {
  const calendarData = loadAsset("calendar1962.yml");
  assertCalendarData(calendarData);
  return calendarData;
}

export function loadSanctorum() {
  const sanctorum = loadAsset("sanctorum.yml");
  assertSanctorum(sanctorum);
  return sanctorum;
}

export function loadPropers(name: string) {
  const propers = loadAsset(`propers\\${name}.yml`);
  assertCalendarData(propers);
  return propers;
}
