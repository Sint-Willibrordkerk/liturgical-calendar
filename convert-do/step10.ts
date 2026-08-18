import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import {
  STEP_EXT,
  parseStep,
  stringifyStep,
} from "./lib/serialize.js";
import { consola } from "consola";
import { collectYmlFiles, ensureDir } from "./lib/batch";
import { isVariantArray, type Variant } from "./lib/variants";
// The calendar library owns which store each section draws on; the stores are
// built from the very same sets, so nothing is filed where no one looks.
import {
  READING_SECTIONS,
  PRAYER_SECTIONS,
  CHANT_SECTIONS,
} from "../src/massPropers.js";

/**
 * Step 10 — shared lectio store and variant collapse.
 *
 * The mass readings are lifted into one store per language root and replaced by
 * a key, since the same pericope is read on many days and under many rubrics.
 * Afterwards every section drops the rubric variants that merely repeat its
 * default variant, so a variant survives only where the rubric actually changes
 * something. Collapsing runs after substitution so the covered sections compare
 * short keys instead of full readings.
 */
export type Step10Output = { [key: string]: unknown };


/** The Matins readings, including the forms placing one elsewhere in the Office. */
const MATINS_READING = /^lectio\d+(-in-\d+-loco)?$/;

/**
 * True for a section whose values are lifted into the store. Mass and Matins
 * readings share it: the same scripture read at Mass on one day and at Matins on
 * another is stored once.
 */
export function isReadingSection(key: string): boolean {
  return READING_SECTIONS.has(key) || MATINS_READING.test(key);
}

/** True for a section whose values are lifted into the prayer store. */
export function isPrayerSection(key: string): boolean {
  return PRAYER_SECTIONS.has(key);
}

/** True for a section whose values are lifted into the chant store. */
export function isChantSection(key: string): boolean {
  return CHANT_SECTIONS.has(key);
}

/**
 * What a store holds: a reading (verses or text, usually with a reference), a
 * prayer (text and a closure), or a chant (an antiphon and verse, sometimes an
 * alleluia). They differ in shape but are stored the same way — whole, under a
 * key the day files refer to.
 */
export type LectioEntry = Record<string, unknown>;
export type LectioEntries = Record<string, LectioEntry>;

type Part = { ref?: unknown; text?: unknown };

/** The antiphon of a chant, where the value is one. */
function antiphonOf(value: LectioEntry): Part | undefined {
  const antiphon = value.antiphon;
  return antiphon != null && typeof antiphon === "object" && !Array.isArray(antiphon)
    ? (antiphon as Part)
    : undefined;
}

/**
 * The entry's own words — what its key is built from, and what tells an empty
 * value from a real one. A chant speaks through its antiphon.
 */
function entryText(value: LectioEntry): string {
  if (Array.isArray(value.verses)) {
    // A reading's verses are plain strings; a chant's carry their own reference.
    return value.verses
      .map((v) => (typeof v === "string" ? v : String((v as Part)?.text ?? "")))
      .join("\n");
  }
  if (typeof value.text === "string") return value.text;
  const antiphon = antiphonOf(value);
  return antiphon && typeof antiphon.text === "string" ? antiphon.text : "";
}

/** The entry's reference, if it has one. A chant borrows its antiphon's. */
function entryRef(value: LectioEntry): unknown {
  if (value.ref != null && value.ref !== "") return value.ref;
  // An Alleluia is keyed by its first verse's reference.
  if (Array.isArray(value.verses)) {
    const first = value.verses[0];
    if (first != null && typeof first === "object") {
      const ref = (first as Part).ref;
      if (ref != null && ref !== "") return ref;
    }
  }
  return antiphonOf(value)?.ref;
}

/** A value a store can hold: an object carrying words of its own. */
function isStorable(value: unknown): value is LectioEntry {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    entryText(value as LectioEntry).trim() !== ""
  );
}

/**
 * A reading whose content is only an unresolved reference — a lone `@…` line
 * step 5 could not resolve. It is a placeholder, not a reading.
 */
function isUnresolvedReference(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("@") && !trimmed.includes("\n");
}

/**
 * A value's identity, for telling two entries under one key apart. It covers the
 * whole value, not just the words the key is built from: two prayers may share
 * their text and differ only in their closure, and both must survive.
 */
function identityOf(value: LectioEntry): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0
      )
    )
  );
}

/** A short, stable hash of a reading's content. */
function contentHash(text: string): string {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The opening words of a reading, for a key that is still readable. */
function openingWords(text: string, count = 4): string {
  const words = text.trim().split(/\s+/).slice(0, count).join(" ");
  return refToKey(words) ?? "";
}

/**
 * The store key for a scripture reference, or null when there is none. Accents
 * are folded, so a reading keys the same however its source spelled it.
 */
export function refToKey(ref: unknown): string | null {
  if (ref == null) return null;
  const key = String(ref)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9æœ]+/g, "-")
    .replace(/^-|-$/g, "");
  return key === "" ? null : key;
}

export type LectioStore = {
  /**
   * Take a reading into the store and return its key. Returns null for a value
   * that is not a reading, or carries no reference — those stay inline.
   */
  intern(value: unknown): string | null;
  entries(): LectioEntries;
};

/**
 * A store accumulating readings across every document of one language root.
 * Two readings sharing a reference but differing in text are both kept: the
 * first takes the plain key, each further one a counter suffix. Interning the
 * same text again returns the key it was first given.
 */
