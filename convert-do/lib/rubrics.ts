/**
 * The rubric systems a variant can be conditioned on, and the one the published
 * calendar follows. Shared so the naming step (7) and the publishing step (11)
 * judge them the same way.
 */

/** The publishable rubric: the edition the shipped calendar follows. */
export const PUBLISHED_RUBRIC = "1962";

/**
 * The **editions** — successive revisions of the same books. Only one is ever in
 * force, so a text belonging to another edition is not part of the published
 * calendar at all.
 */
const EDITIONS = new Set([
  "1570", "1617", "1888", "1906", "1910", "1913", "1930", "1939",
  "1951", "1955", "1962", "1963", "2020",
]);

/**
 * The **uses** — the orders and traditions that keep their own books alongside
 * the Roman. Unlike editions, these run in parallel: `monastica` and the Roman
 * are both current, just for different communities.
 */
const USES = new Set([
  "monastica", "cisterciensis", "praedicatorum", "altovadensis",
  "divino", "summorum", "trident", "barroux",
]);

/** A rubric system is an edition, a use, or a local (`dioecesis …`) one. */
const RUBRIC_SYSTEMS = new Set([...EDITIONS, ...USES]);

/** The bare word of a token: sources vary in case and carry a stray grammar `^`. */
function bare(token: string): string {
  return token.replace(/^\^/, "").trim().toLowerCase();
}

/** True when `token` names a rubric system other than the one in force. */
export function isOtherRubricSystem(token: string, inForce: string): boolean {
  const t = bare(token);
  if (t === inForce.toLowerCase()) return false;
  if (/^(dioecesis|civitate)\s/.test(t)) return true;
  return RUBRIC_SYSTEMS.has(t) || RUBRIC_SYSTEMS.has(t.replace(/^rubrica/, ""));
}

/**
 * True when a condition requires an **edition** other than the one published.
 * Such a text can never apply when that calendar is generated, so it should
 * neither be published nor lend its name to a file. A different *use* does not
 * count: those run in parallel and their texts (and names) are kept.
 */
export function requiresOtherEdition(
  condition: string[],
  inForce: string = PUBLISHED_RUBRIC
): boolean {
  return condition.some((token) => {
    const t = bare(token);
    return EDITIONS.has(t) && t !== inForce.toLowerCase();
  });
}
