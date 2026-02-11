import { join } from "path";
import { MODIFY_BASE, MIGRATION_BASE } from "./common/config.mjs";
import { logger } from "./common/logger.mjs";
import { readdir, mkdir, readFile } from "fs/promises";
import { executeStep } from "./common/step.mjs";
import { writeYamlFile } from "./common/fileUtils.mjs";
import { resolveRubrics, applyRubrics } from "./pre-process/rubrics.mjs";
import { toKebabCase } from "./common/utils.mjs";
import { parseContent } from "./pre-process/parse.mjs";

const rootReferencePattern = /^(?:\((.+)\))?(@.*)$/;
const keyPattern = /^\[([^\]]+)\](?: *\((.+)\))?$/;

function migrateSection(section) {
  const sectionLines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);

  if (sectionLines.length === 1) {
    const rootReference = sectionLines[0].match(rootReferencePattern);
    if (rootReference) {
      const rubrics = resolveRubrics(rootReference[1]);
      return applyRubrics(rubrics, "references", [rootReference[2]]);
    } else throw new Error(`Unknown root reference: ${sectionLines[0]}`);
  }

  const key = sectionLines[0].match(keyPattern);
  if (!key) throw new Error(`Unknown key: ${sectionLines[0]}`);
  const rubrics = resolveRubrics(key[2]);
  return applyRubrics(rubrics, toKebabCase(key[1]), sectionLines.slice(1));
}

function migrateContent(content) {
  const sections = content
    .split(/\r?\n\r?\n/)
    .map((section) => section.trim())
    .filter((section) => section.length);

  return sections.reduce((acc, section) => {
    const result = migrateSection(section);

    const duplicateKeys = [];
    for (const key of Object.keys(result)) {
      if (!acc[key]) continue;

      if (
        !result[key].length ||
        key.match(/(?:\/|^)(?:rank|oratio_?|officium|name)$/)
      ) {
        result[key] = acc[key];
        continue;
      }

      if (key.match(/(?:\/|^)references$/) || key.match(/(?:\/|^)rule$/)) {
        result[key] = new Set([...acc[key], ...result[key]]);
        continue;
      }

      if (!acc[key].find((item, i) => result[key][i] !== item)) continue;

      duplicateKeys.push(key);
    }

    if (duplicateKeys.length > 0)
      throw new Error(`Duplicate keys: ${duplicateKeys.join(", ")}`);

    return {
      ...acc,
      ...result,
    };
  }, {});
}

function migrateFile(from, to) {
  return readFile(from, "utf-8")
    .then(migrateContent)
    .then((result) => writeYamlFile(to, result));
}

executeStep("initial-migration", () =>
  readdir(MODIFY_BASE, { recursive: true }).then((files) =>
    Promise.all(
      files
        .filter((file) => file.endsWith(".txt"))
        .map((file) => {
          const from = join(MODIFY_BASE, file);
          const to = join(MIGRATION_BASE, file.replace(/\.txt$/, ".yml"));
          const dirName = to.split(/[\\/]/).slice(0, -1).join("\\");
          const shortDirName = dirName
            .replace(`${MIGRATION_BASE}\\`, "")
            .replace(/\\/g, "/");

          return mkdir(dirName, { recursive: true })
            .then(() => migrateFile(from, to))
            .then((result) => {
              logger.incrementCounter(`files.migrated.${shortDirName}`);
              return result;
            })
            .catch((error) => {
              logger.incrementCounter(`files.errors.${shortDirName}`);
              logger.error({
                from: from.replace(/\\/g, "/"),
                to: to.replace(/\\/g, "/"),
                error,
              });
            });
        })
    ).catch((error) => logger.error({ error }))
  )
);
