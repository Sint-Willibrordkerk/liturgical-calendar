import { LiturgicalClass, LiturgicalDate, LiturgicalType } from "src/types";
import { loadAsset } from "./assert/utils";
import { assertSaints } from "./assert/saints";
import { assertCalendar } from "./assert/calendar";
import { assertSaintsTranslation } from "./assert/saintsTranslation";
import { assertTempore } from "./assert/tempore";

export function parseSaints() {
  const saints = loadAsset("sanctorum/base.yml");
  assertSaints(saints);
  return saints;
}

export function parseCalendar(validSaints: string[]) {
  const calendar = loadAsset("calendar.yml");
  assertCalendar(calendar, validSaints);
  return calendar;
}

export function parseSaintsTranslation(
  lang: Intl.LocalesArgument,
  validSaints: string[]
) {
  const saintsTranslation = loadAsset(`sanctorum/${lang}.yml`);
  assertSaintsTranslation(saintsTranslation, validSaints);
  return saintsTranslation;
}

export function parseTempore() {
  const tempore = loadAsset(`tempore/base.yml`);
  assertTempore(tempore);
  return tempore;
}
