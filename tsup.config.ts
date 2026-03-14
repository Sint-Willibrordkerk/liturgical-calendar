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

// Pre-parse all YAML files to JSON and compress
// Only bundle essential divinum-officium folders (Sancti and Tempora) for Latin
const divinumOfficiumLanguages = ["la"];
const divinumOfficiumFolders = ["Sancti", "Tempora"];

function readDivinumOfficium(): Record<string, any> {
  const assets: Record<string, any> = {};
  const basePath = ".divinum-officium/step10";

  for (const lang of divinumOfficiumLanguages) {
    for (const folder of divinumOfficiumFolders) {
      const folderPath = join(basePath, lang, folder);
      try {
        const folderAssets = readAssetsFromFolder(
          folderPath,
          `divinum-officium/${lang}/${folder}`
        );
        Object.assign(assets, folderAssets);
      } catch {
        // Folder may not exist for all languages
      }
    }
  }

  return assets;
}

const bundledAssets = {
  ...readAssetsFromFolder("assets"),
  ...readDivinumOfficium(),
};

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
