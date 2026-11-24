import type { Assets } from "./assets";

/**
 * The assets the build bundles into the published package: `tsup.config.ts`
 * defines this constant at the head of the bundle. It is read here and nowhere
 * else.
 */
declare const __BUNDLED_ASSETS__: Assets | undefined;

/**
 * The published assets, or none at all where the package runs unbuilt — from
 * the sources, as the tests do, the assets are handed in instead.
 */
export const bundledAssets: Assets =
  typeof __BUNDLED_ASSETS__ === "undefined" ? { files: {} } : __BUNDLED_ASSETS__;
