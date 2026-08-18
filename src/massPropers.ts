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

/**
 * A sung proper as shipped. Most are an antiphon and a verse; an Alleluia is a
 * list of verses, and the simplest carry only a reference and text.
 */
export type Chant = {
  antiphon?: { ref?: string; text?: string };
  verse?: { ref?: string; text?: string };
  verses?: { ref?: string; text?: string }[];
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

/**
 * Which store each published section draws on.
 *
 * This is the contract between the pipeline and this library: the pipeline puts
 * a section's content in the named store and leaves a key behind, and the reader
 * below looks it up in the same one. The pipeline imports these very sets, so a
 * section can never be stored in one place and looked for in another.
 */
export const READING_SECTIONS = new Set([
  "lectio",
  "evangelium",
  "ultima-evangelium",
]);

export const PRAYER_SECTIONS = new Set(["oratio", "secreta", "postcommunio"]);

export const CHANT_SECTIONS = new Set([
  "introitus",
  "graduale",
  "alleluia",
  "alleluiap",
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

/** Septuagesima Sunday, the ninth Sunday before Easter. */
const SEPTUAGESIMA = -63;

/** The Saturday in the octave of Pentecost, the last day of paschaltide. */
const PASCHALTIDE_LAST_DAY = 55;

/** Whole days from Easter to `date`; negative before it. */
function daysFromEaster(date: Date, easter: Date): number {
  return Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(
        easter.getUTCFullYear(),
        easter.getUTCMonth(),
        easter.getUTCDate()
      )) /
      86_400_000
  );
}

/**
 * True on a day of paschaltide: from Easter Sunday to the Saturday in the
 * octave of Pentecost.
 */
export function isPaschaltide(date: Date, easter: Date): boolean {
  const day = daysFromEaster(date, easter);
  return day >= 0 && day <= PASCHALTIDE_LAST_DAY;
}

/**
 * True from Septuagesima up to Easter — the penitential weeks, when the
 * Alleluia is not sung.
 */
export function isBeforeEaster(date: Date, easter: Date): boolean {
  const day = daysFromEaster(date, easter);
  return day >= SEPTUAGESIMA && day < 0;
}

/** Keys that name the celebration rather than carrying its text. */
const DESIGNATION_KEYS = new Set(["title", "name", "prefatio"]);

/** Rewrite every text a proper holds, leaving what designates the day alone. */
function mapTexts(
  proper: Record<string, unknown>,
  fn: (text: string) => string
): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return fn(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value != null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v),
        ])
      );
    }
    return value;
  };

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(proper)) {
    out[key] = DESIGNATION_KEYS.has(key) ? value : walk(value);
  }
  return out;
}

/**
 * A parenthesised `(Allelúja.)` — said only in paschaltide, and the parentheses
 * say so. A trailing full stop outside them belongs to it.
 */
const OPTIONAL_ALLELUIA = /\s*\(\s*(allel[uú]ja[^)]*?)\s*\)\.?/gi;

/**
 * Resolve the alleluia a chant offers in parentheses: kept through paschaltide,
 * without its parentheses, and dropped from every other season.
 */
function resolveOptionalAlleluia(text: string, paschaltide: boolean): string {
  return text.replace(OPTIONAL_ALLELUIA, (_match, inner: string) => {
    if (!paschaltide) return "";
    const said = inner.replace(/[\s.]+$/, "");
    return ` ${said}.`;
  });
}

/**
 * Replace the `N.` a common leaves for the saint's name.
 *
 * The commons are written for a class of saint and leave the name open; where
 * two are kept together the prayer says `N. et N.`, and the day names both at
 * once, so a whole run of placeholders gives way to the one name. The honorific
 * is dropped: the prayer has already said `beáti`.
 */
export function nameSaint(
  proper: Record<string, unknown>
): Record<string, unknown> {
  const name = typeof proper.name === "string" ? proper.name.trim() : "";
  if (name === "") return proper;
  const said = name.replace(/^(S{1,2}|B{1,2})\.\s*/i, "");
  return mapTexts(proper, (text) =>
    text.replace(/\bN\.(?:\s+et\s+N\.)*/g, said)
  );
}

/**
 * Reduce a day's chants to the ones its season actually sings.
 *
 * A proper carries every chant the year might call for; which of them belongs
 * to this day is a question of the season:
 *
 * - between the Gradual's **Alleluia** and the **Tract**, the penitential weeks
 *   from Septuagesima to Easter take the Tract, and the rest of the year the
 *   Alleluia. A day offering only one of them keeps it whatever the season.
 * - through **paschaltide** the extended Alleluia replaces both the Gradual and
 *   the Alleluia after it; outside the season it is not sung at all.
 * - an **`(Allelúja.)`** a chant offers in parentheses is said in paschaltide,
 *   without them, and left unsaid the rest of the year.
 */
export function applySeason(
  proper: Record<string, unknown>,
  date: Date,
  easter: Date
): Record<string, unknown> {
  const paschaltide = isPaschaltide(date, easter);
  const out = { ...proper };

  if (out.alleluia !== undefined && out.tractus !== undefined) {
    if (isBeforeEaster(date, easter)) delete out.alleluia;
    else delete out.tractus;
  }

  if (paschaltide) {
    if (out.alleluiap !== undefined) {
      delete out.graduale;
      delete out.alleluia;
    }
  } else {
    delete out.alleluiap;
  }

  return mapTexts(out, (text) =>
    resolveOptionalAlleluia(text, paschaltide).trim()
  );
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
