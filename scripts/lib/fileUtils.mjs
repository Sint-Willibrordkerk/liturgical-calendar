import { readdirSync, statSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { logger } from "./logger.mjs";
import { parse, stringify } from "yaml";

export function eachFile(dir, callback, recursive = false) {
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    if (statSync(fullPath).isDirectory()) {
      if (recursive) eachFile(fullPath, callback, recursive);
    } else {
      callback(fullPath);
    }
  }
}

export function readYamlFile(path) {
  logger.debug(`Reading file: ${path}`);
  return parse(readFileSync(path, "utf-8"));
}

export function writeYamlFile(path, content) {
  writeFileSync(path, stringify(content), "utf-8");
  logger.debug(`Successfully wrote ${path}`);
}
