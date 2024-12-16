import { LiturgicalClass } from "src/types";
import {
  assert,
  assertArray,
  assertBoolean,
  assertMaybeArray,
  assertObject,
  assertString,
  loadAsset,
} from "./utils";

export function parseSaints() {
  const saints = loadAsset("sanctorum/base.yml");

  assertObject(saints, ([name, val]) => {
    assertString(name);
    assertObject(val, ([key, val]) => {
      switch (key) {
        case "titles":
          assertMaybeArray(val, assertString);
          break;
        case "type":
          assert(/^vigilia|domini|custom$/.test(val), `invalid type: ${val}`);
          break;
        default:
          throw new Error(`unknown key: ${key}`);
      }
    });
  });

  return saints as Record<
    string,
    {
      titles?: string | string[];
      type?: "vigilia" | "domini" | "custom";
    }
  >;
}

export function parseCalendar(validSaints: string[]) {
  const calendar = loadAsset("calendar.yml");

  assertObject(calendar, ([_class, entry]) => {
    assert(/^[1-4]$/.test(_class), `invalid class: ${_class}`);
    assertObject(entry, ([date, saints]) => {
      assert(/^\d{2}-\d{2}$/.test(date), `invalid date: ${date}`);
      assertMaybeArray(saints, (val) => {
        assert(validSaints.includes(val), `${val} is not a valid saint`);
      });
    });
  });
  assert(Object.keys(calendar).length === 4, "calendar needs the keys 1-4");

  return calendar as Record<
    LiturgicalClass,
    Record<`${number}-${number}`, string | string[]>
  >;
}

export function parseSaintsTranslation(
  lang: Intl.LocalesArgument,
  validSaints: string[]
) {
  const saintsTranslation = loadAsset(`sanctorum/${lang}.yml`);

  assertObject(saintsTranslation, ([key, val]) => {
    assert(validSaints.includes(key), `${key} is not a valid saint`);
    assertObject(val, ([key, val]) => {
      switch (key) {
        case "name":
          assertString(val);
          break;
        default:
          throw new Error(`unknown key: ${key}`);
      }
    });
  });
  // a full translation is required
  validSaints.forEach((key) =>
    assert(key in saintsTranslation, `${key} is missing in translation`)
  );

  return saintsTranslation as Record<string, { name?: string }>;
}

export function parseTempore() {
  const tempore = loadAsset(`tempore/base.yml`);

  assertObject(tempore, ([_class, entry]) => {
    assert(/^[1-4]$/.test(_class), `invalid class: ${_class}`);
    assertArray(entry, (val) => {
      assertObject(val, ([key, val]) => {
        switch (key) {
          case "title":
            assertString(val);
            break;
          case "type":
            assert(
              /^domini|dominica|feria|festum|octava|quartertemper|vigilia$/.test(
                val
              ),
              `invalid type: ${val}`
            );
            break;
          case "occurence":
            break;
          case "priviliged":
            assertBoolean(val);
            break;
          default:
            throw new Error(`unknown key: ${key}`);
        }
      });
    });
  });
  assert(Object.keys(tempore).length === 4, "calendar needs the keys 1-4");

  return tempore as Record<
    LiturgicalClass,
    {
      title?: string;
      type?:
        | "domini"
        | "dominica"
        | "feria"
        | "festum"
        | "octava"
        | "quartertemper"
        | "vigilia";
      occurence?: any;
      priviliged?: boolean;
    }[]
  >;
}
