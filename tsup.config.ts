import { defineConfig } from "tsup";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { parse } from "yaml";

// Recursively read all YAML files from assets folder
function readAssetsFromFolder(
  folderPath: string,
  basePath: string = ""
): Record<string, any> {
  const assets: Record<string, any> = {};

  const items = readdirSync(folderPath);

  for (const item of items) {
    const fullPath = join(folderPath, item);
    let relativePath = basePath ? join(basePath, item) : item;
    // Normalize paths to use forward slashes for cross-platform compatibility
    relativePath = relativePath.replace(/\\/g, "/");

    if (statSync(fullPath).isDirectory()) {
      // Recursively read subdirectories
      Object.assign(assets, readAssetsFromFolder(fullPath, relativePath));
    } else if (item.endsWith(".yml") || item.endsWith(".yaml")) {
      // Parse YAML files
      const content = readFileSync(fullPath, "utf-8");
      assets[relativePath] = parse(content);
    }
  }

  return assets;
}

// Only what every language shares: the calendar itself, the sanctoral, the
// local propers, and the days of the Mass propers, which hold keys alone. What
// the keys say belongs to a language and is published as
// `@sint-willibrordkerk/liturgical-calendar-<code>`, built from `languages/` by
// `pnpm build:languages` — so this bundle stays the same whatever languages exist.
const bundledAssets = readAssetsFromFolder("assets");

// The days are generated, not committed. Built without them, every language
// would quietly come out with no Mass on any day.
if (!Object.keys(bundledAssets).some((path) => path.startsWith("mass-propers/"))) {
  throw new Error(
    "assets/mass-propers/ is empty. The Mass propers are generated: run\n" +
      "  pnpm pipeline\n  pnpm copy-mass-propers"
  );
}

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  treeshake: true,
  esbuildOptions(options) {
    options.banner = {
      js: `const bundledAssets=${JSON.stringify(bundledAssets)};`,
    };
  },
  onSuccess: "echo 'Build completed successfully'",
});
