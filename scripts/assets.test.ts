import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calendarAssets, daysVersion, languageAssets, readLanguage, readYamlTree } from "./assets.mjs";

let root: string;
const write = (path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lc-assets-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("a tree of YAML files", () => {
  it("is read by the path below it, with forward slashes, and nothing but YAML", () => {
    write("a/calendar.yml", "id: one\n");
    write("a/propers/local/day.yaml", "id: two\n");
    write("a/propers/notes.txt", "not read\n");
    expect(readYamlTree(join(root, "a"))).toEqual({
      "calendar.yml": { id: "one" },
      "propers/local/day.yaml": { id: "two" },
    });
  });
});

describe("the version of the days", () => {
  const days = (gospel: string) => {
    write("days/Sancti/agnetis.yml", `evangelium: ${gospel}\n`);
    write("days/Tempora/pascha.yml", "oratio: deus-qui-1\n");
    return daysVersion([join(root, "days/Sancti"), join(root, "days/Tempora")]);
  };

  it("is the same for the same days, and short enough to read", () => {
    expect(days("matt-25-1-13")).toBe(days("matt-25-1-13"));
    expect(days("matt-25-1-13")).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is another once a day holds another key", () => {
    expect(days("matt-25-1-13")).not.toBe(days("matt-25-1-13-2"));
  });

  it("is another once a day is filed under another name", () => {
    const before = days("matt-25-1-13");
    rmSync(join(root, "days/Sancti/agnetis.yml"));
    write("days/Sancti/agnetis-virginis.yml", "evangelium: matt-25-1-13\n");
    expect(daysVersion([join(root, "days/Sancti"), join(root, "days/Tempora")])).not.toBe(before);
  });
});

describe("the assets the calendar is built from", () => {
  it("are every YAML under the folder, with the version of the days filed beside them", () => {
    write("assets/calendar1962.yml", "type: festum\n");
    write("assets/mass-propers/Sancti/agnetis.yml", "oratio: deus-qui-1\n");
    write("assets/mass-propers/data-version", "0123456789ab\n");
    expect(calendarAssets(join(root, "assets"))).toEqual({
      files: {
        "calendar1962.yml": { type: "festum" },
        "mass-propers/Sancti/agnetis.yml": { oratio: "deus-qui-1" },
      },
      dataVersion: "0123456789ab",
    });
  });

  it("carry no version where no days have been generated", () => {
    write("assets/calendar1962.yml", "type: festum\n");
    expect(calendarAssets(join(root, "assets"))).toEqual({
      files: { "calendar1962.yml": { type: "festum" } },
    });
  });

  it("are refused where days are filed without their version", () => {
    write("assets/mass-propers/Sancti/agnetis.yml", "oratio: deus-qui-1\n");
    expect(() => calendarAssets(join(root, "assets"))).toThrow(/pnpm copy-mass-propers/);
  });

  it("may leave the days out, for what needs the calendar alone", () => {
    write("assets/calendar1962.yml", "type: festum\n");
    write("assets/mass-propers/Sancti/agnetis.yml", "oratio: deus-qui-1\n");
    write("assets/mass-propers/data-version", "0123456789ab\n");
    expect(calendarAssets(join(root, "assets"), { days: false })).toEqual({
      files: { "calendar1962.yml": { type: "festum" } },
    });
  });
});

describe("a language package", () => {
  const manifest = (code = "nl") =>
    write("nl/package.json", JSON.stringify({ name: "calendar-nl", liturgicalLanguage: code }));

  it("is its code, its assets by kind and then by name, and the version of the days its stores are keyed to", () => {
    manifest();
    write("nl/assets/mass-propers/nl/oratio.yml", "deus-qui-1: { text: God }\n");
    write("nl/assets/mass-propers/data-version", "0123456789ab\n");
    write("nl/assets/translations/nl/seasons.yml", "adventus: Advent\n");
    expect(readLanguage(join(root, "nl"))).toEqual({
      code: "nl",
      dataVersion: "0123456789ab",
      assets: {
        masspropers: { oratio: { "deus-qui-1": { text: "God" } } },
        translations: { seasons: { adventus: "Advent" } },
      },
    });
    expect(languageAssets(join(root, "nl/assets"), "nl")).toEqual(readLanguage(join(root, "nl")).assets);
  });

  it("carries no version where it has no stores: its translations hold for any days", () => {
    manifest();
    write("nl/assets/translations/nl/seasons.yml", "adventus: Advent\n");
    expect(readLanguage(join(root, "nl"))).toEqual({
      code: "nl",
      assets: { translations: { seasons: { adventus: "Advent" } } },
    });
  });

  it("is refused where its stores are filed without the version of their days", () => {
    manifest();
    write("nl/assets/mass-propers/nl/oratio.yml", "deus-qui-1: { text: God }\n");
    expect(() => readLanguage(join(root, "nl"))).toThrow(/pnpm copy-mass-propers/);
  });

  it("is refused where its package names no language", () => {
    write("nl/package.json", JSON.stringify({ name: "calendar-nl" }));
    expect(() => readLanguage(join(root, "nl"))).toThrow(/liturgicalLanguage/);
  });
});
