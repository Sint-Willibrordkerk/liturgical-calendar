export const namedDates = ["easter", "advent"] as const;

/** The colors of the vestments (rubricae generales nn. 117–134). */
export const colors = [
  "white",
  "red",
  "green",
  "violet",
  "rose",
  "black",
] as const;

/**
 * The seasons of the year (nn. 71–78), named as the rubrics name them. The time
 * outside the seasons proper — after the Epiphany, and after Pentecost — is
 * `per-annum`.
 */
export const seasons = [
  "adventus",
  "nativitatis",
  "epiphaniae",
  "per-annum",
  "septuagesimae",
  "quadragesimae",
  "passionis",
  "paschatis",
  "ascensionis",
  "pentecostes",
] as const;

export const weekdays = {
  dominica: 0,
  feriaII: 1,
  feriaIII: 2,
  feriaIV: 3,
  feriaV: 4,
  feriaVI: 5,
  sabbato: 6,
};
