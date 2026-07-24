#!/usr/bin/env node
/**
 * Copy the pipeline's last step (the Mass propers) into `assets/`, where the
 * bundler picks them up along with the hand-maintained assets.
 *
 * The pipeline writes to `.divinum-officium/`, which is not committed; `assets/`
 * is. This is the one place the two meet, so the copy is explicit rather than a
 * build-time read of a gitignored folder.
 */
import { cp, rm, readdir, stat } from "fs/promises";
import { join } from "path";
import { consola } from "consola";

const SOURCE = ".divinum-officium/step11";
const TARGET = "assets/mass-propers";

async function directorySize(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    bytes += (await stat(join(entry.parentPath, entry.name))).size;
    files++;
  }
  return { bytes, files };
}

async function main() {
  try {
    await stat(SOURCE);
  } catch {
    consola.error(
      `${SOURCE} does not exist. Run the pipeline first: pnpm pipeline`
    );
    process.exit(1);
  }

  // Replace the generated language folders only. Anything else already in the
  // target is hand-maintained and left alone.
  for (const entry of await readdir(SOURCE, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    await rm(join(TARGET, entry.name), { recursive: true, force: true });
    await cp(join(SOURCE, entry.name), join(TARGET, entry.name), {
      recursive: true,
    });
  }

  const { bytes, files } = await directorySize(TARGET);
  consola.success(
    `Copied ${files} files (${(bytes / 1048576).toFixed(1)} MB) to ${TARGET}`
  );
}

main();
