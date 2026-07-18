# convert-do — Pipeline Specification

This document is the precise, per-step specification for the `convert-do/`
pipeline, which converts source files from the [Divinum
Officium](https://www.divinumofficium.com) project into normalized YAML.

Where [AGENTS.md](AGENTS.md) explains *how to run* the pipeline, this document
specifies *what each step guarantees*: its inputs, its outputs, the
transformation it performs, the resulting data shape, and its handling of
boundary cases. It describes observable behavior, not implementation. Section
numbering follows the step numbers (step 0 … step 10).

## Conventions used in this document

- **Input** — what the step consumes, and from where.
- **Output** — what the step produces, and its on-disk shape.
- **Transformation** — the guaranteed mapping from input to output.
- **Path mapping** — how an input path determines an output path (where
  relevant).
- **Edge cases** — defined behavior for boundary and unusual inputs.

Paths are shown with the Windows separator (`\`); on other platforms the
separator differs but the path structure is identical.

The pipeline runs in two modes:

- **Streaming (steps 0–7)** — each source file is processed independently and
  passed through every step in the requested range before being written once.
- **Batch (steps 8–10)** — whole-directory passes that may produce several
  outputs from one input, or merge content across inputs. Each batch step fully
  rebuilds its output directory.

---

## Step 0 — Text file to line array

Turns a raw Divinum Officium text source into a sequence of lines, and
establishes the output path — and thereby the language namespace — used by the
rest of the pipeline.

### Input

- **Source location:** the pipeline reads from a configured Divinum Officium
  repository. Sources live under the repository's `web/www` directory; that
  directory is the base for all step-0 paths.
- **Scanned trees:** two source trees under the base — `horas` and `missa` —
  scanned recursively.
- **File selection:** a candidate is included only if all of the following
  hold:
  - it is a text (`.txt`) file;
  - it is not under a `Help/` or `Latin-gabc/` directory;
  - it is not one of the excluded auxiliary files. Excluded are the
    per-language phonetic and tooling files and a small set of named sources:
    `*pl.txt`, `*tts.txt`, `ruler.txt`, `Linguae.txt`, `source.txt`,
    `sundaytable.txt`, `Mobile.txt`, `XPRex.txt`, `02-02-quadp.txt`,
    `dom-oct.txt`, `Quad5-5Feriarc.txt`, `Propaganda.txt`.

  Every language folder present in the source is eligible; each maps to an ISO
  code on output (see [Path mapping](#path-mapping)).

### Output

- One YAML file per accepted source file, under `.divinum-officium\step0\`.
- Contents: a YAML sequence of strings — one entry per source line.

### Transformation

- Surrounding blank space is removed from the whole file first (leading and
  trailing blank lines and whitespace do not appear in the output).
- The remaining text is divided into lines at each line break; both LF and CRLF
  line endings are recognized.
- Interior blank lines are preserved; only the outer edges are trimmed.

Examples:

- `"a\nb\r\nc"` → `["a", "b", "c"]`
- `"\n\nx\n"` → `["x"]`
- `"  a\nb  "` → `["a", "b"]`

### Path mapping

An output path is derived from the source path by:

1. Changing the file extension from `.txt` to `.yml`.
2. Replacing the language-folder segment with its ISO code:

   | Folder            | Code          |
   | ----------------- | ------------- |
   | `Bohemice`        | `cs`          |
   | `Cesky-Schaller`  | `cs-schaller` |
   | `Dansk`           | `da`          |
   | `Deutsch`         | `de`          |
   | `English`         | `en`          |
   | `Espanol`         | `es`          |
   | `Francais`        | `fr`          |
   | `Italiano`        | `it`          |
   | `Latin-Bea`       | `la-bea`      |
   | `Latin`           | `la`          |
   | `Magyar`          | `hu`          |
   | `Nederlands`      | `nl`          |
   | `Polski-Newer`    | `pl-new`      |
   | `Polski`          | `pl`          |
   | `Portugues`       | `pt`          |
   | `Ukrainian`       | `uk`          |
   | `Vietnamice`      | `vi`          |

   The more specific folder wins where names overlap (`Latin-Bea` before
   `Latin`, `Polski-Newer` before `Polski`).

   Examples:
   - `missa\Latin\02-02.txt` → `missa\la\02-02.yml`
   - `horas\Nederlands\01-01.txt` → `horas\nl\01-01.yml`

3. **Ordinarium exception:** sources under `horas\Ordinarium` are
   language-agnostic and keep their path (extension change only):
   - `horas\Ordinarium\Prima.txt` → `horas\Ordinarium\Prima.yml`

### Edge cases

- **Empty or whitespace-only file** → a single empty-string line (`[""]`), not
  an empty sequence.
- **Unknown language folder** (not in the table above and not under
  `Ordinarium`) → the conversion fails with an error rather than guessing a
  code.

---

## Step 1 — Lines to section-keyed object

Groups the line array from step 0 into an object keyed by section name. A
`[Section]` header opens a section and the lines beneath it are its content; a
`(condition)` on the header becomes a rubric variant.

### Input

- The step 0 output for one file: a sequence of lines.

### Output

- One object per file. Each key is a section name in **kebab-case**; its value
  is a list of **rubric variants**, each with:
  - `value` — the section's lines;
  - `condition` — the rubric tokens the header condition expands to; an empty
    list is the unconditional (default) variant.

### Transformation

Lines are read top to bottom, accumulating into the current section:

1. **Section headers** — a line of the form `[Name]` or `[Name] (condition)`
   starts a new section. The name is kebab-cased (lowercased, with each run of
   whitespace becoming a single hyphen) to form the key. A header with no body
   still registers its key (subject to final cleanup below). A header line must
   begin with `[`; the only exception is a single [special
   case](#special-cases) for one mistyped header.
2. **Preamble** — lines that appear before the first header are collected under
   the reserved key `__preamble`. There is **no** general processing of `;;`
   here; the sole exception is one [special case](#special-cases).
3. **Section close** — when a section ends (a new header, or end of input), its
   trailing blank lines are removed (leading and interior blanks are kept) and
   its content is merged into the section's variant list according to the
   header condition (see [Appendix A](#appendix-a--rubric-conditions)). With no
   condition, the lines become one unconditional variant.
4. **Cleanup** — finally:
   - a variant with both empty content and an empty condition is discarded (an
     empty-bodied *conditional* variant is retained, since its condition is
     meaningful);
   - a section left with no variants is removed.

### Behavioral notes

- **Repeated headers** with the same kebab name accumulate into one key rather
  than overwriting; their variants are merged.
- **`__preamble`** is kept only if it has content; an empty preamble is removed.
- Multi-word conditions such as `rubrica tridentina` or `summorum pontificum`
  resolve correctly despite the intermediate kebab-casing.

### Examples

- Basic grouping:

  ```
  ["pre1", "[Lectio1]", "text1", "[Oratio]", "text2"]
  →
  { __preamble: [{ value: ["pre1"],  condition: [] }],
    lectio1:    [{ value: ["text1"], condition: [] }],
    oratio:     [{ value: ["text2"], condition: [] }] }
  ```

- Header condition → rubric variant (`rubrica tridentina` → `1570`):

  ```
  ["[Oratio] (rubrica tridentina)", "text"]
  → { oratio: [{ value: ["text"], condition: ["1570"] }] }
  ```

- Empty section dropped:

  ```
  ["[Empty]", "[Lectio1]", "x"]
  → { lectio1: [{ value: ["x"], condition: [] }] }
  ```

### Edge cases

- **Empty-bodied conditional section** (a header with a condition but no lines)
  is retained as a variant with empty content and the condition's tokens; only
  fully empty *and* unconditional variants are pruned.

### Special cases

Two corrupted source files get a correction keyed to that exact path; all other
files are untouched.

- **`horas/Latin/SanctiOP/11-14M.txt`** — its preamble include line
  `@SanctiM/11-14M;;Simplex;;1.1;;vide` is truncated at the first `;;` so
  step 4 sees a clean reference `@SanctiM/11-14M`.
- **`missa/Nederlands/Sancti/09-02.txt`** — its mistyped header `d[Rank]` is
  rewritten to `[Rank]`.

---

## Step 2 — Combine mass and hours

Merges the `horas` (Divine Office) and `missa` (Mass) versions of each day into
one file. Step 2 changes no section content; it only maps both trees onto a
shared, root-stripped output path, and the runner unions whatever lands there.

### Input

- The step 1 object for one file, plus the source file's path.

### Output

- Section content is **unchanged**.
- The output **path** has the leading `horas`/`missa` segment removed, so the
  hours and mass versions of the same day resolve to one path (see
  [Path mapping](#path-mapping-1)).
- Files that resolve to the same path are unioned by the runner: section
  variants are merged by condition, and on a condition collision the `missa`
  version wins. Variant directories of the same day are still separate at this
  point — step 5 folds those.

### Path mapping

- Drop the leading `horas`/`missa` segment:
  - `missa\Sancti\01-01.yml` → `Sancti\01-01.yml`
  - `horas\Sancti\01-01.yml` → `Sancti\01-01.yml`
- A variant directory or filename suffix is left untouched (that is step 3's
  job): `missa\SanctiCist\01-01t.yml` → `SanctiCist\01-01t.yml`.

---

## Step 3 — Inline conditionals

Within a section, some lines apply only under certain rubrics, marked by an
inline conditional such as `(sed rubrica 1960)` or `(si innovata)`. This step
expands each section into rubric variants according to those conditionals. It is
a port of Divinum Officium's line-conditional processing.

Step 3 runs **before** the reference steps (4–5) so that broad references (step
4) resolve while variant directories are still separate on disk.

### Input

- The step 2 object for one file, plus its path.

### Output

- The same object shape (section keys → list of `{ value, condition }`
  variants). Each incoming variant is re-expanded: its lines are split into one
  variant per reachable rubric combination. The `condition` of each result is
  the incoming variant's condition combined (deduplicated, sorted) with the
  rubric tokens that combination assumes.

### Skip rule

- Files under an `Ordo` directory (per-language rubric tables, not proper texts)
  are passed through **unchanged** — no conditional processing.

### Conditional lines

A line is a conditional when, ignoring leading whitespace, it begins with a
parenthesized group `(…)`. The text inside the parentheses is a rubric condition
(the [Appendix A](#appendix-a--rubric-conditions) grammar — `aut`/`et`/`nisi`,
subjects and predicates), optionally introduced by a **stopword** and/or
followed by a **scope phrase**. Any text after the closing `)` on the same line
("the rest") is treated as the first line the conditional governs.

Two line-level details apply to ordinary (non-conditional) lines too:

- A leading `~` is an escape; it is stripped from the emitted line.
- A blank line — empty or a single `_` — is a chunk boundary (see scope below).

### Strength and scope

Each conditional carries a **strength** and a **back-scope** / **forward-scope**,
derived from its stopword and scope phrase:

- **Strength** (how wide a nesting the conditional governs) comes from the
  stopword: `si` → 0; `deinde` → 1; `sed` → 1; `vero` → 1; `atque` → 2;
  `attamen` → 3. A stronger conditional overrides weaker ones nested above it.
- **Back-scope** — how many *preceding* lines the conditional retroactively
  claims:
  - *line* — the single immediately preceding line (the default for the
    back-referencing stopwords `sed`/`vero`/`atque`/`attamen`);
  - *chunk* — the preceding run of non-blank lines, back to a blank line
    (scope phrase `hic versus` / `hi versus`, or the `omittitur` instruction);
  - *nest* — everything back to the current nesting fence (scope phrase
    `loco hujus versus` / `loco horum versuum`, or `omittuntur`);
  - *none* — no backward effect (plain `si`, or a `semper` conditional).
- **Forward-scope** — how many *following* lines it governs, derived similarly
  (an `omittitur`/`omittuntur` instruction suppresses forward; otherwise the
  forward reach mirrors the back-scope, defaulting to *line*).

A conditional describes an alternative to the surrounding default text. In the
branch that **assumes the rubric holds**, the backward-governed preceding lines
(the default wording) are removed and the forward-governed following lines are
kept. In the default branch, the preceding lines are kept and the
forward-governed lines are suppressed. So `(sed …)` reads as "…but under this
rubric, replace the previous line", and `(si …)` as "under this rubric, also
include the following".

### Variant expansion

The step evaluates every reachable rubric combination at once, starting from a
single default branch (empty condition):

- Each conditional line **splits** branches: for each alternative of the
  condition (`aut`-separated), a branch is created that assumes that rubric and
  keeps the governed lines, while the base branch continues assuming the
  condition does not hold.
- A branch that assumes a rubric already ruled out is dropped; a conditional
  whose rubric a branch has **already committed to** fires without splitting
  again (this keeps a section with many conditionals from expanding
  exponentially).
- Branches that reach an identical state are merged.

Each surviving branch yields one variant: its `value` is the lines that survived
for that branch, and its `condition` is the incoming condition unioned with the
branch's assumed rubric tokens, filed through the include/exclude merge of
[Appendix A](#appendix-a--rubric-conditions). The default branch (no rubric
assumed) produces the default variant.

### Examples

Each example shows the lines that survive for one concrete rubric (the matching
variant, or the default variant when no rubric is given).

- Plain lines pass through; a leading `~` is stripped:
  - `["a", "b"]` → `["a", "b"]`; `["~literal"]` → `["literal"]`
- **`sed` (back-scope line):** `(sed rubrica 1960)` replaces the preceding line
  under the 1962 rubric:
  - `["before", "(sed rubrica 1960)", "after"]`, rubric `1962` → `["after"]`
  - `["(sed rubrica 1960)"]`, rubric `1962` → `[]`
- **`si` (forward-scope line):** governs the following line only:
  - `["(si innovata) kept"]`, rubric `2020` → `["kept"]`
  - `["(si innovata)", "suppressed", "allowed"]`, default → `["allowed"]`
- **`hi versus` (back-scope chunk):** removes the preceding non-blank run:
  - `["line1", "line2", "(si rubrica tridentina hi versus) tail"]`, rubric
    `1570` → `["tail"]`
- **`loco horum versuum` (back-scope nest):** truncates all prior output to the
  fence:
  - `["x", "y", "(deinde missa tridentina loco horum versuum) tail"]`, rubric
    `1570` → `["tail"]`

Full-variant view — `(si innovata) kept` yields two variants: the default
(`condition: []`, value `[]`) and the `2020` variant (value `["kept"]`).

### Edge cases

- **A conditional a branch already satisfies** fires once and keeps that
  branch's existing rubric label rather than forking or relabeling.
- **`attamen`** (strength 3) and other high-strength stopwords are accepted and
  govern a wider nesting; they do not error.
- **Earlier unconditional lines** are carried into every branch, so a matching
  variant includes the lines that preceded its conditional.

---

## Step 4 — Broad references (`@File`, `ex …`, `vide …`)

Resolves file-level references, pulling in and merging the referenced sections.
*(Full specification pending.)*

Runs while variant directories (e.g. `SanctiM`, `SanctiCist`) are still
**separate** files — step 5 has not yet folded them onto their base — so a
reference such as `@SanctiM/11-14M` resolves directly to its own file. This
ordering (references before the suffix/fold step) is the reason steps 3–5 sit in
this order.

---

## Step 5 — Directory and filename suffixes to rubric conditions

Reads the file's **directory** and **filename** to infer which rubric(s) it
represents, adds that rubric to every section's condition, and computes an
output path with the variant markers removed so that all rubric variants of the
same day or feast land on one path. This is also where variant directories are
folded onto their base — deliberately after references have been resolved
(steps 3–4).

### Input

- The step 4 object for one file, plus its path.

### Output

- The same object shape (section keys → list of `{ value, condition }`
  variants). Each variant's `condition` now also carries the tokens derived from
  the path.
- A **merged output path** (see [Path mapping](#path-mapping-2)) that folds a
  variant directory onto its base and strips the filename's rubric suffix.

### Deriving the rubric context

The directory and filename are read as follows:

1. **Directory and filename.** The immediate parent directory name and the
   filename (without extension) are taken from the path. Three fixed filename
   corrections are applied: `Ferua` → `Feria` (typo), `Epi1-0` → `Epi1-0r`, and
   `Epi1-0a` → `Epi1-0`.
2. **Base directory.** The directory must begin with one of four bases —
   `Commune`, `Martyrologium`, `Sancti`, `Tempora`. If it does not, no rubric is
   derived (the condition stays empty). Everything below happens under the
   matching base.
3. **Directory variant.** If the directory carries a suffix beyond its base
   (e.g. `SanctiCist`, `TemporaOP`, `SanctiM`), that suffix maps to a token:

   | Directory suffix | Token           |
   | ---------------- | --------------- |
   | `Cist`           | `cisterciensis` |
   | `M`              | `monastica`     |
   | `OP`             | `praedicatorum` |
   | `1570`           | `1570`          |
   | `1955r`          | `1955`          |
   | `1960`           | `1962`          |

4. **Excluded files.** For a fixed set of filenames — `Coronatio`, `10-DU`,
   `10-DP`, `07-DP`, `11-03sec`, `00-VB`, `00-VE`, `09-DP`, `09-DT` — filename
   suffix parsing is skipped (a directory-variant token, if any, is still
   applied).
5. **Feria.** If the filename contains `Feria`, the number *n* immediately
   before it yields the token `feria-(n+1)`, and `Feria` is removed from the
   stem.
6. **Filename suffix peeling.** Recognized rubric suffixes are peeled off the end
   of the filename stem, each contributing token(s), until the stem ends in no
   recognized suffix. The table is consulted in the order below (more specific,
   multi-character suffixes first):

   | Suffix     | Token(s)                  |
   | ---------- | ------------------------- |
   | `-Septem`  | `septem-dolorum`          |
   | `Coct`     | `cisterciensis`, `octava` |
   | `cist`     | `cisterciensis`           |
   | `octt`     | `octava`, `commemoratio`  |
   | `-oct`     | `octava`                  |
   | `-sab`     | `feria-7`                 |
   | `Pasc`     | `paschali`                |
   | `sab`      | `feria-7`                 |
   | `oct`      | `octava`                  |
   | `bmv`      | `1888`                    |
   | `def`      | `defunctorum`             |
   | `-da`      | `1913`                    |
   | `cc`       | `commemoratio`            |
   | `AV`       | `altovadensis`            |
   | `oM`       | `monastica`               |
   | `tt`       | `transfer`, `1570`        |
   | `oc`       | `occurentia`              |
   | `da`       | `1913`                    |
   | `OP`       | `praedicatorum`           |
   | `M`        | `monastica`               |
   | `q`        | `quadragesima`            |
   | `o`        | `1888`                    |
   | `r`        | `1962`                    |
   | `n`        | `2020`                    |
   | `p`        | `paschali`                |
   | `t`        | `1570`                    |
   | `g`        | `1913`                    |
   | `C`        | `cisterciensis`           |
   | `a`        | `special-a`               |
   | `b`        | `special-b`               |
   | `c`        | `special-c`               |
   | `s`        | `special-s`               |
   | `A`        | `adventus`                |
   | `N`        | `nativitatis`             |
   | `Q`        | `septuagesimae`           |
   | `v`        | `vigilia`                 |

7. **Suffix validation.** After peeling, the stem must end in a digit. If a
   non-digit remains, the filename has an unrecognized suffix and the conversion
   fails (`Suffix is not supported`).

The tokens collected in steps 3–6 form the file's rubric condition.

### Attaching the condition

Each section variant keeps its own condition and **additionally** gains the
path-derived tokens: the variant is re-filed under the union of its existing
condition and the derived tokens (deduplicated), via the include-merge in
[Appendix A](#appendix-a--rubric-conditions) (inclusion branch, no exclusions).
A variant with no prior condition and no derived tokens stays the default.

Because the derived tokens are **added to** — not substituted for — each
variant's condition, the outcome is the same whether or not step 2 was
materialized separately before step 3.

### Path mapping

The path has already had its `horas`/`missa` root removed by step 2. Step 3
removes the remaining rubric markers so variants converge:

1. If the directory is a variant, rename it to its base (`SanctiCist` →
   `Sancti`).
2. Strip the filename's trailing non-digit suffix (`01-01t.yml` → `01-01.yml`).
   Excluded files keep their filename.

The runner then merges everything landing on one path, unioning section variants
by condition — see the streaming-merge behavior in [AGENTS.md](AGENTS.md).

Examples:

- `root\SanctiCist\01-01.yml` → `root\Sancti\01-01.yml`
- `root\Sancti\01-01t.yml` → `root\Sancti\01-01.yml`

### Examples (condition derivation)

- Filename suffix `t` → `1570`:

  ```
  transform({ oratio: [{ value: ["x"], condition: [] }] }, "Sancti/01-01t.yml")
  → { oratio: [{ condition: ["1570"], value: ["x"] }] }
  ```

- Variant directory `SanctiCist` → `cisterciensis`:

  ```
  transform({ name: [{ value: ["Foo"], condition: [] }] }, "SanctiCist/01-01.yml")
  → { name: [{ condition: ["cisterciensis"], value: ["Foo"] }] }
  ```

- An existing condition is **extended**, not replaced (header `1570` variant in
  a `Cist` directory):

  ```
  transform({ oratio: [{ value: ["x"], condition: ["1570"] }] }, "SanctiCist/01-01.yml")
  → { oratio: [{ condition: ["1570", "cisterciensis"], value: ["x"] }] }
  ```

### Edge cases

- **Unrecognized filename suffix** (stem does not end in a digit after peeling)
  → conversion fails with `Suffix is not supported`.
- **Excluded files** skip filename-suffix parsing; only a directory-variant
  token (if any) is attached.
- **Unknown directory suffix** — only the six directory suffixes in the table
  above are recognized; any other variant-directory suffix yields no valid
  token.

---

## Appendix A — Rubric conditions

Rubric conditions — from section headers, filename and directory suffixes, and
inline conditionals — select which variant of a text applies under which rubric.
A **condition** is a set of rubric *tokens* (e.g. `1570`, `2020`, `monastica`);
a **variant** pairs a `value` (its lines) with a `condition` (its tokens), where
an empty condition denotes the default/unconditional case.

> This appendix currently covers the condition handling used by steps 1 and 5.
> Inline-conditional parsing, used by step 3, is specified alongside that step.

### Token vocabulary

A Latin condition phrase is reduced to tokens by recognizing two kinds of words:

- **Qualifiers** — leading words that name what the condition is *about* and are
  dropped before interpreting the term: `rubricis`, `rubrica`, `tempore`,
  `missa`, `communi`, `die`, `feria`, `commune`, `votiva`, `officio`, `ad`,
  `mense`.
- **Predicates** — the word that carries the rubric, mapped to token(s). An
  unrecognized term becomes its own literal token.

  | Predicate term         | Token(s)              |
  | ---------------------- | --------------------- |
  | `tridentina`           | `1570`                |
  | `summorum pontificum`  | `1942`                |
  | `196`                  | `1962`                |
  | `1960`                 | `1962`                |
  | `innovata`             | `2020`                |
  | `innovatis`            | `2020`                |
  | `^monastica`           | `monastica`           |
  | `Monastic.*Divino`     | `monastica`, `1913`   |
  | `post septuagesimam`   | `septuagesimam`       |
  | `feriali`              | `feria`               |

### Combining words

A condition phrase may combine terms:

- **`aut`** (OR) separates independent alternatives; each alternative is applied
  on its own.
- **`et`** (AND) joins terms into a single required set.
- **`nisi`** (unless) negates the terms that follow it, turning them into
  *exclusions*.

### How a condition applies to a variant list

Each alternative contributes a set of *included* tokens and, optionally,
*excluded* tokens:

- **Only exclusions** (no included tokens): the default variant takes the new
  content, and each excluded token gets its own variant holding the previous
  default content.
- **Inclusions** (with or without exclusions): the variant identified by the
  included tokens takes the new content; for each excluded token, a variant
  keyed by the included tokens plus that excluded token holds the previous
  default content.

Variants are matched by their token set regardless of order: an existing variant
with the same tokens is updated in place; otherwise a new variant is added. With
no condition at all, the content is simply added as one unconditional variant.
