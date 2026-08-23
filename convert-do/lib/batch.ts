import { readdir, mkdir } from "fs/promises";
import { dirname } from "path";
import { consola } from "consola";
import { STEP_EXT } from "./serialize.js";

export const DEFAULT_CONCURRENCY = 150;

/** Run `fn` over `items` with a bounded worker pool; collects error count. */
export async function runBatched<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<{ processed: number; errors: number }> {
  const queue = [...items];
  let processed = 0;
  let errors = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      try {
        await fn(item);
        processed++;
      } catch (err) {
        errors++;
        consola.error(`Error processing ${String(item)}:`, (err as Error).message);
      }
    }
  }

  const n = Math.min(concurrency, items.length) || 1;
  await Promise.all(Array(n).fill(0).map(worker));
  return { processed, errors };
}

/** Recursively list tree files under `dirPath`, as paths relative to it. */
export function collectYmlFiles(
  dirPath: string,
  ext: string = STEP_EXT
): Promise<string[]> {
  return readdir(dirPath, { recursive: true }).then((entries) =>
    entries.filter(
      (rel): rel is string => typeof rel === "string" && rel.endsWith(ext)
    )
  );
}

/** `mkdir -p` the parent directory of `filePath`, memoized via `cache`. */
export async function ensureDir(
  filePath: string,
  cache: Set<string>
): Promise<void> {
  const outDir = dirname(filePath);
  if (!cache.has(outDir)) {
    await mkdir(outDir, { recursive: true });
    cache.add(outDir);
  }
}
