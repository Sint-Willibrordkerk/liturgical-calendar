#!/usr/bin/env node
// The calendar and its languages are released together, at one version: a
// language says what the keys of the calendar's days mean, so the two are only
// right for each other when they come from the same build.
//
// Run as a script, it refuses packages that are not all at one version, or not
// at the version of the tag given: `node scripts/package-versions.mjs v3.5.0`.
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

/** The name and version of every package published from here, the calendar first. */
export function packageVersions(root = ROOT) {
  const manifests = [
    join(root, "package.json"),
    ...readdirSync(join(root, "languages"))
      .sort()
      .map((code) => join(root, "languages", code, "package.json"))
      .filter(existsSync),
  ];
  return manifests.map((path) => {
    const { name, version } = JSON.parse(readFileSync(path, "utf-8"));
    return { name, version };
  });
}

/**
 * Why the packages cannot be released, each reason a line: one not at the
 * calendar's version, or the tag naming another. Nothing where all is well.
 */
export function versionProblems(packages, tag) {
  const [calendar, ...languages] = packages;
  const problems = languages
    .filter(({ version }) => version !== calendar.version)
    .map(
      ({ name, version }) =>
        `${name} is at ${version}, and ${calendar.name} at ${calendar.version}`
    );
  if (tag !== undefined && tag !== `v${calendar.version}`) {
    problems.push(`the tag is ${tag}, and the packages are at ${calendar.version}`);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packages = packageVersions();
  const problems = versionProblems(packages, process.argv[2]);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`${packages.length} packages at ${packages[0].version}`);
}
