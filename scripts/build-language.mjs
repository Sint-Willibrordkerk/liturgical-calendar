// Build one language package: every YAML under its `assets/` becomes one
// module exporting them as a `Language`, by kind and then by name.
//
// The assets are inlined rather than read at runtime so the package works
// unchanged in a browser, in a bundler and in Node, with nothing to resolve.
import { readFileSync, statSync, mkdirSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";
import { languageAssets } from "./language-assets.mjs";

const packageDir = resolve(process.argv[2] ?? ".");
const { name, liturgicalLanguage } = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf-8")
);
if (!liturgicalLanguage) {
  throw new Error(`${name} has no "liturgicalLanguage" in its package.json`);
}

const assetsDir = join(packageDir, "assets");

let assets;
try {
  assets = languageAssets(assetsDir, liturgicalLanguage);
} catch {
  throw new Error(
    `${name} has no assets. The Mass propers are generated: run\n` +
      `  pnpm pipeline\n  pnpm copy-mass-propers`
  );
}

const count = Object.values(assets).reduce(
  (sum, named) => sum + Object.keys(named).length,
  0
);
if (count === 0) throw new Error(`${name} has no assets under ${assetsDir}`);

const dist = join(packageDir, "dist");
mkdirSync(dist, { recursive: true });

writeFileSync(
  join(dist, "index.mjs"),
  `const assets=${JSON.stringify(assets)};\n` +
    `export default { code: ${JSON.stringify(liturgicalLanguage)}, assets };\n`,
  "utf-8"
);

writeFileSync(
  join(dist, "index.d.mts"),
  [
    "import type { Language } from \"@sint-willibrordkerk/liturgical-calendar\";",
    "declare const language: Language;",
    "export default language;",
    "",
  ].join("\n"),
  "utf-8"
);

const size = statSync(join(dist, "index.mjs")).size;
console.log(
  `${name}: ${count} assets, ${(size / 1048576).toFixed(2)} MB ` +
    `(${relative(process.cwd(), dist)})`
);
