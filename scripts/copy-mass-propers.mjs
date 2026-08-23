#!/usr/bin/env node
/**
 * Copy the pipeline's last step — the Mass propers — into the language package
 * for each language it produced.
 *
 * The pipeline writes to `.divinum-officium/`, which is not committed, and the
 * propers run to megabytes per language, so they are not committed either. This
 * is the one place the two meet, and it is run by hand rather than at build
 * time, so nothing is ever built from a folder no one can see.
 *
 * A language the pipeline produces but that has no package is reported rather
 * than dropped: it needs a `languages/<code>/package.json` before it can ship.
 */
import { cp, rm, readdir, stat, mkdir } from "fs/promises";
import { join } from "path";
import { consola } from "consola";

const SOURCE = ".divinum-officium/step11";
const PACKAGES = "languages";

async function directorySize(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    bytes += (await stat(join(entry.parentPath, entry.name))).size;
    files++;
  }
  return { bytes, files };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(SOURCE))) {
    consola.error(
      `${SOURCE} does not exist. Run the pipeline first: pnpm pipeline`
    );
    process.exit(1);
  }

  const unpackaged = [];
  for (const entry of await readdir(SOURCE, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const code = entry.name;
    const pkg = join(PACKAGES, code);
    if (!(await exists(join(pkg, "package.json")))) {
      unpackaged.push(code);
      continue;
    }

    // Replace the generated propers only. Anything else in the package's assets
    // — the translations — is hand-maintained and left alone.
    const target = join(pkg, "assets", "mass-propers", code);
    await rm(target, { recursive: true, force: true });
    await mkdir(join(pkg, "assets", "mass-propers"), { recursive: true });
    await cp(join(SOURCE, code), target, { recursive: true });

    const { bytes, files } = await directorySize(target);
    consola.success(
      `${code}: ${files} files (${(bytes / 1048576).toFixed(1)} MB) → ${target}`
    );
  }

  if (unpackaged.length > 0) {
    consola.warn(
      `No package for ${unpackaged.join(", ")}. ` +
        `Add languages/<code>/package.json to publish ${
          unpackaged.length === 1 ? "it" : "them"
        }.`
    );
  }
}

main();
