import { join } from "path";
import { readFile } from "fs/promises";
import { parse } from "yaml";
import { Step3Output } from "./step3";

export type Step4Output = Step3Output;

const EX_REMOVE = /\bex\s+[A-Za-z0-9/-]+;?\s*/g;
const VIDE_REMOVE = /\bvide\s+[A-Za-z0-9/-]+;?\s*/g;

function isVideKey(key: string): boolean {
  if (!key || key === "__preamble") return false;
  if (/^lectio/i.test(key)) return true;
  if (/^ant-laudes(\/|$)/.test(key) || /^ant-vespera(\/|$)/.test(key))
    return true;
  if (
    /^ant-1(\/|$)/.test(key) ||
    /^ant-2(\/|$)/.test(key) ||
    /^ant-3(\/|$)/.test(key)
  )
    return true;
  if (/^versum/i.test(key)) return true;
  if (key === "oratio" || key.startsWith("oratio/")) return true;
  return false;
}

export function extractExVideReferences(obj: Step3Output): {
  ex: Set<string>;
  vide: Set<string>;
} {
  const exReferences = new Set<string>();
  const videReferences = new Set<string>();

  obj.__preamble?.forEach((variant) => {
    variant.value.forEach((line) => {
      if (line.startsWith("@")) {
        const path = line.slice(1).split(":")[0]!.trim();
        if (path) exReferences.add(path);
      }
    });
  });

  obj.rank?.forEach((variant) => {
    variant.value.forEach((line) => {
      const reference = line.split(";;")[3]?.trim();
      if (reference?.startsWith("ex ")) {
        exReferences.add(reference.slice(3));
      } else if (reference?.startsWith("vide ")) {
        videReferences.add(reference.slice(5));
      } else {
        throw new Error(`Invalid rank reference: ${line}`);
      }
    });
  });

  return { ex: exReferences, vide: videReferences };
}

async function getFileContent(
  basePath: string,
  relPath: string,
  fileCache: Map<string, Step3Output | null>
): Promise<Step3Output | null> {
  const key = relPath;
  if (fileCache.has(key)) return fileCache.get(key) ?? null;

  const fullPath = join(basePath, relPath);
  let raw: string;
  try {
    raw = await readFile(fullPath, "utf-8");
  } catch {
    fileCache.set(key, null);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch {
    fileCache.set(key, null);
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fileCache.set(key, null);
    return null;
  }

  const obj = parsed as Step3Output;
  fileCache.set(key, obj);
  return obj;
}

async function loadDoc(
  basePath: string,
  language: string,
  normalizedPath: string,
  fileCache: Map<string, Step3Output | null>
): Promise<Step3Output | null> {
  const relPath = `${language}/${normalizedPath}.yml`;
  return getFileContent(basePath, relPath, fileCache);
}

function mapSectionLines(
  sectionVal: Step3Output[string],
  mapString: (line: string) => string | null
): Step3Output[string] {
  const next: Step3Output[string] = [];
  for (const item of sectionVal) {
    const newVal: string[] = [];
    for (const line of item.value) {
      if (typeof line !== "string") {
        newVal.push(line);
        continue;
      }
      const s = mapString(line);
      if (s !== null && s !== "") newVal.push(s);
    }
    if (newVal.length > 0) next.push({ ...item, value: newVal });
  }
  return next;
}

function stripPreambleExVide(result: Step3Output): Step4Output {
  const out: Step4Output = { ...result };

  for (const key of Object.keys(out)) {
    if (key !== "__preamble" && !key.startsWith("__preamble/")) continue;
    if (!Array.isArray(out[key])) continue;
    const mapped = mapSectionLines(out[key], (line) =>
      line.startsWith("@") ? null : line
    ) as Step3Output[string];
    if (mapped.length === 0) delete out[key];
    else out[key] = mapped;
  }

  const rankRuleKeys = Object.keys(out).filter(
    (k) =>
      k !== "__preamble" &&
      (k === "rank" ||
        k.startsWith("rank/") ||
        k === "rule" ||
        k.startsWith("rule/"))
  );
  for (const key of rankRuleKeys) {
    if (!Array.isArray(out[key])) continue;
    const cleaned = mapSectionLines(out[key], (line) => {
      let s = line.replace(EX_REMOVE, "").replace(VIDE_REMOVE, "").trim();
      s = s.replace(/\s*;;\s*$/, "").replace(/\s*;\s*$/, "");
      if (s === "") return null;
      return s;
    });
    out[key] = cleaned;
  }

  return out;
}

/**
 * Transform object by resolving ex/vide references and importing sections.
 * @param readBasePath - Directory tree like `.divinum-officium/step3` (lang/file.yml)
 */
export async function transform(
  obj: Step3Output,
  currentFileRel: string,
  basePath: string
): Promise<Step4Output> {
  const fileCache = new Map<string, Step3Output | null>();
  let pathParts = currentFileRel.replace(/\\/g, "/").split("/");
  if (pathParts[0] === "horas" || pathParts[0] === "missa") {
    pathParts = pathParts.slice(1);
  }
  const language = pathParts[0];
  if (!language) return obj;

  const { ex, vide } = extractExVideReferences(obj);
  const currentKeys = new Set(
    Object.keys(obj).filter((k) => k !== "__preamble")
  );
  const added: Step3Output = { ...obj };

  for (const path of ex) {
    const doc = await loadDoc(basePath, language, path, fileCache);
    if (!doc) continue;
    for (const [k, v] of Object.entries(doc)) {
      if (k === "__preamble") continue;
      if (currentKeys.has(k)) continue;
      currentKeys.add(k);
      added[k] = v;
    }
  }

  for (const path of vide) {
    const doc = await loadDoc(basePath, language, path, fileCache);
    if (!doc) continue;
    for (const [k, v] of Object.entries(doc)) {
      if (k === "__preamble") continue;
      if (!isVideKey(k)) continue;
      if (currentKeys.has(k)) continue;
      currentKeys.add(k);
      added[k] = v;
    }
  }

  const addedKeys = Object.keys(added).sort();
  let result: Step3Output = addedKeys.length === 0 ? obj : { ...obj };
  if (addedKeys.length > 0) {
    for (const k of addedKeys) result[k] = added[k]!;
  }
  return stripPreambleExVide(result);
}

export function extractDependencies(obj: Step3Output): Set<string> {
  const { ex, vide } = extractExVideReferences(obj);
  return new Set([...ex, ...vide]);
}
