/**
 * Selecting a mass proper for a given rubric.
 *
 * The pipeline ships every rubric variant of a section, alongside a store of
 * readings that sections refer to by key. Resolving both is a calendar-time
 * concern: which rubric applies depends on the calendar being generated, not on
 * how the sources were converted.
 */

/**
 * A section as shipped: one entry per rubric the section varies by. A variant
 * with no `condition` is the unconditional one — step 11 omits an empty
 * condition rather than writing it out.
 */
export type Variant = { value: unknown; condition?: string[] };

/** A reading as shipped, either whole or referred to by key. */
export type Reading =
  | { ref?: string; verses: string[] }
  | { ref?: string; text: string };

/** A prayer as shipped, either whole or referred to by key. */
export type Prayer = { text: string; closure?: string };

/** A sung proper as shipped: an antiphon and verse, sometimes an alleluia. */
export type Chant = {
  antiphon?: { ref?: string; text?: string };
  verse?: { ref?: string; text?: string };
  alleluia?: { ref?: string; text?: string };
  ref?: string;
  text?: string;
};

export type LectioStore = Record<string, Reading>;
export type PrayerStore = Record<string, Prayer>;
export type ChantStore = Record<string, Chant>;

/** The stores, and the sections whose value may be a key into each. */
export type Stores = {
  readings: LectioStore;
  prayers: PrayerStore;
  chants: ChantStore;
};

const READING_SECTIONS = new Set(["lectio", "evangelium", "ultima-evangelium"]);
const PRAYER_SECTIONS = new Set(["oratio", "secreta", "postcommunio"]);
const CHANT_SECTIONS = new Set([
  "introitus",
  "graduale",
  "gradualep",
  "tractus",
  "offertorium",
  "communio",
]);

function isVariantArray(value: unknown): value is Variant[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item != null &&
        typeof item === "object" &&
        "value" in item &&
        // Absent means unconditional; anything else must be a token list.
        ((item as Variant).condition === undefined ||
          Array.isArray((item as Variant).condition))
    )
  );
}

/** A variant's rubric tokens; absent means unconditional. */
function conditionOf(variant: Variant): string[] {
  return variant.condition ?? [];
}

/**
 * Pick the variant that applies under `rubrics`.
 *
 * A variant applies when every token of its condition is one the caller holds,
 * so a section may narrow by rubric but never demand one that is not in force.
 * The most specific applicable variant wins; the unconditional variant is the
 * least specific and so acts as the fallback.
 *
 * The pipeline drops variants that merely repeat the unconditional one, so this
 * fallback is what makes a collapsed section resolve to the same content it held
 * before. Without it, days would silently lose text.
 *
 * Returns undefined when nothing applies — a section may vary only by rubrics
 * none of which are in force, and then it has nothing to say for this calendar.
 */
export function selectVariant(
  section: unknown,
  rubrics: ReadonlySet<string>
): unknown | undefined {
  if (!isVariantArray(section)) return section;

  let best: Variant | undefined;
  let bestLength = -1;
  for (const variant of section) {
    const condition = conditionOf(variant);
    if (!condition.every((token) => rubrics.has(token))) continue;
    if (condition.length > bestLength) {
      best = variant;
      bestLength = condition.length;
    }
  }
  return best?.value;
}

/**
 * Replace a store key by the text it names. A value that is not a key was
 * shipped whole and stands for itself.
 */
export function resolveStored(
  value: unknown,
  store: Record<string, unknown>
): unknown | undefined {
  if (typeof value !== "string") return value;
  return store[value];
}

/** Kept for callers that only deal in readings. */
export const resolveReading = resolveStored;

/** The store a section draws on, or undefined when it holds its own content. */
function storeFor(key: string, stores: Stores): Record<string, unknown> | undefined {
  if (READING_SECTIONS.has(key)) return stores.readings;
  if (PRAYER_SECTIONS.has(key)) return stores.prayers;
  if (CHANT_SECTIONS.has(key)) return stores.chants;
  return undefined;
}

/**
 * Reduce a shipped document to the sections that apply under `rubrics`, with
 * readings and prayers resolved against their stores. A section with nothing
 * applicable is left out entirely rather than carried as undefined.
 */
export function selectMassProper(
  document: Record<string, unknown>,
  rubrics: ReadonlySet<string>,
  stores: Stores
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, section] of Object.entries(document)) {
    const value = selectVariant(section, rubrics);
    if (value === undefined) continue;
    const store = storeFor(key, stores);
    const resolved = store ? resolveStored(value, store) : value;
    if (resolved === undefined) continue;
    out[key] = resolved;
  }
  return out;
}
