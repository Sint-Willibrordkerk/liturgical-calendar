// Build one language package: every YAML under its `assets/` becomes one
// module exporting them as a `Language`, keyed by the path it is filed under.
//
// The assets are inlined rather than read at runtime so the package works
// unchanged in a browser, in a bundler and in Node, with nothing to resolve.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";
import { parse } from "yaml";

const packageDir = resolve(process.argv[2] ?? ".");
const { name, liturgicalLanguage } = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf-8")
);
if (!liturgicalLanguage) {
  throw new Error(`${name} has no "liturgicalLanguage" in its package.json`);
}

const assetsDir = join(packageDir, "assets");

function read(dir, base = "") {
  const assets = {};
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    const rel = (base ? `${base}/${item}` : item).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) Object.assign(assets, read(full, rel));
    else if (/\.ya?ml$/.test(item)) assets[rel] = parse(readFileSync(full, "utf-8"));
  }
  return assets;
}

let assets;
try {
  assets = read(assetsDir);
} catch {
  throw new Error(
    `${name} has no assets. The Mass propers are generated: run\n` +
      `  pnpm pipeline --from 0 --to 11\n  pnpm copy-mass-propers`
  );
}

const count = Object.keys(assets).length;
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
    "import type { Language } from \"liturgical-calendar\";",
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
