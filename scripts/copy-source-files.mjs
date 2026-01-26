import { join } from "path";
import {
  SOURCE_DIRS,
  COPY_BASE,
  DIVINUM_OFFICIUM_BASE,
  FILE_FILTER,
} from "./common/config.mjs";
import { logger } from "./common/logger.mjs";
import {
  appendFile,
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  writeFile,
} from "fs/promises";
import { executeStep } from "./common/step.mjs";
import { constants } from "fs";

await executeStep("copy-source-files", () =>
  Promise.all(
    SOURCE_DIRS.map((dirName) => {
      const from = join(DIVINUM_OFFICIUM_BASE, dirName);
      const to = join(
        COPY_BASE,
        dirName.replaceAll(/\/Latin|horas|missa/g, "")
      );
      console.log({ dirName, to });

      return mkdir(to, { recursive: true })
        .then(() => readdir(from))
        .then((files) =>
          Promise.all(
            files.filter(FILE_FILTER).map((file) => {
              const fileFrom = join(from, file);
              const fileTo = join(to, file);

              logger.debug(`Copying ${fileFrom}`);
              return copyFile(fileFrom, fileTo, constants.COPYFILE_EXCL)
                .catch(() =>
                  readFile(fileFrom).then((content) =>
                    appendFile(fileTo, `\n${content}`)
                  )
                )
                .catch((error) => logger.error({ fileFrom, fileTo, error }));
            })
          )
        )
        .catch((error) => logger.error({ from, to, error }));
    })
  )
);
