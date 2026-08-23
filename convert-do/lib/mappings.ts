/**
 * Rubric-token tables derived from directory and filename suffixes. Shared by
 * the suffix→conditions step and the broad-reference step (which strips the
 * same suffixes when normalizing a referenced path), so they live in a neutral
 * module to avoid a circular import between those steps.
 */

/** Variant-directory suffix (kebab-cased) → rubric token. */
export const directoryMappings = {
  cist: "cisterciensis",
  m: "monastica",
  op: "praedicatorum",
  "1570": "1570",
  "1955r": "1955",
  "1960": "1962",
};

/** Filename suffix → rubric token(s), consulted in order (specific first). */
export const mappings = [
  ["-Septem", ["septem-dolorum"]],
  ["Coct", ["cisterciensis", "octava"]],
  ["cist", ["cisterciensis"]],
  ["octt", ["octava", "commemoratio"]],
  ["-oct", ["octava"]],
  ["-sab", ["feria-7"]],
  ["Pasc", ["paschali"]],
  ["sab", ["feria-7"]],
  ["oct", ["octava"]],
  ["bmv", ["1888"]],
  ["def", ["defunctorum"]],
  ["-da", ["1913"]],
  ["cc", ["commemoratio"]],
  ["AV", ["altovadensis"]],
  ["oM", ["monastica"]],
  ["tt", ["transfer", "1570"]],
  ["oc", ["occurentia"]],
  ["da", ["1913"]],
  ["OP", ["praedicatorum"]],
  ["M", ["monastica"]],
  ["q", ["quadragesima"]],
  ["o", ["1888"]],
  ["r", ["1962"]],
  ["n", ["2020"]],
  ["p", ["paschali"]],
  ["t", ["1570"]],
  ["g", ["1913"]],
  ["C", ["cisterciensis"]],
  ["a", ["special-a"]],
  ["b", ["special-b"]],
  ["c", ["special-c"]],
  ["s", ["special-s"]],
  ["A", ["adventus"]],
  ["N", ["nativitatis"]],
  ["Q", ["septuagesimae"]],
  ["v", ["vigilia"]],
] as const;
