import { join } from "path";
import { STEP_BASE } from "./config.mjs";
import { logger } from "./logger.mjs";
import { rm } from "fs/promises";

export async function executeStep(name, callback) {
  logger.debug(`Debug mode: ${logger.isDebugMode()}`);
  logger.info(`Starting step: ${name}`);

  await rm(join(STEP_BASE, name), { recursive: true, force: true });

  await callback();

  logger.info(`Completed step: ${name}`);
  logger.logCounters();

  if (logger.getCounter("errors") > 0) process.exit(1);
}
