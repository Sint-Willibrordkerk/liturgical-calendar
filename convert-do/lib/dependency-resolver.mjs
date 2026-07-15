import { consola } from "consola";
import { join } from "path";
import { readFile } from "fs/promises";
import { computeOutputKey, convertLanguage, getBaseStem, parseDirName } from "./grouper.mjs";

/**
 * Regex patterns for extracting references from source files.
 */
const AT_REFERENCE_REGEX = /@([A-Za-z0-9/_-]+)/g;
const EX_REGEX = /\bex\s+([A-Za-z0-9/_-]+)/gi;
const VIDE_REGEX = /\bvide\s+([A-Za-z0-9/_-]+)/gi;

/**
 * Normalize a reference path to a standard format.
 * Handles patterns like "C...", "Epi...", "Pasc...", "Quadp..." prefixes.
 */
function normalizeRefPath(path) {
  if (!path || typeof path !== "string") return null;
  const p = path.replace(/;\s*$/, "").trim();
  if (!p) return null;
  if (p.includes("/")) return p;
  if (/^C[A-Za-z0-9-]+$/.test(p)) return `Commune/${p}`;
  if (/^(Epi|Pasc|Quadp)[A-Za-z0-9-]*$/.test(p)) return `Tempora/${p}`;
  return p;
}

/**
 * Extract all references from a source file's raw content.
 *
 * @param {string} content - Raw file content (before parsing)
 * @returns {Set<string>} Set of normalized reference paths (without language prefix)
 */
export function extractReferences(content) {
  const refs = new Set();

  const addRef = (path) => {
    const normalized = normalizeRefPath(path);
    if (normalized) {
      refs.add(normalized);
    }
  };

  // @File:Section references
  let match;
  AT_REFERENCE_REGEX.lastIndex = 0;
  while ((match = AT_REFERENCE_REGEX.exec(content)) !== null) {
    // Extract just the file path part (before any colon for section)
    const fullRef = match[1];
    const filePart = fullRef.split(":")[0];
    addRef(filePart);
  }

  // ex Path references
  EX_REGEX.lastIndex = 0;
  while ((match = EX_REGEX.exec(content)) !== null) {
    addRef(match[1]);
  }

  // vide Path references
  VIDE_REGEX.lastIndex = 0;
  while ((match = VIDE_REGEX.exec(content)) !== null) {
    addRef(match[1]);
  }

  return refs;
}

/**
 * Map a reference path to an output key.
 * References are relative paths like "Sancti/01-01" or "Commune/C1".
 *
 * @param {string} refPath - Reference path (e.g., "Sancti/01-01")
 * @param {string} sourceLanguage - Language code of the source file (e.g., "la")
 * @returns {string|null} Output key or null if invalid
 */
export function refPathToOutputKey(refPath, sourceLanguage) {
  if (!refPath || !sourceLanguage) return null;

  const parts = refPath.split("/");
  if (parts.length < 2) return null;

  const category = parts[0];
  const rest = parts.slice(1);

  // Parse category for dir variants
  const { base: baseCategory, suffix: dirSuffix } = parseDirName(category);

  // Parse filename for rubric variants
  const filename = rest[rest.length - 1];
  const baseStem = getBaseStem(filename);
  const normalizedRest = [...rest.slice(0, -1), baseStem];

  // Build output key
  return [sourceLanguage, baseCategory, ...normalizedRest].join("/");
}

/**
 * Build a dependency graph from source groups.
 *
 * @param {Map<string, import('./grouper.mjs').SourceGroup>} sourceGroups
 * @param {string} divinumOfficiumBase - Path to divinum-officium/web/www
 * @returns {Promise<Map<string, Set<string>>>} Map of outputKey → Set of dependency outputKeys
 */
export async function buildDependencyGraph(sourceGroups, divinumOfficiumBase) {
  const graph = new Map();

  for (const [outputKey, group] of sourceGroups) {
    const deps = new Set();

    // Determine language from output key
    const keyParts = outputKey.split("/");
    const language = keyParts[0];

    // Read all source files in this group and extract references
    const allSourceFiles = [...group.horasFiles, ...group.missaFiles];

    for (const sourceFile of allSourceFiles) {
      const filePath = join(divinumOfficiumBase, sourceFile.relPath);

      let content;
      try {
        content = await readFile(filePath, "utf-8");
      } catch (err) {
        try {
          content = await readFile(filePath, "latin1");
        } catch {
          continue;
        }
      }

      const refs = extractReferences(content);

      for (const ref of refs) {
        const depKey = refPathToOutputKey(ref, language);
        if (depKey && depKey !== outputKey && sourceGroups.has(depKey)) {
          deps.add(depKey);
        }
      }
    }

    graph.set(outputKey, deps);
  }

  return graph;
}

