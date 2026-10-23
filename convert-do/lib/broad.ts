/**
 * Broad references — whole-file includes (`@File`, `ex …`) and selective
 * borrows (`vide …`).
 *
 * A broad reference borrows sections whole and never changes their wording, so
 * resolving one is the same operation whatever the sections hold: their lines,
 * before the texts are structured, or their keys into the stores, after. Step 4
 * resolves them on the lines, only to look a target up; step 7 resolves them on
 * the keys, for good.
 */

import { unionDocuments } from "./variants.js";
import { OFFICE_SECTIONS } from "../../src/officium.js";

export type Variant = { value: unknown; condition: string[] };

/** A document: section keys to their rubric variants. */
export type Doc = Record<string, unknown>;

export type Reference = { path: string; condition: string[] };

/** A document by its path below the language root (`Sancti/01-01`). */
export type Load = (path: string) => Doc | undefined;

/**
 * What a borrow takes, which depends on how far the sections have been
 * structured.
 *
 * - `massPropers` — the Mass sections a `vide` takes only where the day has
 *   none of its own.
 * - `liftedFrom` — sections step 5 lifts out of another; a borrowing takes or
 *   leaves them exactly as it takes or leaves the section they came from.
 * - `withheldFrom` — by source, the sections its documents never take: the
 *   Mass takes none of the Office, which the day's Office document takes for
 *   itself. Taken by the Mass too, the common's copy would win when the two are
 *   combined (step 8), over the day's own.
 */
export type BorrowRules = {
  massPropers: ReadonlySet<string>;
  liftedFrom: Readonly<Record<string, string>>;
  withheldFrom: Readonly<Record<string, ReadonlySet<string>>>;
};

/** The Office's sections, which the Mass (`missa`) does not take. */
const WITHHELD_FROM = { missa: new Set(OFFICE_SECTIONS) };

const MASS_PROPERS = [
  "introitus",
  "graduale",
  "tractus",
  "evangelium",
  "offertorium",
  "secreta",
  "communio",
  "postcommunio",
  "ultima-evangelium",
];

/** The rules on the lines, before step 5 structures them. */
export const LINE_RULES: BorrowRules = {
  massPropers: new Set([...MASS_PROPERS, "gradualep"]),
  liftedFrom: {},
  withheldFrom: WITHHELD_FROM,
};

/**
 * The rules on the keys, after step 5: the paschal Alleluia goes by its
 * structured name, and the Alleluia and the Preface go with the Gradual and the
 * rule they were lifted out of.
 */
export const KEYED_RULES: BorrowRules = {
  massPropers: new Set([...MASS_PROPERS, "alleluia", "alleluiap"]),
  liftedFrom: { alleluia: "graduale", prefatio: "rule" },
  withheldFrom: WITHHELD_FROM,
};

/** The antiphons of the *Magnificat* and the *Benedictus*. */
const GOSPEL_CANTICLE_ANTIPHONS = new Set(["ant-1", "ant-2", "ant-3"]);

/**
 * The Office texts a day takes from its common, which a `vide` always borrows:
 * the lessons, the orations, the invitatory, the hymns, chapters, responsories
 * and versicles, and the antiphons of the *Magnificat* and the *Benedictus*.
 *
 * Not the psalmody. A day that only borrows from its common says the psalms of
 * the day of the week with their own antiphons, and takes the common's — at
 * Matins, Lauds, Vespers or the small Hours — only by including it. This is how
 * Divinum Officium reads a `vide`.
 */
function isOfficeBorrow(key: string): boolean {
  return (
    key.startsWith("lectio") ||
    key.startsWith("oratio") ||
    key === "invit" ||
    key.startsWith("hymnus") ||
    key.startsWith("capitulum") ||
    key.startsWith("responsory") ||
    key.startsWith("versum") ||
    /^nocturn-\d+-versum$/.test(key) ||
    GOSPEL_CANTICLE_ANTIPHONS.has(key)
  );
}

