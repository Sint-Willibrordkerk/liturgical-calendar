import { writeFile, readFile } from "fs/promises";
import { logger } from "./logger.mjs";
import { parse, stringify } from "yaml";

export async function readYamlFile(path) {
  return parse(await readFile(path, "utf-8"));
}

export async function writeYamlFile(path, content) {
  await writeFile(path, stringify(content), "utf-8");
}
