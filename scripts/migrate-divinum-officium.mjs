import { join } from "path";
import {
  SOURCE_DIRS,
  RESOLVE_REFERENCES_BASE,
  FILE_FILTER,
} from "./lib/config.mjs";
import { logger } from "./lib/logger.mjs";
import { maybeArrayEach } from "./lib/utils.mjs";
import { migrateFile } from "./lib/migration.mjs";
import { resolveReferencesInFile } from "./lib/references.mjs";
import { existsSync, mkdirSync, rmSync } from "fs";
import { eachFile } from "./lib/fileUtils.mjs";

function initialMigration() {
  logger.info("Starting initial migration...");

  for (const [dirName, sourceDirs] of Object.entries(SOURCE_DIRS)) {
    const to = join(RESOLVE_REFERENCES_BASE, dirName);
    if (!existsSync(to)) mkdirSync(to, { recursive: true });

    maybeArrayEach(sourceDirs, (from) => {
      eachFile(from, (fileFrom) => {
        if (!FILE_FILTER(fileFrom)) return;

        const fileTo = join(
          to,
          fileFrom
            .split(/[\\/]/)
            .pop()
            .replace(/\.txt$/, ".yml")
        );

        migrateFile(fileFrom, fileTo);
      });
    });
  }

  logger.info("\nInitial migration complete!");
}

function resolveReferences() {
  logger.info("Starting reference resolution...");

  eachFile(
    RESOLVE_REFERENCES_BASE,
    (file) => {
      resolveReferencesInFile(file);
    },
    true
  );

  logger.info("\nReference resolution complete!");
}

logger.debug(`Debug mode: ${logger.isDebugMode()}`);

const command = process.argv[2];

if (command === "initialMigration") {
  rmSync(RESOLVE_REFERENCES_BASE, { recursive: true });
  initialMigration();
} else if (command === "resolveReferences") {
  resolveReferences();
} else {
  // Default: run both in sequence
  rmSync(RESOLVE_REFERENCES_BASE, { recursive: true });
  initialMigration();
  resolveReferences();
}

logger.logCounters();
