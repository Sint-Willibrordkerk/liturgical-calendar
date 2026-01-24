import { join } from "path";
import { existsSync } from "fs";
import { RESOLVE_REFERENCES_BASE, MIGRATION_BASE } from "./config.mjs";
import { logger } from "./logger.mjs";
import { readYamlFile, writeYamlFile } from "./fileUtils.mjs";
import { maybeArrayEach, toKebabCase } from "./utils.mjs";

const referencePattern =
  /^@(?:([^:]+)\/)?([^:]+)?(?::([^:]*)(?::([0-9-]+)?((?::?\s*s\/[^/]+\/[^/]*\/[igms]*)+)?)?)?$/;

export function resolveReference(reference, path, root) {
  logger.debug("Resolving reference:", reference, ", path:", path);

  try {
    let [_, type, file, key, _verses, replacements] =
      reference.match(referencePattern);
    logger.debug(
      `type: "${type}" file: "${file}" key: "${key}" replacements: "${replacements}"`
    );

    // Try reading from OUTPUT_BASE first (resolved files), fallback to MIGRATION_BASE
    let content;
    if (type && file) {
      const outputPath = join(RESOLVE_REFERENCES_BASE, type, file + ".yml");
      const migrationPath = join(MIGRATION_BASE, type, file + ".yml");
      if (existsSync(outputPath)) {
        content = readYamlFile(outputPath);
      } else {
        content = readYamlFile(migrationPath);
      }
    } else {
      content = root;
    }

    if (!key && !path) return content;

    key = toKebabCase(key) || path;

    const result = { default: content[key] };
    if (path.includes("/")) {
      result.default ??= content[`${path.split("/")[0]}/${key}`];
      result.default ??= content[path.split("/")[1]];
    } else
      Object.entries(content).forEach(([contentKey, value]) => {
        if (contentKey !== key && contentKey.endsWith(`/${key}`))
          result[contentKey.split("/")[0]] = value;
      });

    logger.debug(`key: "${key}" result: "${JSON.stringify(result)}"`);

    return result;
  } catch (error) {
    logger.error(`Error resolving reference: "${reference}"`);
    throw error;
  }

  if (replacements) {
    const replacementPatterns = replacements.split("s/");
    for (const replacement of replacementPatterns) {
      const [from, to] = replacement.split("/");
      result = result.map((item) => item.replace(from, to ?? "").trim());
    }
  }

  if (typeof result === "object" && Array.isArray(result) && !result?.length) {
    if (
      !(key ? (key?.includes("/") ? key.split("/")[1] : key) : path).match(
        /^ant-.+|capitulum-.+|lectio.+|responsory-.+|$/
      )
    )
      throw new Error(`No result found for reference: "${reference}"`);
  }

  return result;
}

export function resolveReferencesInObject(object) {
  const result = { ...object };
  Object.entries(object).forEach(([key, value]) => {
    const rubrica = key.match(/^([^/]+)\/?(.*)$/)?.[1];
    if (key === "references" || key === `${rubrica}/references`) {
      result[key] = {};
      maybeArrayEach(value, (item) => {
        result[key] = { ...result[key], ...resolveReference(item, undefined) };
      });
    } else if (
      typeof value === "object" &&
      Array.isArray(value) &&
      value.find((item) => item.startsWith("@"))
    ) {
      const arrayResult = { default: [] };

      for (const item of value) {
        if (item.startsWith("@")) {
          const resolved = resolveReference(item, key, object);

          if (rubrica) {
            arrayResult.default.push(
              ...(resolved[rubrica] ?? resolved.default)
            );
          } else {
            Object.keys(resolved).forEach(
              (rubrica) => (arrayResult[rubrica] ??= [...arrayResult.default])
            );
            Object.entries(arrayResult).forEach(([rubrica, value]) =>
              value.push(...(resolved[rubrica] ?? resolved.default))
            );
          }
        } else {
          Object.values(arrayResult).forEach((segment) => segment.push(item));
        }
      }

      result[key] = arrayResult.default;
      if (!rubrica) {
        Object.entries(arrayResult).forEach(([rubrica, value]) => {
          if (rubrica !== "default") result[`${rubrica}/${key}`] ??= value;
        });
      }
    }
  });
  return result;
}

export function resolveReferencesInFile(file) {
  const fileName = file.split(/[\\/]/).pop();
  const dirName = file.split(/[\\/]/).at(-2);

  try {
    const content = readYamlFile(file);
    const resolved = resolveReferencesInObject(content);
    writeYamlFile(file, resolved);
    logger.incrementCounter(`files.resolved.${dirName}`);
  } catch (error) {
    logger.error(`Error resolving references in ${fileName}:`, error.message);
    logger.debug("Error details:", error);
    logger.incrementCounter(`files.errors.${dirName}`);
    throw error;
  }
}
