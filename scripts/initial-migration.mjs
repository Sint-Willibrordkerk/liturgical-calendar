import { join, relative } from "path";
import { COPY_BASE, MIGRATION_BASE } from "./lib/config.mjs";
import { logger } from "./lib/logger.mjs";
import { migrateFile } from "./lib/migration.mjs";
import { existsSync, mkdirSync, rmSync } from "fs";
import { eachFile } from "./lib/fileUtils.mjs";

logger.debug(`Debug mode: ${logger.isDebugMode()}`);

logger.info("Starting initial migration...");

rmSync(MIGRATION_BASE, { recursive: true, force: true });

eachFile(COPY_BASE, (fileFrom) => {
  const relativePath = relative(COPY_BASE, fileFrom).replace(/\\/g, "/");
  const pathParts = relativePath.split("/");
  const dirName = pathParts[0];
  const fileName = pathParts[pathParts.length - 1];
  
  const to = join(MIGRATION_BASE, dirName);
  if (!existsSync(to)) mkdirSync(to, { recursive: true });

  const fileTo = join(MIGRATION_BASE, dirName, fileName.replace(/\.txt$/, ".yml"));

  migrateFile(fileFrom, fileTo);
}, true);

logger.info("\nInitial migration complete!");
logger.logCounters();
