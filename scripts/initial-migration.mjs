import { join } from "path";
import { COPY_BASE, MIGRATION_BASE } from "./common/config.mjs";
import { logger } from "./common/logger.mjs";
import { readdir, mkdir, readFile } from "fs/promises";
import { executeStep } from "./common/step.mjs";
import { writeYamlFile } from "./common/fileUtils.mjs";

const rootReferencePattern = /^(?:\((.+)\))?(@.*)$/;

function resolveRubrics(rubrics) {
  if (!rubrics) return { allow: ["default"] };

  if (rubrics === "rubrica tridentina") return { allow: ["1570"] };
  if (rubrics === "nisi rubrica cisterciensis") return { disallow: ["SOCist"] };
  logger.error(`Unknown rubrics: ${rubrics}`);
}

function migrateSection(section) {
  const sectionLines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);

  if (sectionLines.length === 1) {
    const rootReference = sectionLines[0].match(rootReferencePattern);
    if (rootReference) {
      const rubrics = resolveRubrics(rootReference[1]);

      const result = {};
      rubrics.allow?.forEach((rubric) => {
        rubric = rubric === "default" ? null : rubric;
        result[rubric ? `${rubric}/references` : "references"] = [
          rootReference[2],
        ];
      });
      rubrics.disallow?.forEach((rubric) => {
        result[rubric ? `${rubric}/references` : "references"] = [];
      });
      return result;
    } else throw new Error(`Unknown root reference: ${sectionLines[0]}`);
  }
  return {};
}

function migrateContent(content) {
  const sections = content
    .split(/\r?\n\r?\n/)
    .map((section) => section.trim())
    .filter((section) => section.length);

  return sections.reduce((acc, section) => {
    const result = migrateSection(section);

    const duplicateKeys = Object.keys(result).filter((key) => {
      const isDuplicate = !!acc[key];
      if (isDuplicate && key === "references") {
        result.references = new Set([...acc.references, ...result.references]);
        return false;
      }
      return isDuplicate;
    });

    if (duplicateKeys.length > 0)
      throw new Error(`Duplicate key: ${duplicateKeys.join(", ")}`);

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
  readdir(COPY_BASE, { recursive: true }).then((files) =>
    Promise.all(
      files
        .filter((file) => file.endsWith(".txt"))
        .map((file) => {
          const from = join(COPY_BASE, file);
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
