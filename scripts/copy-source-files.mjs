import { join } from "path";
import { SOURCE_DIRS, COPY_BASE, FILE_FILTER } from "./lib/config.mjs";
import { logger } from "./lib/logger.mjs";
import { maybeArrayEach } from "./lib/utils.mjs";
import { existsSync, mkdirSync, rmSync, copyFileSync } from "fs";
import { eachFile } from "./lib/fileUtils.mjs";

logger.debug(`Debug mode: ${logger.isDebugMode()}`);

logger.info("Starting source file copy...");

rmSync(COPY_BASE, { recursive: true, force: true });

for (const [dirName, sourceDirs] of Object.entries(SOURCE_DIRS)) {
  const to = join(COPY_BASE, dirName);
  if (!existsSync(to)) mkdirSync(to, { recursive: true });

  maybeArrayEach(sourceDirs, (from) => {
    eachFile(from, (fileFrom) => {
      if (!FILE_FILTER(fileFrom)) return;

      const fileName = fileFrom.split(/[\\/]/).pop();
      const fileTo = join(to, fileName);

      copyFileSync(fileFrom, fileTo);
      logger.debug(`Copied ${fileName} to ${fileTo}`);
    });
  });
}

logger.info("\nSource file copy complete!");
logger.logCounters();
