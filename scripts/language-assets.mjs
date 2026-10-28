// A language's assets as its package carries them: by kind, then by name.
//
// On disk they are filed as the pipeline lays them out,
// `mass-propers/nl/antiphona.yml`; in the package that is
// `assets.masspropers.antiphona`. The language segment is dropped, since the
// package's `code` already names it, and so is the extension.
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export function languageAssets(assetsDir, code) {
  const assets = {};
  for (const kind of readdirSync(assetsDir)) {
    const dir = join(assetsDir, kind, code);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const named = {};
    for (const file of readdirSync(dir)) {
      if (!/\.ya?ml$/.test(file)) continue;
      named[file.replace(/\.ya?ml$/, "")] = parse(readFileSync(join(dir, file), "utf-8"));
    }
    if (Object.keys(named).length > 0) assets[kind.replace(/-/g, "")] = named;
  }
  return assets;
}
