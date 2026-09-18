/**
 * Acute accents, for reconciling two store entries that collide on one key.
 *
 * The sources spell the same word now with its acute accent, now without —
 * `Prophéta` here, `Propheta` there. Latin's acute marks the stressed syllable
 * and does not change the word, so where two entries would take the same store
 * key and differ only by acute accents, they are one entry and the fuller,
 * accented spelling is kept (see the store in `step10.ts`).
 *
 * Only the acute is folded. A ligature (`cœli` against `coeli`) or a letter
 * change (`ejus` against `eius`) is a different spelling, not an accent, and is
 * left as the source carried it.
 */

const COMBINING_ACUTE = /́/g;

/** The text with its acute accents removed, its other marks and case kept. */
export function foldAcute(text: string): string {
  return text.normalize("NFD").replace(COMBINING_ACUTE, "").normalize("NFC");
}

/** How many acute accents the text carries. */
export function acuteCount(text: string): number {
  return (text.normalize("NFD").match(COMBINING_ACUTE) ?? []).length;
}