/** True when a section is already resolved, and needs no filling in. */
function hasContent(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function variantsOf(value: unknown): Variant[] {
  return Array.isArray(value) ? (value as Variant[]) : [];
}

export function extractExVideReferences(
  obj: Doc,
  ownPath: string
): { ex: Reference[]; vide: Reference[] } {
  const ex: Reference[] = [];
  const vide: Reference[] = [];

  for (const variant of variantsOf(obj.__preamble)) {
    for (const line of linesOf(variant)) {
      if (line.startsWith("@")) {
        const path = line.slice(1).split(":")[0]!.trim();
        if (path) ex.push({ path, condition: variant.condition });
      }
    }
  }

  for (const variant of variantsOf(obj.rank)) {
    for (const line of linesOf(variant)) {
      const reference = line.split(";;")[3]?.trim();
      if (reference?.startsWith("ex ")) {
        ex.push({ path: reference.slice(3), condition: variant.condition });
      } else if (reference?.startsWith("vide ")) {
        vide.push({ path: reference.slice(5), condition: variant.condition });
      } else if (reference) {
        // A bare reference with no `ex`/`vide` keyword (e.g. `C5c`) is a commune
        // pointer; treat it as `vide` — borrow the standard sections — which is
        // its conventional meaning in a rank line.
        vide.push({ path: reference, condition: variant.condition });
      }
    }
  }

  for (const variant of variantsOf(obj.rule)) {
    for (const line of linesOf(variant)) {
      if (line.startsWith("ex ")) {
        ex.push({ path: line.slice(3), condition: variant.condition });
      } else if (line.startsWith("vide ")) {
        vide.push({ path: line.slice(5), condition: variant.condition });
      }
    }
  }

  return {
    ex: cleanReferences(ex, ownPath),
    vide: cleanReferences(vide, ownPath),
  };
}

/** A variant's lines, where it holds lines. */
function linesOf(variant: Variant): string[] {
  return Array.isArray(variant.value)
    ? variant.value.filter((line): line is string => typeof line === "string")
    : [];
}

function cleanReferences(references: Reference[], ownPath: string): Reference[] {
  return references
    .map((item) => {
      let path = item.path
        .replace(";mtv", "")
        .replaceAll(";", "")
        .replaceAll(":", "")
        .replace("sancti/", "Sancti/")
        .trim();
      // A copy: the condition is the variant's own, and is not ours to extend.
      const condition = [...item.condition];

      if (path.includes("Feria")) {
        const match = path.match(/(\d+)Feria/);
        path = path.replace("Feria", "");
        if (match) condition.push(`feria-${Number(match[1]) + 1}`);
      }

      if (path[0] === "C" && path[1]! >= "0" && path[1]! <= "9") {
        path = `Commune/${path}`;
      }
      if (
        path.startsWith("Quadp") ||
        path.startsWith("Epi") ||
        path.startsWith("Pasc")
      ) {
        path = `Tempora/${path}`;
      }

      // Variant-directory and filename rubric suffixes are deliberately NOT
      // stripped: until step 8 folds them, the specific variant file exists, so
      // the reference resolves directly to it.

      if (path === "Tempora/Pasc5-4 (rubrica tridentina aut rubrica divino)") {
        path = "Tempora/Pasc5-4";
        condition.push("1570", "1913");
      }
      if (path === "Tempora/Epi4") {
        path = "Tempora/Epi4-0";
      }

      return { path, condition };
    })
    .filter((item) => item.path !== ownPath);
}

/** Every file a document borrows from, by path below the language root. */
export function referencedPaths(obj: Doc, ownPath: string): Set<string> {
  const { ex, vide } = extractExVideReferences(obj, ownPath);
  return new Set([...ex, ...vide].map((item) => item.path));
}

/**
 * The document with the sections its broad references name merged in. The
 * `__preamble` is kept; the resolver removes it once the document is done.
 */
export function importReferences(
  obj: Doc,
  ownPath: string,
  load: Load,
  rules: BorrowRules,
  withheld: ReadonlySet<string> = new Set()
): Doc {
  const result: Doc = { ...obj };
  const { ex, vide } = extractExVideReferences(obj, ownPath);

  for (const reference of [...ex, ...vide]) {
    const file = load(reference.path);
    if (!file) continue;
    const isInclude = ex.includes(reference);
    // Judged against what the day held before this reference: a section and
    // the one lifted out of it are taken from one file, or left together.
    const before: Doc = { ...result };

    for (const [key, value] of Object.entries(file)) {
      if (!Array.isArray(value) || withheld.has(key)) continue;
      const parent = rules.liftedFrom[key];

      if (!isInclude && !isOfficeBorrow(key)) {
        // A Mass proper travels with a borrow only where normal resolution —
        // the day's own text, and anything an `ex` already included — has left
        // nothing in its place. A lifted section is judged by its parent.
        if (!rules.massPropers.has(key) || hasContent(before[parent ?? key]))
          continue;
      }

      const imported = (value as Variant[]).map((item) => ({
        ...item,
        condition: [...reference.condition, ...item.condition],
      }));

      // What the day already holds is its own proper text and takes precedence;
      // an import only fills a gap. So the day's variants are kept as they are,
      // and an imported one is added only where none of them would already
      // apply in its place — that is, where no existing variant's condition is
      // satisfied whenever the import's is.
      //
      // Matching whole condition sets is not enough. The Assumption gives its
      // own Introit unconditionally, while its rank line includes a common under
      // the 1962 rubric. Imported at `1962` that out-ranks the day's own `[]`
      // wherever 1962 is in force, and the common is sung in place of
      // `Signum magnum`.
      const existing = variantsOf(result[key]);
      const guards = parent ? [...variantsOf(before[parent]), ...existing] : existing;
      const gaps = imported.filter(
        (incoming) =>
          !guards.some((own) =>
            own.condition.every((token) => incoming.condition.includes(token))
          )
      );
      if (result[key] === undefined && gaps.length === 0) continue;
      result[key] = [...existing, ...gaps];
    }
  }

  return result;
}

/** A day's documents by source — its Office (`horas`) and its Mass (`missa`). */
export type SourcedLoad = (source: string, path: string) => Doc | undefined;

/**
 * Resolve documents, each once, where a day may be several documents — its
 * Office and its Mass — that each resolve their own references.
 *
 * A document borrows from a target as the target stands once its own references
 * are resolved, and **with its sources together** (`view`): the Office and the
 * Mass of the target unioned by condition, a later source in `sources` winning
 * a collision. Whether a day still misses a section is judged on the borrowing
 * document alone — a Mass with no Gospel of its own takes the common's, whatever
 * the Office holds.
 *
 * Where documents borrow from each other, the one reached second through the
 * cycle finds the other still being resolved, and borrows nothing from it.
 * Visiting the documents in a fixed order keeps that the same on every run.
 */
export function createSourcedResolver(
  load: SourcedLoad,
  sources: readonly string[],
  rules: BorrowRules
): {
  resolve: (source: string, path: string) => Doc | undefined;
  view: Load;
} {
  const done = new Map<string, Doc | undefined>();
  const inProgress = new Set<string>();
  const views = new Map<string, Doc | undefined>();
  const id = (source: string, path: string) => `${source} ${path}`;
  const anyInProgress = (path: string) =>
    sources.some((source) => inProgress.has(id(source, path)));

  function resolve(source: string, path: string): Doc | undefined {
    const key = id(source, path);
    if (done.has(key)) return done.get(key);
    if (inProgress.has(key)) return undefined;
    const raw = load(source, path);
    if (raw === undefined) {
      done.set(key, undefined);
      return undefined;
    }
    inProgress.add(key);
    const resolved = importReferences(raw, path, view, rules, rules.withheldFrom[source]);
    delete resolved.__preamble;
    inProgress.delete(key);
    done.set(key, resolved);
    return resolved;
  }

  function view(path: string): Doc | undefined {
    if (views.has(path)) return views.get(path);
    // A target still being resolved has nothing to lend yet; nor is a view of
    // it kept, since it will have once it is done.
    if (anyInProgress(path)) return undefined;
    let combined: Doc | undefined;
    for (const source of sources) {
      const doc = resolve(source, path);
      if (doc === undefined) continue;
      combined = combined === undefined ? doc : unionDocuments(combined, doc);
    }
    views.set(path, combined);
    return combined;
  }

  return { resolve, view };
}

/** Resolve documents by path, each once — one document to a path. */
export function createBroadResolver(
  load: Load,
  rules: BorrowRules
): { resolve: Load } {
  const sourced = createSourcedResolver((_, path) => load(path), [""], rules);
  return { resolve: (path) => sourced.resolve("", path) };
}

/**
 * The document with the base language's rank, where a translation has none of
 * its own: the rank names the common a day draws on, and is the same in every
 * language.
 */
export function withBaseRank(
  doc: Doc | undefined,
  baseDoc: Doc | undefined
): Doc | undefined {
  if (doc === undefined || doc.rank !== undefined) return doc;
  if (baseDoc?.rank === undefined) return doc;
  return { ...doc, rank: baseDoc.rank };
}
