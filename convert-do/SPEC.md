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

The trees each step writes are **intermediates**: nothing reads them but the
next step. They are stored as JSON (`.json`), which parses and serializes far
faster than YAML — on this data the difference decides whether a run takes
minutes or seconds. The examples throughout this document are written as YAML
for readability; they describe the structure, not the file format.

The **last step's output is published**, read by people and shipped alongside
the hand-maintained assets, and is written as YAML (`.yml`). Step 11 is
therefore the one place the two formats meet.

The pipeline runs in two modes:

- **Streaming (steps 0–6)** — each source file is processed independently and
  passed through every step in the requested range before being written once.
- **Batch (steps 7–10)** — whole-directory passes that may produce several
  outputs from one input, merge content across inputs, or write a shared file
  alongside the tree. Each batch step fully rebuilds its output directory. A
  batch step may also be a plain per-file pass that simply has to run after the
  file set has been reshaped.

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
  point — step 6 folds those.

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

Some files carry little or no proper text and instead point at another file.
This step resolves those **file-level** references — a whole-file include
(`@File` or `ex …`) or a selective borrow (`vide …`) — by loading the referenced
file and merging its sections in, propagating the referencing rubric condition.

Step 4 runs while variant directories (e.g. `SanctiM`, `SanctiCist`) are still
**separate** files — the suffix/fold step (step 6) has not yet folded them onto
their base — so a reference such as `@SanctiM/11-14M` resolves directly to its
own file. Both reference steps (4 and 5) run before that fold, which is why
steps 3–6 sit in this order.

### Input

