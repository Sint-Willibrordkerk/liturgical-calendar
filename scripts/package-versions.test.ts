import { describe, expect, it } from "vitest";
import { packageVersions, versionProblems } from "./package-versions.mjs";

const calendar = { name: "@sint-willibrordkerk/liturgical-calendar", version: "3.5.0" };
const dutch = { name: "@sint-willibrordkerk/liturgical-calendar-nl", version: "3.5.0" };

describe("the versions the packages are released at", () => {
  it("are in order where every package has the same", () => {
    expect(versionProblems([calendar, dutch])).toEqual([]);
  });

  it("are refused where a package is left behind, naming it and its version", () => {
    const problems = versionProblems([calendar, { ...dutch, version: "3.4.0" }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(dutch.name);
    expect(problems[0]).toContain("3.4.0");
    expect(problems[0]).toContain("3.5.0");
  });

  it("are in order for the tag that names them, with its v", () => {
    expect(versionProblems([calendar, dutch], "v3.5.0")).toEqual([]);
  });

  it("are refused for a tag that names another version", () => {
    const problems = versionProblems([calendar, dutch], "v3.6.0");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("v3.6.0");
    expect(problems[0]).toContain("3.5.0");
  });
});

describe("the packages of this repository", () => {
  it("are the calendar and a package for each language, all at one version", () => {
    const packages = packageVersions();
    expect(packages.map(({ name }) => name)).toEqual([
      "@sint-willibrordkerk/liturgical-calendar",
      "@sint-willibrordkerk/liturgical-calendar-en",
      "@sint-willibrordkerk/liturgical-calendar-la",
      "@sint-willibrordkerk/liturgical-calendar-nl",
    ]);
    expect(versionProblems(packages)).toEqual([]);
  });
});
