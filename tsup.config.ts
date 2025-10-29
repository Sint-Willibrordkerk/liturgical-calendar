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
    const relativePath = basePath ? join(basePath, item) : item;

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

// Pre-parse all YAML files to JSON and compress
const bundledAssets = readAssetsFromFolder("assets");

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
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
