/**
 * Canonicalize a scripture reference.
 *
 * The sources cite the same passage many ways — `Joann`, `Joannes`, `Joann.`,
 * even the English `John` — and a few are simply wrong. Left alone, each
 * spelling becomes its own store key, so one reading is held several times and
 * the reader sees a different citation from one day to the next.
 *
 * This settles a reference to one form: the book to a single Latin
 * abbreviation, the number prefix and punctuation to one shape, and a handful of
 * outright errors to what they meant. It is applied where step 9 first reads a
 * `!ref` marker, so both the reference shown and the store key derived from it
 * inherit the canonical form.
 */

/**
 * Genuine errors in the sources, keyed by the reference *after* the book and
 * punctuation are settled — so `Joannes 21:15-10` is corrected once, however it
 * was spelled. Each is a real mistake a reader would notice, not a variant:
 *
 * - a verse range that runs backwards (`15-10`);
 * - a chapter that does not hold the text (the Canticle of the Three Youths is
 *   Daniel 3, not 5; *Anima nostra* is Psalm 123, not 128).
 */
const CORRECTIONS: Record<string, string> = {
  "Joann 21:15-10": "Joann 21:15-19",
  "Dan 5:58": "Dan 3:58",
  "Ps 128:7": "Ps 123:7",
};

/**
 * A book abbreviation and the forms that mean it. The canonical form is a Latin
 * abbreviation — the store is Latin, so an English `John` or `Acts` is folded in
 * too. Ambiguous pairs are deliberately absent: `Eccl` (Ecclesiastes) and
 * `Eccli` (Ecclesiasticus) are different books, and `Lam`/`Thren` have no
 * settled canonical form here, so each is left as the source wrote it.
 */
const BOOK_ALIASES: Record<string, string> = {
  // The four gospels and the Johannine letters share the abbreviation.
  joannes: "Joann",
  joannnes: "Joann",
  joh: "Joann",
  jo: "Joann",
  john: "Joann",
  matthew: "Matt",
  matth: "Matt",
  luke: "Luc",
  mark: "Marc",
  // Acts and the epistles.
  acts: "Act",
  actus: "Act",
  romans: "Rom",
  ephesians: "Ephes",
  eph: "Ephes",
  philipp: "Phil",
  philip: "Phil",
  philippians: "Phil",
  heb: "Hebr",
  hebrews: "Hebr",
  jas: "Jac",
  james: "Jac",
  petri: "Pet",
  peter: "Pet",
  // The Old Testament.
  isa: "Is",
  isaiah: "Is",
  isaias: "Is",
  exodi: "Exod",
  ex: "Exod",
  hos: "Osee",
  revelation: "Apoc",
  wisdom: "Sap",
};

/**
 * A biblical reference — a book, then a chapter and verse (`Matt 11:25-30`,
 * `1 Cor 1:1`). Only these are canonicalized; a patristic citation
 * (`Lib. 10. cap. 16.`) or an opening-word key (`Sedulius`) is a different kind
 * of thing and is left exactly as it stands.
 */
const BIBLICAL = /^[1-3]?\.?\s*[A-Za-zÀ-ÿ]+\.?\s+\d+\s*[:.]\s*\d/;

/** Split a biblical reference into its number prefix, book token, and the rest. */
const REFERENCE = /^([1-3])?\.?\s*([A-Za-zÀ-ÿ]+)\.?\s+(.*)$/;

/**
 * The canonical form of one reference. A reference that is not biblical — a
 * patristic citation, an opening-word key — is returned trimmed but otherwise
 * untouched, so only scripture citations are folded.
 */
export function canonicalizeRef(ref: string): string {
  if (typeof ref !== "string") return ref;
  const trimmed = ref.trim();
  if (!BIBLICAL.test(trimmed)) return trimmed;

  // A trailing stop is never part of a scripture citation.
  let s = trimmed.replace(/\.+$/, "").trim();

  const m = s.match(REFERENCE);
  if (m) {
    const number = m[1];
    const book = m[2]!;
    const rest = m[3]!.trim();
    const canonicalBook = BOOK_ALIASES[book.toLowerCase()] ?? book;
    s = [number, canonicalBook, rest].filter(Boolean).join(" ");
  }

  return CORRECTIONS[s] ?? s;
}
