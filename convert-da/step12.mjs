import { consola } from "consola";
import { join, dirname } from "path";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { parse, stringify } from "yaml";

const PROJECT_BASE = process.cwd();
const STEP11_INPUT = join(PROJECT_BASE, ".divinum-officium", "step11");
const STEP12_OUTPUT = join(PROJECT_BASE, ".divinum-officium", "step12");
const CONCURRENCY = 150;

const COMMEMORATIO_PREFIX =
  /^commemoratio-(oratio|secreta|postcommunio)(?:\/.*)?$/;
const PRO_LINE = /^\s*!?\s*Pro\s+(.+)$/i;
const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

function commemorationNameToSlug(firstLine) {
  if (!firstLine || typeof firstLine !== "string") return null;
  const s = firstLine.trim();
  const m = s.match(PRO_LINE);
  if (!m) return null;
  let name = m[1].trim();
  if (name.startsWith("S. ")) name = name.slice(3).trim();
  else if (name.startsWith("Ss. ")) name = name.slice(4).trim();
  if (!name) return null;
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(INVALID_FILE_CHARS, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || null;
}

function getProDisplayName(firstLine) {
  if (!firstLine || typeof firstLine !== "string") return "";
  let s = firstLine.trim().replace(/^!\s*/, "");
  if (/^Pro\s+/i.test(s)) s = s.replace(/^Pro\s+/i, "");
  return s || "";
}

/** Remove all keys that are commemoratio-oratio, commemoratio-secreta, commemoratio-postcommunio (any variant). */
function withoutCommemoratioKeys(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (COMMEMORATIO_PREFIX.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Extract commemoration sections from a step11 object. Returns [{ slug, displayName, oratio, secreta, postcommunio }]. */
function extractCommemorations(obj) {
  if (obj == null || typeof obj !== "object") return [];
  const bySlug = new Map(); // slug -> { displayName, oratio, secreta, postcommunio }
  for (const [key, value] of Object.entries(obj)) {
    const match = key.match(COMMEMORATIO_PREFIX);
    if (!match || !Array.isArray(value) || value.length === 0) continue;
    const type = match[1]; // oratio | secreta | postcommunio
    const firstLine = value[0];
    const slug = commemorationNameToSlug(
      typeof firstLine === "string" ? firstLine : String(firstLine)
    );
    if (!slug) continue;
    const content = value.slice(1);
    const displayName = getProDisplayName(firstLine);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        displayName,
        oratio: null,
        secreta: null,
        postcommunio: null,
      });
    }
    const entry = bySlug.get(slug);
    entry[type] = content;
    if (displayName) entry.displayName = displayName;
  }
  return [...bySlug.entries()].map(([slug, data]) => ({
    slug,
    displayName: data.displayName || slug,
    oratio: data.oratio ?? [],
    secreta: data.secreta ?? [],
    postcommunio: data.postcommunio ?? [],
  }));
}

/**
 * Transform object by removing commemoratio keys.
 * Returns { main: Object, commemorations: Array }.
 * Exported for streaming pipeline.
 *
 * @param {Object} obj - Sections object
 * @returns {{ main: Object, commemorations: Array }}
 */
export function transform(obj) {
  const commemorations = extractCommemorations(obj);
  const main = withoutCommemoratioKeys(obj);
  return { main, commemorations };
}

async function runBatched(items, concurrency, fn) {
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
        consola.error(`Error processing ${item}:`, err.message);
      }
    }
  }
  const n = Math.min(concurrency, items.length) || 1;
  await Promise.all(Array(n).fill(0).map(worker));
  return { processed, errors };
}

function collectYmlFiles(dirPath) {
  return readdir(dirPath, { recursive: true }).then((entries) =>
    entries.filter((rel) => typeof rel === "string" && rel.endsWith(".yml"))
  );
}

async function main() {
  await rm(STEP12_OUTPUT, { recursive: true, force: true });
  await mkdir(STEP12_OUTPUT, { recursive: true });

  const allRelPaths = await collectYmlFiles(STEP11_INPUT);
  const mkdirCache = new Set();
  const byOutputKey = new Map(); // "dir/slug" -> { dir, slug, displayName, oratio, secreta, postcommunio }
  const toWriteMain = []; // { relPath, content } for main files (without commemoratio keys)

  async function ensureDir(filePath) {
    const outDir = dirname(filePath);
    if (!mkdirCache.has(outDir)) {
      await mkdir(outDir, { recursive: true });
      mkdirCache.add(outDir);
    }
  }

  const { errors: readErrors } = await runBatched(
    allRelPaths,
    CONCURRENCY,
    async (relPath) => {
      const absPath = join(STEP11_INPUT, relPath);
      const raw = await readFile(absPath, "utf-8");
      let obj;
      try {
        obj = parse(raw);
      } catch (_) {
        return;
      }
      const dir = dirname(relPath);
      const comms = extractCommemorations(obj);
      for (const {
        slug,
        displayName,
        oratio,
        secreta,
        postcommunio,
      } of comms) {
        const outKey = `${dir}/${slug}`;
        if (!byOutputKey.has(outKey)) {
          byOutputKey.set(outKey, {
            dir,
            slug,
            displayName,
            oratio,
            secreta,
            postcommunio,
          });
        } else {
          const existing = byOutputKey.get(outKey);
          if (oratio.length) existing.oratio = oratio;
          if (secreta.length) existing.secreta = secreta;
          if (postcommunio.length) existing.postcommunio = postcommunio;
          if (displayName) existing.displayName = displayName;
        }
      }
      const objWithout = withoutCommemoratioKeys(obj);
      toWriteMain.push({ relPath, content: stringify(objWithout) });
    }
  );

  if (readErrors > 0) {
    consola.error(`Step 12 read errors: ${readErrors}`);
  }

  let writeErrors = 0;
  for (const { relPath, content } of toWriteMain) {
    try {
      const outPath = join(STEP12_OUTPUT, relPath);
      await ensureDir(outPath);
      await writeFile(outPath, content, "utf-8");
    } catch (err) {
      writeErrors++;
      consola.error(`Error writing ${relPath}:`, err.message);
    }
  }
  for (const entry of byOutputKey.values()) {
    const { dir, slug, displayName, oratio, secreta, postcommunio } = entry;
    const outRelPath = dir ? `${dir}/${slug}.yml` : `${slug}.yml`;
    const outPath = join(STEP12_OUTPUT, outRelPath);
    const doc = {
      name: displayName,
      oratio,
      secreta,
      postcommunio,
    };
    try {
      await ensureDir(outPath);
      await writeFile(outPath, stringify(doc), "utf-8");
    } catch (err) {
      writeErrors++;
      consola.error(`Error writing ${outRelPath}:`, err.message);
    }
  }

  consola.log(
    `Step 12 done. ${toWriteMain.length} main files + ${byOutputKey.size} commemoration files in ${STEP12_OUTPUT}, ${writeErrors} write errors`
  );
}

const isMainModule = import.meta.url.endsWith("step12.mjs") &&
  process.argv[1]?.replace(/\\/g, "/").endsWith("step12.mjs");
if (isMainModule) {
  main();
}
