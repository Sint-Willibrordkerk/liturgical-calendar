import { join, relative } from "path";
import { MIGRATION_BASE, RESOLVE_REFERENCES_BASE } from "./lib/config.mjs";
import { logger } from "./lib/logger.mjs";
import { resolveReferencesInFile } from "./lib/references.mjs";
import { existsSync, mkdirSync, rmSync, copyFileSync } from "fs";
import { eachFile } from "./lib/fileUtils.mjs";

logger.debug(`Debug mode: ${logger.isDebugMode()}`);

logger.info("Starting reference resolution...");

// Copy files from migration base to output base
rmSync(RESOLVE_REFERENCES_BASE, { recursive: true, force: true });

eachFile(
  MIGRATION_BASE,
  (fileFrom) => {
    const relativePath = relative(MIGRATION_BASE, fileFrom).replace(/\\/g, "/");
    const pathParts = relativePath.split("/");
    const dirName = pathParts[0];

    const to = join(RESOLVE_REFERENCES_BASE, dirName);
    if (!existsSync(to)) mkdirSync(to, { recursive: true });

    const fileTo = join(RESOLVE_REFERENCES_BASE, relativePath);
    copyFileSync(fileFrom, fileTo);
    logger.debug(`Copied ${relativePath} to output base`);
  },
  true
);

// Resolve references in output base
eachFile(
  RESOLVE_REFERENCES_BASE,
  (file) => {
    resolveReferencesInFile(file);
  },
  true
);

logger.info("\nReference resolution complete!");
logger.logCounters();