/**
 * Build a dependency graph from a step output directory (YAML files).
 * Used when resuming from fromStep > 1.
 *
 * @param {string} stepDir - Path to .divinum-officium/stepN
 * @param {string[]} outputKeys - List of output keys (e.g. from listStepOutputKeys)
 * @returns {Promise<Map<string, Set<string>>>} Map of outputKey → Set of dependency outputKeys
 */
export async function buildDependencyGraphFromStepDir(stepDir, outputKeys) {
  const keySet = new Set(outputKeys);
  const graph = new Map();

  for (const outputKey of outputKeys) {
    const deps = new Set();
    const keyParts = outputKey.split("/");
    const language = keyParts[0];

    const filePath = join(stepDir, outputKey + ".yml");
    let content;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      graph.set(outputKey, deps);
      continue;
    }

    const refs = extractReferences(content);
    for (const ref of refs) {
      const depKey = refPathToOutputKey(ref, language);
      if (depKey && depKey !== outputKey && keySet.has(depKey)) {
        deps.add(depKey);
      }
    }
    graph.set(outputKey, deps);
  }

  return graph;
}

/**
 * Perform topological sort using Kahn's algorithm.
 * Returns output keys in processing order (dependencies first).
 *
 * @param {Map<string, Set<string>>} graph - Dependency graph
 * @returns {string[]} Sorted output keys
 * @throws {Error} If circular dependency detected
 */
export function topologicalSort(graph) {
  // Calculate in-degree for each node
  const inDegree = new Map();
  for (const key of graph.keys()) {
    if (!inDegree.has(key)) {
      inDegree.set(key, 0);
    }
  }

  for (const deps of graph.values()) {
    for (const dep of deps) {
      if (graph.has(dep)) {
        // Only count edges to nodes in the graph
        inDegree.set(dep, (inDegree.get(dep) ?? 0));
      }
    }
  }

  // Recompute in-degrees properly
  for (const key of graph.keys()) {
    inDegree.set(key, 0);
  }
  for (const [node, deps] of graph) {
    for (const dep of deps) {
      if (inDegree.has(dep)) {
        // node depends on dep, so dep must be processed first
        // That means node has an incoming edge from dep conceptually
        // Actually: if A depends on B, then A must come after B
        // In-degree counts how many things point TO a node
        // If A -> B (A depends on B), B must come first, so A has in-degree from B
      }
    }
  }

  // Let's think again:
  // If A depends on B, we need to process B before A.
  // In topological sort terms: B → A (edge from B to A)
  // So we need to count "who depends on me" = how many outgoing edges I have in reverse
  // Actually standard Kahn: edge u→v means u must come before v
  // Our graph: A depends on B means B must come before A, so edge B→A
  // In our Map: graph.get(A) = Set{B} means A depends on B

  // Rebuild in correct direction
  const reverseDeps = new Map(); // who depends on me
  for (const key of graph.keys()) {
    reverseDeps.set(key, new Set());
  }
  for (const [node, deps] of graph) {
    for (const dep of deps) {
      if (reverseDeps.has(dep)) {
        reverseDeps.get(dep).add(node);
      }
    }
  }

  // In-degree = number of dependencies (things I depend on that exist in graph)
  for (const [node, deps] of graph) {
    let count = 0;
    for (const dep of deps) {
      if (graph.has(dep)) count++;
    }
    inDegree.set(node, count);
  }

  // Start with nodes that have no dependencies
  const queue = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  // Sort queue for deterministic output
  queue.sort();

  const result = [];

  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);

    // For each node that depends on this one, decrease their in-degree
    const dependents = reverseDeps.get(node) ?? new Set();
    const newReady = [];

    for (const dependent of dependents) {
      const newDegree = inDegree.get(dependent) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        newReady.push(dependent);
      }
    }

    // Sort new ready nodes for deterministic output and add to queue
    newReady.sort();
    queue.push(...newReady);
  }

  // Check for cycles
  if (result.length !== graph.size) {
    const remaining = [...graph.keys()].filter((k) => !result.includes(k));
    consola.warn(
      `Warning: Possible circular dependencies involving ${remaining.length} files. ` +
        `Processing them in arbitrary order.`
    );
    // Add remaining in sorted order
    remaining.sort();
    result.push(...remaining);
  }

  return result;
}
