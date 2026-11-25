/**
 * What the calendar is generated from, the same in every language: the
 * calendar itself, the local propers, and the days of the propers, which hold
 * keys alone.
 *
 * `files` holds each by the path it is filed under, as the YAML parses:
 * `calendar1962.yml`, `propers/fsspx.yml`,
 * `mass-propers/Sancti/agnetis-virginis-et-martyris.yml`. `dataVersion` names
 * the days among them, and is what a language's stores are checked against;
 * assets without days, or a test's own, carry none.
 *
 * They are handed to whatever reads them. The build bundles the published
 * ones (`bundledAssets`); a test hands in the sources, or a few of its own.
 */
export type Assets = {
  files: Record<string, unknown>;
  dataVersion?: string;
};

/** The asset filed under `path`, or `undefined` where none is. */
export function findAsset(assets: Assets, path: string): unknown {
  // A path is filed with forward slashes, whatever the platform wrote it with.
  return assets.files[path.replace(/\\/g, "/")] ?? assets.files[path];
}

/** The asset filed under `path`; an error where none is. */
export function loadAsset(assets: Assets, path: string): unknown {
  const asset = findAsset(assets, path);
  if (asset) return asset;
  throw new Error(`Asset ${path} not found`);
}
