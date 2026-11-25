// Build one language package: every YAML under its `assets/` becomes one
// module exporting them as a `Language`, by kind and then by name, with the
// version of the days its stores are keyed to.
//
// The assets are inlined rather than read at runtime so the package works
// unchanged in a browser, in a bundler and in Node, with nothing to resolve.
import { readFileSync, statSync, mkdirSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";
import { readLanguage } from "./assets.mjs";

const packageDir = resolve(process.argv[2] ?? ".");
const { name } = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8"));

const language = readLanguage(packageDir);

const count = Object.values(language.assets).reduce(
  (sum, named) => sum + Object.keys(named).length,
  0
);
if (count === 0) {
  throw new Error(
    `${name} has no assets. The Mass propers are generated: run\n` +
      `  pnpm pipeline\n  pnpm copy-mass-propers`
  );
}

const dist = join(packageDir, "dist");
mkdirSync(dist, { recursive: true });

writeFileSync(
  join(dist, "index.mjs"),
  `export default ${JSON.stringify(language)};\n`,
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