- The step 3 object for one file, plus its path.
- The referenced files, read from the same materialized step tree. The runner
  processes a referenced file before any file that references it (see
  [Dependencies](#dependencies) below).

### Output

- The same object shape. The referenced sections are merged into the file's own
  sections, and the reserved `__preamble` key is removed. Content that is not a
  reference is left unchanged.

### Where references come from

Each reference carries the rubric condition of the variant it was found in.

- **`__preamble`** — a line beginning with `@` is a whole-file include. The path
  is the text after `@` up to the first `:`; any `:Section` suffix is ignored
  here (inline `@File:Section` references are step 5's concern).
- **`rank`** — the fourth `;;`-separated field of a rank line:
  - `ex X` → whole-file include;
  - `vide X` → selective borrow;
  - a bare value with no keyword (e.g. `C5c`) → treated as `vide`.
- **`rule`** — a line beginning `ex X` or `vide X` (other rule lines are
  ignored).

### Include vs. borrow

- **Include (`@` / `ex`)** — import **all** sections of the referenced file.
- **Borrow (`vide`)** — import these sections:
  - **always**: `lectio*`, `ant-laudes`, `ant-vespera`, `versum*`, `oratio*` —
    the Matins lessons and the antiphons, versicles and orations of Lauds and
    Vespers, the Office texts a day takes from its common.
  - **only where still missing**: the Mass propers `introitus`, `graduale`,
    `gradualep`, `tractus`, `evangelium`, `offertorium`, `secreta`, `communio`,
    `postcommunio`, `ultima-evangelium`.

  The Mass propers fill a gap rather than furnish the day. A day that resolves
  its own Mass — from its own text, or from a whole-file include — keeps it
  untouched. One that resolves none, such as a commemoration pointing at a
  common, takes the common's rather than being left without a Mass at all.

  "Still missing" is judged as the references are resolved, and includes come
  before borrows, so an `ex` always wins over a `vide` for the same section.

### Reference-path normalization

A raw reference target is normalized before lookup:

- stray `;mtv`, `;` and `:` characters are removed; `sancti/` is corrected to
  `Sancti/`; surrounding whitespace is trimmed;
- a `…Feria…` marker: the number *n* before `Feria` becomes the condition
  `feria-(n+1)` and `Feria` is dropped from the path;
- a bare `Cn…` target (a `C` followed by a digit) gains a `Commune/` prefix; a
  `Quadp…` / `Epi…` / `Pasc…` target gains a `Tempora/` prefix;
- a **self-reference** (whose final path segment equals the file's own name) is
  dropped.

The target is otherwise used **as written**: a variant directory (`SanctiM`) or
a filename rubric suffix (`…t`) is **not** stripped, because at this step those
files still exist separately — the reference resolves directly to the specific
variant file. (Step 6 folds variants onto their base later.)

### Merging and condition propagation

- Imported section variants have the reference's condition **prepended** to
  their own, so a `vide` made under `1570` contributes sections tagged `1570`.
- If the file already has that section, the imported variants are unioned in; a
  variant whose exact condition set already exists is not duplicated.

### Dependencies

The set of referenced paths a file declares is what the runner uses to order
work: a file is held back until every file it references has been produced,
then retried. References are resolved relative to the `step{N}/<language>` root,
so files nested more than one directory below the language (e.g.
`Sancti/Urbis/…`) resolve correctly.

### Examples

- Preamble include + rank `ex`/`vide` (rank `vide` under `1570`):

  ```
  { __preamble: [{ value: ["@Sancti/12-26:Lectio1"], condition: [] }],
    rank: [{ value: [";;Duplex;;3;;ex Commune/C1"],   condition: [] },
           { value: [";;Simplex;;1;;vide Sancti/12-26"], condition: ["1570"] }] }
  →  includes: Commune/C1, Sancti/12-26   borrows: Sancti/12-26 (condition 1570)
  ```

- A bare rank pointer `C5c` normalizes to a `vide` on `Commune/C5c` (the
  `Commune/` prefix added, nothing stripped — `Commune/C5c` is its own file).

### Edge cases

- **Bare rank reference** (no `ex`/`vide`) is treated as a `vide` commune
  pointer rather than an error.
- **`@File:Section`** in the preamble is imported as the whole file here; the
  `:Section` narrowing happens at step 5.
- **A declared reference that was never produced** leaves the file queued and,
  if never satisfied, is reported as an error (non-fatal) rather than crashing.
- A couple of individual targets receive a fixed correction (e.g. `Tempora/Epi4`
  → `Tempora/Epi4-0`).

---

## Step 5 — Inline references (`@File:Section:…`)

Replaces a single **reference line** with the lines of a specific section pulled
from another file. Where step 4 imports whole files, step 5 pulls one named
section — optionally a line range, optionally with text substitutions — in place
of the `@…` line. Like step 4 it runs before the fold (step 6), reading the
still-unfolded step 4 tree, so references to variant files (e.g.
`@SanctiM/11-14M:…`) resolve to their own file.

### Input

- The step 4 object for one file, plus its path.
- Referenced files, read from the fully materialized (unfolded) step 4 tree.

### Output

- The same object shape. Every reference line is replaced by the resolved lines;
  a reference that cannot be resolved is **left in place** unchanged. Non-array
  (scalar) section values pass through untouched.

### Reference syntax

A line whose text begins with `@` is a reference:
`@File:Section:lineRange:s/pattern/replacement/flags`, colon-separated, where all
parts after `File` are optional:

- **`File`** — the target file path, relative to the language root. If omitted
  (the reference begins `@:…`), the **current file** is the target — the section
  is pulled from the file itself.
- **`Section`** — the section to pull, kebab-cased. If omitted, the target's
  first content section is used.
- **`lineRange`** — `N` or `N-M`, selecting lines *N*…*M* (1-based, inclusive).
- **`substitution`** — one or more `s/pattern/replacement/flags` groups applied
  to the pulled lines (sed-like; default flag is global).

### Resolution

For each reference line:

1. Load the target file from the step 4 tree. If it is missing or unreadable,
   the reference line is left unchanged.
2. Choose the section — matched by exact key, by a `…/section` suffix, or by a
   `section-` / `section/` prefix; with no name given, the first non-preamble
   section.
3. From that section choose the variant matching the current rubric condition:
   an exact condition match, else the default (unconditional) variant, else the
   first.
4. Apply the line range, if any.
5. Apply the substitutions, if any — each as a regular-expression replace; an
   invalid pattern is skipped.
6. If the result is a single line that is itself a reference, resolve it
   recursively (transitively), up to a depth of **5**.

The reference line is then replaced by the resulting lines. A reference that
resolves to an empty section removes the line; only an *unresolvable* reference
(missing file or section) leaves the line in place.

### Dependencies

Step 5 reads the **complete** step 4 tree (materialized before this step runs),
so every referenced file is already present; it does not block on or requeue
missing targets — an unresolvable reference is simply left in place. The set of
referenced file paths (excluding self-references) is still exposed, consistent
with step 4.

### Examples

- Pulling one section:

  ```
  section lectio1 = [{ value: ["@Commune/C1:Lectio1"], condition: [] }]
  with Commune/C1 → { lectio1: [{ value: ["borrowed lectio"], condition: [] }] }
  ⇒ lectio1 = [{ value: ["borrowed lectio"], condition: [] }]
  ```

- Declared dependency: `@Sancti/12-26:Lectio1` → `Sancti/12-26`.

### Edge cases

- **Unresolvable reference** (missing file or section) → the `@…` line is kept
  verbatim.
- **Recursion depth** is capped at 5; deeper chains stop resolving.
- **Empty target section** → the reference line is removed (replaced by nothing).
- **Non-array section values** pass through unchanged.

---

## Step 6 — Directory and filename suffixes to rubric conditions

Reads the file's **directory** and **filename** to infer which rubric(s) it
represents, adds that rubric to every section's condition, and computes an
output path with the variant markers removed so that all rubric variants of the
same day or feast land on one path. This is also where variant directories are
folded onto their base — deliberately after references have been resolved
(steps 3–5).

### Input

- The step 5 object for one file, plus its path.

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

### Commemorations are not folded

A filename ending `cc` — or `octt`, for one kept during an octave — marks a
**commemoration**: a celebration in its own right that the day merely keeps
alongside its own. `Sancti/09-08cc` is St Adrian, kept on the Nativity of the
Blessed Virgin Mary.

Such a file keeps its **own path**. Folding it onto the day's would merge one
saint's collect and lessons into another feast's file, and everything downstream
would then have to tell them apart again.

Because it stands alone, it does not take `commemoratio` as a condition either:
that token existed to distinguish the commemoration's variants from the day's
once they shared a file, and now nothing shares a file. A `octt` file still
takes `octava`, which says when it applies rather than what it is.

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

## Step 7 — Filename from liturgical name *(batch)*

The first **batch** step: a whole-directory pass that may write one document
under several filenames. It names each file from the feast/office title and
folds `rank`/`officium`/`name` into a single `name` section. Section content
keeps the rubric-variant shape.

### Input

- The step 6 tree — a directory of variant-shaped YAML files.

### Output

- Each document is written once per distinct name it yields (see Filenames).
- Its `rank`, `officium` and `name` sections are replaced by a single `name`
  naming that file; every other section passes through unchanged (still a
  `{ value, condition }` list).

### Filenames

A celebration is designated under each of its rubrics, and each designation
becomes a file. For every rubric condition the document gathers what it is called
there: its `officium`, its `name`, and the text before the first `;;` of its
`rank`.

A file is filed under the `officium` and under the `rank`. The `name` files on
its own **only where that condition has no officium** — the officium is the
formal designation and outranks it. `rank` keeps filing regardless, since it
often carries the specific feast where the officium gives only a generic one
(`In Nativitate Beatæ Mariæ Virginis` against `In Festis Beatae Mariae
Virginis`).

Each name is kebab-cased: accents folded, dots and commas dropped, any other run
a single hyphen, and a leading honorific segment — `s`, `ss`, `b` or `bb`, being
`S.`, `Ss.`, `B.` or `Bb.` once their dots are gone — removed, so the file is
named for the saints rather than the honorific: `S. Adriani, Martyris` files as
`adriani-martyris`, and `Ss. Fabiani et Sebastiani` as `fabiani-et-sebastiani`.
Only a whole segment is an honorific, so `Sanctæ Familiæ` keeps its `sanctæ`.

With no designation at all, the original filename stem is kept. Within a
directory, a collision on the same name with **different** content is
disambiguated by appending the original stem; identical content collapses to a
single file.

### Content transform

`rank`, `officium` and `name` are dropped, and the document is designated as the
**file being written**, with two plain strings:

- **`title`** — the designation the file is filed under: its `officium`, or its
  `rank` where the file is filed under that. A file therefore never contradicts
  its own filename.
- **`name`** — the short name of the celebration, from the `name` section of the
  same rubric condition.

Only what the source gave is emitted. A document with no `officium` and no `rank`
carries no `title`; one with no `name` carries no `name`.

```yaml
# adriani-martyris.yml
title: S. Adriani, Martyris
name: Adriáni
```

A document is written under every designation it yields, so these belong to the
file rather than to the document. Each file says which celebration it holds, and
the others are files in their own right.

This also keeps the designations out of the rubric conditions. `Adriáni` is how
the Cistercian use names St Adrian's commemoration, and `Hadriáni` how the Roman
does; as a conditioned variant the Cistercian naming would be dropped wherever
that use is not published, leaving a file called `adriani` claiming to be
`Hadriáni`.

### Edge cases

- **No derivable designation** → the original stem is the filename, and neither
  `title` nor `name` is emitted: the file is not named after anything.

---

## Step 8 — Split commemorations *(batch)*

A **batch** step that pulls commemoration sections out into their own per-saint
files and merges the same saint across documents.

### Input

- The step 7 tree.

### Output

- Each main document rewritten **without** its `commemoratio-*` sections.
- One file per commemorated saint, `<dir>/<slug>.yml`, holding a display `name`
  and the saint's `oratio` / `secreta` / `postcommunio` as `{ value, condition }`
  lists.

### Transform

- The `commemoratio-oratio` / `commemoratio-secreta` / `commemoratio-postcommunio`
  sections are removed from the main document.
- Within each such section (a variant list), each variant's first line names the
  saint — `!Pro S. …` or `Pro Ss. …`; the `S.`/`Ss.` honorific is dropped and
  the rest is kebab-slugged. The variant's remaining lines become that saint's
  content for that type, keeping the variant's `condition`.
- Per saint, the collected type variant-lists plus a display `name` (the `!Pro`
  text, honorific kept) form the saint's file.

### Merging

- The same saint (slug) appearing in several documents in one directory merges
  into a single file; a non-empty section replaces the accumulated one.

### Edge cases

- A `commemoratio-*` variant whose first line is not a `!Pro …` line is skipped.

---

## Step 9 — Structure missa sections *(batch)*

A **batch** step (purely per-file) that converts a Mass section's lines into a
typed object, applied to **each rubric variant** while keeping its `condition`.
The readings of Matins are given the same reading shape, so that a reading is
one kind of thing wherever it occurs.

### Input

- The step 8 tree.

### Output

- The same shape; each recognized missa section has every variant's `value`
  replaced by a typed object. Non-missa sections pass through unchanged, except
  for the Matins readings described below.

### Section types

| Type         | Sections                                                       | Shape |
| ------------ | -------------------------------------------------------------- | ----- |
| `verse`      | `lectio`, `evangelium`, `offertorium`, `communio`, `ultima-evangelium` | `{ ref, text }` |
| `prayer`     | `oratio`, `secreta`, `postcommunio`                            | `{ text, closure }` |
| `antiphonal` | `introitus`, `graduale`                                        | `{ antiphon: { ref, text }, verse: { ref, text } }` |
| `verses`     | `tractus`, and `gradualep` published as `alleluiap`            | `{ verses: [{ ref, text }] }` |

- **verse** — a `!ref` line becomes `ref`; `$`-lines are dropped; a leading `v.`
  is stripped. For `lectio`/`evangelium`, a leading `Léctio…`/`Sequéntia…`
  introduction line is removed from `text`.
- **prayer** — a `$`-line becomes `closure`; the rest becomes `text`.
- **antiphonal** — split into antiphon and verse by `!ref` segments; a verse
  tail that merely repeats the antiphon is dropped.

  Every chant's text has its trailing `Allelúja` removed — once, or two and
  three times over as the sources give it. The Alleluia is the response sung
  after the words, not part of them; the punctuation that introduced it goes
  with it, and the sentence is closed off again. A text that is nothing but the
  response is left empty.

  Text **before** the first reference belongs to the opening block: a chant
  often gives its antiphon and verse before naming a source, and those lines
  would otherwise be lost, leaving an antiphon with a reference and no words.
  The `Allelúja, allelúja.` cue is not such text and is skipped.

### The Alleluia

The Alleluia is a chant in its own right, sung after the Gradual, so it is
**lifted out of the gradual into its own section** — as `Prefatio=X` is lifted
out of `rule`:

The Alleluia sung after the Gradual is **lifted out of `graduale` into
`alleluia`**, keeping the condition of the variant it came from. A gradual whose
second block is a `!Tractus` has no Alleluia — that block is a tract — and yields
no section.

**`gradualep` is not a gradual at all.** It is the extended Alleluia that
replaces the Gradual in paschaltide, so it is structured as one — a list of
verses rather than an antiphon and a verse — and published under the name
`alleluiap`:

```yaml
alleluiap:
  verses:
    - { ref: "Num 17:8", text: "Virga Jesse flóruit… Allelúja." }
    - { ref: "Luc 1:28", text: "Ave, María, grátia plena… Allelúja." }
```

A verse opens at its `!ref`, or at a `v.` where the source gives none, so a verse
may carry no reference. The `Allelúja, allelúja.` opening is dropped: it is the
same words every time, and the section being an Alleluia already says them.

### Readings

The readings are treated as one kind of content wherever they occur: the Mass
readings `lectio`, `evangelium` and `ultima-evangelium`, and the readings of
Matins — `lectio1` … `lectio9` and the `…-in-N-loco` counterparts that place a
reading elsewhere in the Office. Giving them one shape lets
[step 10](#step-10--shared-lectio-store-and-variant-collapse-batch) store them
together.

A reading's lines are read as three parts: an optional **introduction** line, a
**reference marker**, and the **body** beneath it. What the step makes of them
depends on the reference.

#### A biblical reference

A reference naming a book, chapter and verse — `2 Cor 1:1-5`, `Matt 11:25-30` —
yields:

```yaml
ref: 2 Cor 1:1-5
verses:
  - "Paulus, Apóstolus Jesu Christi per voluntátem Dei…"
  - "Grátia vobis, et pax a Deo Patre nostro…"
  - "Benedíctus Deus et Pater Dómini nostri Jesu Christi…"
```

- The **introduction is dropped**. A line such as `Léctio Epístolæ beáti Pauli
  Apóstoli ad Romános`, `De libro Sapiéntiæ` or `Sequéntia sancti Evangélii`
  announces the passage the reference already names, so it carries nothing the
  reference does not.
- The body becomes **one entry per verse**, with the leading verse number
  removed. Where the body is not numbered, each line of it is one entry.

#### Any other reference

A reference that is not scripture — `Sermo 1 de Nativitate Domini`,
`Lib. 10. cap. 16.` — keeps the `{ ref, text }` shape, and **keeps its
introduction**. There the introduction is `Sermo sancti Augustíni Epíscopi` or
`Ex libro Morálium sancti Gregórii`: it names the author of the reading, which
nothing else records.

#### No reference

A reading with no marker keeps its lines as `{ text }`, with no `ref`. Step 10
stores it under a key built from its opening words.

#### Several references

A reading drawn from more than one passage keeps its original lines. Structuring
it would keep one reference and silently lose the interior ones. Such a reading
passes through this step unchanged and step 10 then leaves it inline — a
deliberate omission rather than a final state.

### Rule cleanup

The `rule` section is cleaned per variant: `Gloria` and `Credo` lines are
dropped, and a `Prefatio=X` line is lifted out into a `prefatio` section (value
`X`, lowercased) carrying the same condition.

---

## Step 10 — Shared stores and variant collapse *(batch)*

A **batch** step that removes the largest sources of duplication in the tree.
First it lifts the readings and the prayers out of the day files into shared
stores per language, leaving a key behind in their place: the same pericope is
read, and the same oration said, on many days and under many rubrics, so each
text is stored once and referred to. Then it drops rubric variants that merely
repeat the default variant's content.

### Input

- The step 9 tree.

### Output

- Two **store files** at the language root, `lectio.yml` and `oratio.yml` — one
  entry per distinct reading and per distinct prayer, keyed as described under
  [Keys](#keys), in the shape
  [step 9](#step-9--structure-missa-sections-batch) gave them.

  A prayer entry keeps its closure:

  ```yaml
  concede-nos-famulos-tuos-4b1e7c02:
    text: "Concéde nos fámulos tuos, quǽsumus, Dómine Deus…"
    closure: Per Dominum
  ```

  A reading entry:

  ```yaml
  matt-11-25-30:
    ref: Matt 11:25-30
    verses:
      - "In illo témpore: Respóndens Jesus, dixit…"
      - "Confíteor tibi, Pater, Dómine cœli et terræ…"
  sermo-1-de-nativitate-domini:
    ref: Sermo 1 de Nativitate Domini
    text: "Sermo sancti Leónis Papæ\nSalvátor noster, dilectíssimi…"
  sed-et-reproborum-duos-9f2c1a7e:
    text: "Sed et reprobórum duos ördines…"
  ```

- Every day file rewritten so that each variant of a covered section holds the
  **key string** instead of the reading:

  ```yaml
  evangelium:
    - condition: []
      value: matt-11-25-30
    - condition: [monastica]
      value: matt-11-25-30
  ```

Everything else — section keys, variant lists, conditions — is unchanged.

### Covered sections

Two kinds of section are lifted, each into its own store.

**Readings**, into `lectio.yml`: the Mass readings `lectio`, `evangelium` and
`ultima-evangelium`, and the Matins readings `lectio1` … `lectio9` together with
their `…-in-N-loco` counterparts. Mass and Matins readings share one store —
they are the same scripture, and a passage read at Mass on one day and at Matins
on another is stored once.

**Prayers**, into `oratio.yml`: `oratio`, `secreta` and `postcommunio`. These
repeat even more heavily than the readings do, because the commons supply one
oration for a whole class of saint, with the name left as `N.` to be filled in
when the day is rendered. They keep their own store rather than joining the
readings: a prayer is a different kind of text, carrying a closure rather than a
reference, and a store named for the readings should hold readings.

**Chants**, into `antiphona.yml`: the sung propers — `introitus`, `graduale`,
`gradualep`, `tractus`, `offertorium` and `communio`. They repeat for the same
reason the prayers do: one introit or gradual serves a whole common. A chant is
stored whole, with its antiphon, verse and any alleluia together, since those
travel as one piece.

Every other section is left untouched.

A Matins reading that [step 9](#step-9--structure-missa-sections-batch) left as
lines — because it carried no reference marker, or several — is not a
reference/text pair, and so stays inline by the general rule below.

### Scope of the store

The store is **per language root**, shared across every directory beneath it —
not per directory. Readings recur across the `Sancti` and `Tempora` trees, and a
per-directory store would keep those copies apart.

### Keys

An entry **with a reference** is keyed by it: lowercased, with accents folded
away, each run of characters that are not letters or digits becoming a single
hyphen, and leading and trailing hyphens removed. Folding the accents keeps a
key readable — `reprobórum` keys as `reproborum`, not `reprob-rum` — and lets an
entry key the same however its source spelled it.

A chant's reference is the one its **antiphon** carries, where it has no
reference of its own.

| Reference             | Key                  |
| --------------------- | -------------------- |
| `Matt 11:25-30`       | `matt-11-25-30`      |
| `2 Cor 1:1-5`         | `2-cor-1-1-5`        |
| `Eccli 51:1-8; 51:12` | `eccli-51-1-8-51-12` |

Two readings that share a reference but differ in content are **both kept**. The
first keeps the plain key; each further one is disambiguated by appending a
counter (`matt-11-25-30-2`, `matt-11-25-30-3`). Readings are visited in a
deterministic order, so the same source tree always yields the same keys and the
store file is stable between runs.

A **prayer**, and any entry **without a reference**, is keyed by its opening
words — the first four words of the text, in the same kebab form — followed by a
short hash of the whole content, so that two texts opening alike stay apart. For
a chant the opening words are its antiphon's:

| Opening                          | Key                                |
| -------------------------------- | ---------------------------------- |
| `Sed et reprobórum duos ördines…` | `sed-et-reproborum-duos-9f2c1a7e`  |

Because the hash covers the content, these keys never collide and take no
counter. Two identical readings produce the same key, so they still share one
entry.

In practice these collisions are spelling differences for the same pericope —
`coeli` against `cœli`, `ejus` against `eius`, `Judæam` against `Judǽam`. They
are preserved rather than reconciled: the step does not normalize the
orthography of a liturgical text, and each day keeps the exact wording its
source carried.

### Edge cases

- **A value step 9 left as lines** — a reading carrying several references — is
  left inline, unchanged; it does not enter the store and no key replaces it.
- **A value that is not a reading** is left inline, unchanged.
- **A reading whose content is only an unresolved reference** — a lone `@…` line
  that step 5 could not resolve — is left inline. It is not a reading yet, and
  storing it would key a placeholder.
- **Identical readings** collapse to one entry, however many days and rubric
  variants use them.
- **A reading used only once** still moves to the store, so a covered section
  holds a key wherever step 9 gave it a shape.

### Variant collapse

Most rubric variants carry content identical to the section's default variant —
the rubric makes no difference to that text. Those variants are removed, so that
the tree states a rubric variant only where the rubric actually changes
something.

This runs **after** the store substitution above, so that the covered sections
collapse on their keys rather than on their full reading text.

Applied to **every** section, not only the covered ones, within each section
independently: a variant is removed when all of the following hold.

1. The section has a **default** variant — one whose condition is empty.
2. The variant is not itself that default.
3. Its value is identical to the default's value.

Nothing else about the section changes: the default variant is always kept, and
every variant whose value differs from the default is kept with its condition
intact.

Example — an introit that is the same under every rubric:

```yaml
introitus:
  - condition: []                 value: {antiphon: …, verse: …}
  - condition: [cisterciensis]    value: {antiphon: …, verse: …}   # same
  - condition: [monastica]        value: {antiphon: …, verse: …}   # same
  - condition: ["1570"]           value: {antiphon: …, verse: …}   # differs
→
introitus:
  - condition: []                 value: {antiphon: …, verse: …}
  - condition: ["1570"]           value: {antiphon: …, verse: …}
```

#### What this assumes of the consumer

Collapsing is only faithful because a rubric that finds no matching variant
falls back to the default. A day under `monastica` no longer finds a `monastica`
variant of the introit above, and must resolve to the default to read the same
text it read before. Any consumer of this tree that selects a variant by rubric
has to implement that fallback; without it, collapsing loses content.

#### Edge cases

- **No default variant** — nothing is removed, even when several variants share
  a value. There is nothing to fall back to, so dropping any of them would
  change which rubrics resolve to which text.
- **Every variant identical, with a default present** — only the default
  remains.
- **A section that is not a variant list** is left unchanged.

---

## Step 11 — Mass propers *(batch)*

The last step, and the only one whose output leaves the pipeline: it narrows the
tree to what the calendar consumes — the Mass propers — so that the rest, which
is the Divine Office, is not carried into the published assets.

### Input

- The step 10 tree.

### Output

- One file per document that has Mass content, holding **only** its Mass
  sections, in the rubric-variant shape step 10 left them.
- A `lectio.yml` at the language root holding **only** the store entries those
  sections refer to.
- A document with no Mass content is **not written** at all.

### Which trees are published

Only the **day trees** — `Sancti` and `Tempora` — are written. A calendar asks
for the propers of a day, and those are the two trees that hold days.

A day nested in a **local calendar** under those trees is published only when
that calendar is `aliquibus locis` — "in some places" — which is a universal
option of the general calendar. The regional ones (`Urbis`, `Bavaria`,
`Brasilia`, …) are the propers of a particular place, not part of the calendar
being published; they are dropped, and would otherwise shadow the general day
they share a date with.

`Commune` is not published. It is a base for other days rather than a day
itself: the commons supply the texts that a saint's own file borrows, and
[step 4](#step-4--broad-references-file-ex--vide-) has already resolved those
borrowings by the time the propers are published. Its texts therefore reach the
calendar through the days that use them, and a copy under `Commune` would only
be reachable by a lookup no calendar makes.

The remaining trees — `Ordo`, `Psalterium`, and any other the sources carry —
hold the Office and its rubrics, not the propers of a day, and are not published
either.

### Kept sections

| Kept                                                                       |
| -------------------------------------------------------------------------- |
| `introitus`, `oratio`, `lectio`, `graduale`, `alleluia`, `alleluiap`, `tractus`, `evangelium`, `offertorium`, `secreta`, `communio`, `postcommunio`, `ultima-evangelium` |
| `title`, `name`, `prefatio`                                                 |

Everything else is dropped. A document counts as having Mass content when it
keeps at least one section from the first row; `title`, `name` and `prefatio`
alone are not enough, since nearly every document carries those.

`rule` is dropped here, at the end. It carries how a day is to be observed —
how many lessons, which preface — and the pipeline needs it up to this point:
[step 9](#step-9--structure-missa-sections-batch) reads it to lift out
`prefatio`. Once that is done nothing in the propers refers to it again, and it
is the Office it describes rather than the Mass.

### Days whose Mass changes with the season

A handful of days are not one Mass but several, one per part of the year, and
the sources hold them as a single document whose sections carry a season token.
Published as one file, such a day would offer the calendar a choice it has no
way to make; published as one file per season, each falls out as an ordinary day
with an ordinary Mass.

Our Lady on Saturday is the case the sources carry. Its five Masses are
*Rorate coeli* in Advent, *Vultum tuum* from Christmas to the Purification, and
*Salve sancta parens* three times over — from the Purification to Palm Sunday,
through paschaltide, and from Trinity to Advent. The last of these is the
unconditioned one; the other four are marked `special-a`, `special-b`,
`special-c` and `paschali`.

Each season is written as its own day, under `Sancti` and named for the stretch
of the year it covers, whatever tree the source document sat in. Narrowing a
document to a season goes section by section:

- A section that has a variant for the season keeps that variant, and only it.
- A section that has none keeps the variants naming **no** season — what the day
  says when no season claims it.
- The season token is then removed from the conditions that remain, since the
  file as a whole is now that season. Any other token on a variant survives.

A section left with nothing is dropped, as anywhere else in this step. The
source document itself is **not** published: it is the five days taken together,
and no calendar asks for it.

### Rubric systems not published

The propers are published for one **rubric system** — the 1962 rubrics, the ones
the shipped calendar follows. A variant that requires a different system can
never be chosen when that calendar is generated, so it is dropped rather than
shipped unreachable.

These are the systems, and dropping a variant conditioned on any of them but the
one in force:

| Kind                | Tokens                                                              |
| ------------------- | ------------------------------------------------------------------- |
| Editions            | `1570`, `1617`, `1888`, `1906`, `1910`, `1913`, `1930`, `1939`, `1951`, `1955`, `1962`, `1963`, `2020` |
| Orders and usages   | `monastica`, `cisterciensis`, `praedicatorum`, `altovadensis`, `divino`, `summorum`, `trident`, `Barroux` |
| Local usages        | any `dioecesis …` or `civitate …`                                    |

A condition token that is **not** a rubric system is left alone. Tokens such as
`octava`, `commemoratio`, `adventus`, `paschali`, `quadragesimae`, `feria-2` …
`feria-7`, `defunctorum`, `septem-dolorum`, `transfer` and `special-a` … `special-s`
say *when* a text applies, not *under whose rubrics*. The 1962 calendar uses
them, so they are published.

A section left with no variants is dropped, and a document left with no Mass
content is not written — as for a document that never had any.

This narrows what is published; it does not decide which variant applies on a
given day. That remains a question for whoever generates a calendar, answered
against the variants shipped here.

### Compaction

The variant shape earns its keep where a section actually varies. Where it does
not, it is scaffolding around a single value, and the published propers drop it.

Two rules, applied last — after the keys a document holds have been collected:

1. **An empty condition is omitted.** A variant with no rubric tokens carries no
   `condition` field at all. Its absence means the same thing the empty list did:
   the unconditional variant.

2. **A section with only the default variant becomes that variant's value** —
   unless the value is an array. An array would be indistinguishable from a
   variant list at a glance, so those sections keep their wrapper.

```yaml
oratio:
  - value: concede-nos-famulos-tuos-4b1e7c02
    condition: []
graduale:
  - value: ps-44-2
    condition: []
  - value: ps-88-21
    condition: [octava]
→
oratio: concede-nos-famulos-tuos-4b1e7c02
graduale:
  - value: ps-44-2
  - value: ps-88-21
    condition: [octava]
```

A consumer therefore reads a section as either a value in its own right, or a
list of variants of which at most one carries a condition-less entry. Both were
already true of the tree; compaction only stops writing what can be inferred.

### Section order

Sections are written in the order they occur in the Mass, so a day file reads
the way the day is celebrated rather than in whatever order the sources happened
to yield:

| # | Section | |
| - | ------- | - |
| 1 | `title` | the celebration, before its texts |
| 2 | `name` | its short name |
| 3 | `introitus` | Introit |
| 4 | `oratio` | Collect |
| 5 | `lectio` | Epistle |
| 6 | `graduale` | Gradual |
| 7 | `gradualep` | Gradual in paschaltide |
| 8 | `tractus` | Tract |
| 9 | `evangelium` | Gospel |
| 10 | `offertorium` | Offertory |
| 11 | `secreta` | Secret |
| 12 | `prefatio` | Preface |
| 13 | `communio` | Communion |
| 14 | `postcommunio` | Postcommunion |
| 15 | `ultima-evangelium` | Last Gospel |

A section outside this list — there should be none — is written after them, in
alphabetical order, so nothing is silently dropped by being unrecognized.

The store files are ordered by key, so both they and the day files have a
deterministic shape and diff cleanly between runs.

### The store subset

Only the readings the kept sections name are carried over. The Office readings
share the step 10 store but are not published, so most of its entries do not
travel with the propers; neither do readings only a dropped variant named.

### Edge cases

- **A reading left inline** by step 10 stays inline here; it is content, not a
  key, and needs no store entry.
- **A key naming no store entry** is impossible by construction, since the
  subset is built from the keys the kept sections actually hold.

---

## Appendix A — Rubric conditions

Rubric conditions — from section headers, filename and directory suffixes, and
inline conditionals — select which variant of a text applies under which rubric.
A **condition** is a set of rubric *tokens* (e.g. `1570`, `2020`, `monastica`);
a **variant** pairs a `value` (its lines) with a `condition` (its tokens), where
an empty condition denotes the default/unconditional case.

> This appendix currently covers the condition handling used by steps 1 and 6.
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
