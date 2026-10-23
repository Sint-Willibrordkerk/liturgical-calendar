#!/usr/bin/env node
/**
 * Copy the pipeline's last step to where it is published: the days, which are
 * the same in every language, into this package's `assets/mass-propers/`; and
 * each language's stores, and its Martyrology where it has one, into its
 * package's `assets/mass-propers/<code>/` and `assets/martyrologium/<code>/`.
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
import { join, resolve } from "path";
import { consola } from "consola";

const SOURCE = ".divinum-officium/step12";
const PACKAGES = "languages";

/** The trees of days the pipeline writes once, beside the languages. */
const DAY_TREES = ["Sancti", "Tempora"];

/** Where this package bundles the days from. */
const DAYS = join("assets", "mass-propers");

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

/** The tree the pipeline writes the Martyrology to, under each language. */
const MARTYROLOGY = "Martyrologium";

function isMartyrology(path, code) {
  return resolve(path).startsWith(resolve(join(SOURCE, code, MARTYROLOGY)));
}

async function report(code, target) {
  const { bytes, files } = await directorySize(target);
  consola.success(
    `${code}: ${files} files (${(bytes / 1048576).toFixed(1)} MB) → ${target}`
  );
}

async function main() {
  if (!(await exists(SOURCE))) {
    consola.error(
      `${SOURCE} does not exist. Run the pipeline first: pnpm pipeline`
    );
    process.exit(1);
  }

  // The days, keys only, bundled with the calendar for every language.
  await rm(DAYS, { recursive: true, force: true });
  for (const tree of DAY_TREES) {
    await cp(join(SOURCE, tree), join(DAYS, tree), { recursive: true });
  }
  await report("days", DAYS);

  const unpackaged = [];
  for (const entry of await readdir(SOURCE, { withFileTypes: true })) {
    if (!entry.isDirectory() || DAY_TREES.includes(entry.name)) continue;
    const code = entry.name;
    const pkg = join(PACKAGES, code);
    if (!(await exists(join(pkg, "package.json")))) {
      unpackaged.push(code);
      continue;
    }

    // Replace the generated stores and Martyrology only. Anything else in the
    // package's assets — the translations — is hand-maintained and left alone.
    const target = join(pkg, "assets", "mass-propers", code);
    await rm(target, { recursive: true, force: true });
    await mkdir(join(pkg, "assets", "mass-propers"), { recursive: true });
    await cp(join(SOURCE, code), target, {
      recursive: true,
      filter: (src) => !isMartyrology(src, code),
    });
    await report(code, target);

    // The Martyrology is not a Mass proper, and is filed under its own name.
    const martyrology = join(pkg, "assets", "martyrologium", code);
    await rm(martyrology, { recursive: true, force: true });
    if (await exists(join(SOURCE, code, MARTYROLOGY))) {
      await mkdir(join(pkg, "assets", "martyrologium"), { recursive: true });
      await cp(join(SOURCE, code, MARTYROLOGY), martyrology, { recursive: true });
      await report(code, martyrology);
    }
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
