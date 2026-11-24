import { defineConfig } from "tsup";
import { calendarAssets } from "./scripts/assets.mjs";

// Only what every language shares: the calendar itself, the sanctoral, the
// local propers, and the days of the Mass propers, which hold keys alone. What
// the keys say belongs to a language and is published as
// `@sint-willibrordkerk/liturgical-calendar-<code>`, built from `languages/` by
// `pnpm build:languages` — so this bundle stays the same whatever languages exist.
const bundledAssets = calendarAssets("assets");

// The days are generated, not committed. Built without them, every language
// would quietly come out with no Mass on any day. With them comes the version
// a language's stores are checked against.
if (bundledAssets.dataVersion === undefined) {
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
    // Read in `src/bundledAssets.ts`, and nowhere else.
    options.banner = {
      js: `const __BUNDLED_ASSETS__=${JSON.stringify(bundledAssets)};`,
    };
  },
  onSuccess: "echo 'Build completed successfully'",
});