export function createLectioStore(): LectioStore {
  const entries: LectioEntries = {};
  // base key -> text -> assigned key
  const assigned = new Map<string, Map<string, string>>();

  return {
    intern(value: unknown): string | null {
      if (!isStorable(value)) return null;
      const text = entryText(value);
      if (isUnresolvedReference(text)) return null;

      const base =
        refToKey(entryRef(value)) ??
        // No reference: the opening words keep the key readable, the hash keeps
        // two readings that open alike apart.
        `${openingWords(text)}-${contentHash(text)}`.replace(/^-/, "");

      let seenHere = assigned.get(base);
      if (!seenHere) {
        seenHere = new Map();
        assigned.set(base, seenHere);
      }

      const identity = identityOf(value);
      const seen = seenHere.get(identity);
      if (seen != null) return seen;

      const key = seenHere.size === 0 ? base : `${base}-${seenHere.size + 1}`;
      seenHere.set(identity, key);
      entries[key] = value;
      return key;
    },
    entries: () => entries,
  };
}

/** Replace the values of the sections `covers` selects by their store key. */
function substituteInto(
  obj: Record<string, unknown>,
  store: LectioStore,
  covers: (key: string) => boolean
): Step10Output {
  const out: Step10Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!covers(key) || !isVariantArray(value)) {
      out[key] = value;
      continue;
    }
    out[key] = value.map((variant) => {
      const stored = store.intern(variant.value);
      return stored == null
        ? variant
        : { value: stored, condition: variant.condition };
    });
  }
  return out;
}

/** Replace every reading by its key in the reading store. */
export function substituteLectio(
  obj: Record<string, unknown>,
  store: LectioStore
): Step10Output {
  return substituteInto(obj, store, isReadingSection);
}

/** Replace every prayer by its key in the prayer store. */
export function substitutePrayers(
  obj: Record<string, unknown>,
  store: LectioStore
): Step10Output {
  return substituteInto(obj, store, isPrayerSection);
}

/** Replace every chant by its key in the chant store. */
export function substituteChants(
  obj: Record<string, unknown>,
  store: LectioStore
): Step10Output {
  return substituteInto(obj, store, isChantSection);
}

/** True for the section's default (unconditional) variant. */
function isDefault(variant: Variant): boolean {
  return variant.condition.length === 0;
}

/**
 * Drop every variant whose value repeats the section's default. A section
 * without a default is left untouched: there would be nothing to fall back to,
 * so removing any of its variants would change which rubrics resolve to which
 * content.
 */
export function collapseVariants(obj: Record<string, unknown>): Step10Output {
  const out: Step10Output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!isVariantArray(value)) {
      out[key] = value;
      continue;
    }
    const fallback = value.find(isDefault);
    if (fallback === undefined) {
      out[key] = value;
      continue;
    }
    const fallbackValue = JSON.stringify(fallback.value);
    out[key] = value.filter(
      (variant) =>
        variant === fallback || JSON.stringify(variant.value) !== fallbackValue
    );
  }
  return out;
}

/**
 * Substitute the readings and the prayers, then collapse the redundant
 * variants. Collapsing runs last so the covered sections compare short keys
 * rather than full texts.
 */
export function transform(
  obj: Record<string, unknown>,
  store: LectioStore,
  prayerStore: LectioStore = createLectioStore(),
  chantStore: LectioStore = createLectioStore()
): Step10Output {
  return collapseVariants(
    substituteChants(
      substitutePrayers(substituteLectio(obj, store), prayerStore),
      chantStore
    )
  );
}

/** The language root a relative path sits under, e.g. `la/Sancti/x.yml` -> `la`. */
function languageRoot(relPath: string): string {
  const [first] = relPath.split(/[/\\]/);
  return first ?? "";
}

/**
 * Batch runner: reads all `.yml` under `inputDir`, writes the rewritten tree to
 * `outputDir` plus a `lectio.yml` per language root.
 *
 * Documents are visited one at a time in sorted path order, so the keys a
 * collided reference receives — and therefore the store file — are the same on
 * every run over the same tree. A document is written as soon as it has been
 * transformed: a key is never reassigned once given, so a document substituted
 * against a partly grown store holds the same keys it would against the
 * finished one. Holding the whole tree in memory is not an option at this size.
 */
export async function run(
  inputDir: string,
  outputDir: string
): Promise<{ written: number }> {
  const allRelPaths = await collectYmlFiles(inputDir);
  const mkdirCache = new Set<string>();

  const byLanguage = new Map<string, string[]>();
  for (const relPath of [...allRelPaths].sort()) {
    const lang = languageRoot(relPath);
    if (!byLanguage.has(lang)) byLanguage.set(lang, []);
    byLanguage.get(lang)!.push(relPath);
  }

  let written = 0;
  let errors = 0;

  for (const [lang, relPaths] of byLanguage) {
    const store = createLectioStore();
    const prayerStore = createLectioStore();
    const chantStore = createLectioStore();

    for (const relPath of relPaths) {
      try {
        const raw = await readFile(join(inputDir, relPath), "utf-8");
        const obj = parseStep(raw);
        if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
          throw new Error("Expected object");
        }
        const outPath = join(outputDir, relPath);
        await ensureDir(outPath, mkdirCache);
        await writeFile(
          outPath,
          stringifyStep(
            transform(
              obj as Record<string, unknown>,
              store,
              prayerStore,
              chantStore
            )
          ),
          "utf-8"
        );
        written++;
      } catch (err) {
        errors++;
        consola.error(`Error processing ${relPath}:`, (err as Error).message);
      }
    }

    for (const [name, s] of [
      ["lectio" + STEP_EXT, store],
      ["oratio" + STEP_EXT, prayerStore],
      ["antiphona" + STEP_EXT, chantStore],
    ] as const) {
      const storePath = join(outputDir, lang, name);
      await ensureDir(storePath, mkdirCache);
      await writeFile(storePath, stringifyStep(s.entries()), "utf-8");
    }
  }

  if (errors > 0) {
    consola.error(`Step 10 errors: ${errors}`);
  }

  return { written };
}
