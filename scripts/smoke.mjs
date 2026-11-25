#!/usr/bin/env node
// The packages as built, used as a caller uses them: the calendar imported
// from `dist/`, each language from its own, and Easter Sunday asked for. What
// the tests read from the sources, this reads from what is published.
import { readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const load = async (path) => (await import(pathToFileURL(join(ROOT, path)).href)).default;

const YEAR = 2026;
const EASTER = { month: 4, day: 5 };

const generateCalendar = await load("dist/index.mjs");
const codes = readdirSync(join(ROOT, "languages")).filter((code) =>
  existsSync(join(ROOT, "languages", code, "package.json"))
);

const problems = [];
for (const code of codes) {
  const language = await load(`languages/${code}/dist/index.mjs`);
  const easter = generateCalendar({ year: YEAR, languages: [language] })[EASTER.month]?.[EASTER.day];
  if (easter?.id !== "dominica-resurrectionis") {
    problems.push(`${code}: Easter Sunday ${YEAR} is ${easter?.id}`);
  } else if (typeof easter.mass?.oratio?.text !== "string") {
    problems.push(`${code}: Easter Sunday has no collect`);
  } else {
    console.log(`${code}: ${easter.title} — ${easter.mass.oratio.text.slice(0, 60)}…`);
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
