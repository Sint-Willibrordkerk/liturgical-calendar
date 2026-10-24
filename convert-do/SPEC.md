# convert-do — Pipeline Specification

This document is the precise, per-step specification for the `convert-do/`
pipeline, which converts source files from the [Divinum
Officium](https://www.divinumofficium.com) project into normalized YAML.

Where [AGENTS.md](AGENTS.md) explains *how to run* the pipeline, this document
specifies *what each step guarantees*: its inputs, its outputs, the
transformation it performs, the resulting data shape, and its handling of
boundary cases. It describes observable behavior, not implementation. Section
numbering follows the step numbers (step 0 … step 12).

## The governing strategy: a text has one home, and borrowings point at it

A liturgical text — a reading, a prayer, a chant — is said on many days and
under many rubrics. The commons exist precisely so that a class of saint shares
one set of texts, and a day borrows them rather than restating them.

The pipeline is built around that fact. Every reading, prayer and chant is
**structured and filed into a per-language store as soon as its wording is
final**, and what remains in a day file is a **key** into that store. A day that
draws its Mass from a common, or includes another file whole, then comes to hold
the **same keys** the common holds — the text is not copied, so it never has to
be found again and de-duplicated. The store is the single home, and it exists
before the first borrowing is resolved.

The sources carry two kinds of reference, and they are different in kind:

- An **inline reference** — `@File:Section:…`, standing in the lines of a
  section — **assembles a text**. It pulls lines from elsewhere, often only some
  of them, often with words substituted, often next to lines of the section's
  own: two collects joined by `Oremus`, a lesson continued with one more verse, a
  borrowed secret with its own closing. What it produces is the wording of the
  section, so it must be resolved **on the lines**, before the section is
  structured; structuring drops exactly what its substitutions and line ranges
  act upon — verse numbers, reference markers, introductions.
- A **broad reference** — a whole-file include (`@File`, `ex …`) or a selective
  borrow (`vide …`) — **borrows sections whole**. It never changes their wording,
  so it can be resolved after the sections are filed, by copying keys.

The ordering follows from this:

1. **Inline references** are resolved first (step 4), so every section holds the
   wording it will be said with.
2. The sections are **structured** (step 5): a key is derived from a text's
   structured content — its canonical scripture reference, or its opening words.
3. They are **filed** into the stores (step 6), and each leaves its key behind.
4. **Broad references** are resolved (step 7) by copying the keys the borrowed
   sections already hold.
5. Only then are the rubric-variant directories **folded** (step 8), the files
   **named** (step 9), the commemorations **split out** (step 10), the redundant
   variants **collapsed** (step 11), and the propers **published** (step 12).

The propers are of two books. The **Mass** is what a day sings and reads at the
altar; the **Office** — the Breviary — is what it prays at the Hours: its
invitatory, hymns and antiphons, its Matins lessons and responsories, its
chapters and versicles. Both are texts of the same kind, borrowed from the same
commons, and both go the same way through every step: the Office's antiphons,
hymns, chapters, responsories and versicles are structured and filed beside the
Mass's readings, prayers and chants, and published with them. What the
pipeline publishes of the Office is its **propers** — what a day says of its own
or takes from its common — not the Hours assembled: the psalter, the ordinary
and the rubrics that put them together are the reader's.

The store is opened at step 6 and **added to** once more, by the commemoration
split (step 10), where a saint's prayers first stand as texts of their own. It is
never rewritten, only extended, and step 12 ships the subset the propers
actually name.

The same holds between languages. A translation says the base language's Mass
in other words; it does not make the day of its own. So the days are published
**once**, as the base language lays them out, and holding keys alone; a
translation is published as stores **keyed by the base language's keys**, each
entry the translation's wording of that text (step 12).

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
the hand-maintained assets, and is written as YAML (`.yml`). Step 12 is
therefore the one place the two formats meet.

The pipeline runs in two modes:

- **Streaming (steps 0–3)** — each source file is processed independently and
  passed through every step in the requested range before being written once.
  These steps read only the file in front of them.
- **Batch (steps 4–12)** — whole-directory passes. From step 4 on, a step reads
  more than one file at a time: it reads another day's file to resolve a
  reference, files texts into a per-language store, merges the same saint across
  documents, or writes a shared file alongside the tree. Each batch step fully
  rebuilds its output directory.

The move to batch at step 4 is not incidental. Resolving a reference means
reading the file it names, and the store is per language; neither fits the
one-file-at-a-time streaming model.

The **stores travel with the tree**: from step 6 on, each language root holds
`lectio.json`, `oratio.json` and `antiphona.json`, and the Office's
`hymnus.json`, `capitulum.json`, `responsorium.json` and `versus.json`, beside
its directories, and
every later step carries them forward to its own output, adding to them only
where this document says so.

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
    `sundaytable.txt`, `XPRex.txt`, `02-02-quadp.txt`, `dom-oct.txt`,
    `Quad5-5Feriarc.txt`, `Propaganda.txt`.

    `Martyrologium/Mobile.txt` is read: it holds the Martyrology's
    announcements of the movable days (see [The
    Martyrology](#the-martyrology)).

  Only the **ingested languages** are read — the sources carry fifteen, and
  each one is a full copy of the tree that costs its own pass and its own
  published package. The list is named in step 0; every language the sources
  carry has an ISO code ready for it on output (see
  [Path mapping](#path-mapping)), so adding one is a single entry.

### Output

- One JSON file per accepted source file, under `.divinum-officium\step0\`.
- Contents: a sequence of strings — one entry per source line.

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

1. Changing the file extension from `.txt` to `.json`.
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
   - `missa\Latin\02-02.txt` → `missa\la\02-02.json`
   - `horas\Nederlands\01-01.txt` → `horas\nl\01-01.json`

3. **Ordinarium exception:** sources under `horas\Ordinarium` are
   language-agnostic and keep their path (extension change only):
   - `horas\Ordinarium\Prima.txt` → `horas\Ordinarium\Prima.json`

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
  step 7 sees a clean reference `@SanctiM/11-14M`.
- **`missa/Nederlands/Sancti/09-02.txt`** — its mistyped header `d[Rank]` is
  rewritten to `[Rank]`.

---

## Step 2 — The Mass and the Office, side by side

Files the `horas` (Divine Office) and `missa` (Mass) document of each day beside
each other, below their language. Step 2 changes no section content; it only
moves the `horas`/`missa` segment below the language, so that every later tree
is rooted at the language — where, from step 6, the stores live.

The two stay **separate documents** until [step 8](#step-8--directory-and-filename-suffixes-to-rubric-conditions-batch)
combines them. Each resolves its own references, as the sources do: whether a
day still lacks a section it borrows from its common is a question about its
Mass, or about its Office, not about the two together. A Mass with no Gospel of
its own takes its common's, even where the Office gives a Gospel for Matins.

### Input

- The step 1 object for one file, plus the source file's path.

### Output

- Section content is **unchanged**.
- The output **path** has the `horas`/`missa` segment moved below the language
  (see [Path mapping](#path-mapping-1)). Every input still has an output of its
  own.

### Path mapping

- Swap the `horas`/`missa` segment with the language segment after it:
  - `missa\la\Sancti\01-01.json` → `la\missa\Sancti\01-01.json`
  - `horas\la\Sancti\01-01.json` → `la\horas\Sancti\01-01.json`
- A variant directory or filename suffix is left untouched (that is step 8's
  job): `missa\la\SanctiCist\01-01t.json` → `la\missa\SanctiCist\01-01t.json`.

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
derived from its stopword, its scope phrase and its instruction. They close the
conditional, in this order: an optional scope phrase (`loco hujus versus`,
`loco horum versuum`, `hic versus`, `hi versus`, `hoc versus`, `hæc versus`,
`haec versus`), an optional instruction (`dicitur`, `dicuntur`, `omittitur`,
`omittuntur`), and an optional `semper`. What remains before them is the rubric
condition: `(rubrica 1955 aut rubrica 1960 omittitur)` is the condition
`rubrica 1955 aut rubrica 1960` with the instruction `omittitur`.

- **Strength** (how wide a nesting the conditional governs) comes from the
  stopword: `si` → 0; `deinde` → 1; `sed` → 1; `vero` → 1; `atque` → 2;
  `attamen` → 3. A stronger conditional overrides weaker ones nested above it.
- **Back-scope** — how many *preceding* lines the conditional retroactively
  claims:
  - *line* — the single immediately preceding line (the default for the
    back-referencing stopwords `sed`/`vero`/`atque`/`attamen`);
  - *chunk* — the preceding run of non-blank lines, back to a blank line (a
    scope phrase naming `versus`, or the `omittitur` instruction);
  - *nest* — everything back to the current nesting fence (a scope phrase
    naming `versuum`, or the `omittuntur` instruction);
  - *none* — no backward effect (plain `si`, or a `semper` conditional).
- **Forward-scope** — how many *following* lines it governs: none after
  `omittitur`/`omittuntur`, which only take lines away; after `dicuntur`, the
  following chunk where the back-scope is a chunk and the whole nesting
  otherwise; and in every other case the following chunk where the back-scope
  is a chunk or a nest, and the following line where it is not.

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

## Step 4 — Inline references *(batch)*

Replaces each **reference line** — a line beginning `@` within a section — with
the lines it names, so that every section holds the wording it will be said
with. This is text assembly: a reference may pull a whole section, a few lines
of one, or a section with words substituted, and a section may join several
references and lines of its own. It runs on the lines, before step 5 structures
them.

Step 4 runs while variant directories (e.g. `SanctiM`, `SanctiCist`) are still
**separate** files — the fold (step 8) comes much later — so a reference such as
`@SanctiM/11-14M:Lectio1` resolves directly to its own file.

### Input

- The step 3 tree, one language at a time.

### Output

- The same object shape. Every reference line is replaced by the resolved lines;
  a reference that cannot be resolved is **left in place** unchanged. Scalar
  section values pass through untouched.
- The broad references — the `@File` lines of `__preamble`, and the `ex`/`vide`
  of `rank` and `rule` — are **not** resolved here; they are declarations step 7
  acts upon. `__preamble` is therefore kept, and its lines are not treated as
  inline references.
- A **rank** that is itself an inline reference — the Dominican Easter Monday's
  `[Rank]` is `@Tempora/Pasc0-1` — is left in place too, and resolved by step 7
  *after* the broad references. A rank borrowed this way says how the day is
  kept; the `ex Pasc0-0` it carries is the Roman day's own include, and does not
  make the Dominican day include Easter Sunday as well.

### Reference syntax

A line whose text begins with `@` is a reference:
`@File:Section:lineRange:s/pattern/replacement/flags`, colon-separated, where all
parts after `File` are optional:

- **`File`** — the target file path, relative to the language root. If omitted
  (the reference begins `@:…`), the **current file** is the target — the section
  is pulled from the file itself.
- **`Section`** — the section to pull, kebab-cased. If omitted, the section of
  the **same name** as the one holding the reference: `@Commune/C2` within
  `[Oratio]` pulls the common's `oratio`.
- **`lineRange`** — `N` or `N-M`, selecting lines *N*…*M* (1-based, inclusive).
- **`substitution`** — one or more `s/pattern/replacement/flags` groups applied
  to the pulled lines, as Divinum Officium applies them (see
  [Resolution](#resolution), item 5).

The substitution runs from the first `:s/` to the end of the line — a space may
stand before the `s`, as in `@Commune/C7a:: s/N\./N. Vírginis tuæ/` — so a colon
inside it — `s/.*5 /!1 Tim 3:5-9/` — belongs to the substitution rather than
separating parts. A line range and a substitution may both be given, and then
a space alone may separate them: `@Commune/C7:Ant Vespera:1 s/;;.*//g` is line 1
of the common's Vespers antiphons with its psalm number taken off, and
`@Commune/C7::3 s/121/126/` line 3 of the section of the same name.

### What a target holds

A reference reads the target file **as it stands once its own broad references
are taken into account** — what step 7 will make of it, on the lines — and
**with its Mass and its Office together**: the two documents of the target
unioned by condition, the Mass winning a collision. A section a file does not
give itself but borrows from its common is found in it all the same, with the
condition its borrowing carries. A file is looked through this way at most once
per run, and the look-through follows the rules of step 7 in full: the order of
includes and borrows, which sections a borrow takes, the day's own text taking
precedence, the base language's rank for a translation, the base language's
own sections standing for a translation's, and a cycle yielding nothing to
borrow.

The target's own inline references are not resolved by that look-through; a
pulled line that is itself a reference is resolved as described under
[Resolution](#resolution), item 6.

### Resolution

For each reference line:

1. Look the target file up (see above). If the sources do not carry it, the
   reference line is left unchanged.
2. Choose the section — matched by exact key, by a `…/section` suffix, or by a
   `section-` / `section/` prefix.
3. From that section choose the variant for the current rubric condition: the
   variant with that exact condition, else the most specific variant whose
   condition the current one already includes (under `1962` and `monastica`, the
   target's `1962` wording), else the default (unconditional) variant, else the
   first.
4. Apply the line range, if any.
5. Apply the substitutions, if any, in the order written. Each is a
   regular-expression replace on **the lines joined as one text**, exactly as
   Divinum Officium does it: with its own flags and no others, so that without
   `g` only the first match is replaced — which is how
   `s/$/_/gm s/_/;;109/s s/_/;;112/ s/_/;;115/` numbers the psalms of a run of
   antiphons one after another — `m` lets `^` and `$` stand at every line, and
   `s` lets a dot cross them: `s/^V\..*//sm` takes the first versicle and all that
   follows it away. An escape in the pattern keeps its meaning (`\.` is a dot,
   `\$` a dollar), the delimiter `\/` apart; in the replacement `\n` is a line
   break. An invalid pattern is skipped.
6. Resolve the references among the resulting lines, each in turn,
   recursively (transitively), up to a depth of **5**: a hymn taken from another
   with its doxology cut off, or a collect with the commemoration of another
   saint added, ends in a reference of its own. This is after the
   substitutions, so a substitution acts on the target's text as it is written
   and the references it holds are resolved once the text is made. A nested
   reference that omits its file (`@:…`) names the file it was found in — the
   target, not the file the resolution started from. A nested reference that
   cannot be resolved stays as it is, a line of its own.

The reference line is then replaced by the resulting lines. A reference that
resolves to an empty section removes the line; only an *unresolvable* reference
(missing file or section) leaves the line in place.

A line ending in `~` is **joined to the line after it**, with a space between —
the mark is Divinum Officium's, and a substitution often appends it
(`s/$/~/`) so that a borrowed verse runs on into the section's own `Allelúja.`
or closing. A reference line (`!…`) takes nothing after it, and nothing is
joined that opens a part of its own — a verse (`V.`), a response (`R.`), a
reference, a closing (`$…`), a `&` or `_` line. There the `~` is only dropped,
as it is on a section's last line.

### Examples

- Pulling one section:

  ```
  section lectio1 = [{ value: ["@Commune/C1:Lectio1"], condition: [] }]
  with Commune/C1 → { lectio1: [{ value: ["borrowed lectio"], condition: [] }] }
  ⇒ lectio1 = [{ value: ["borrowed lectio"], condition: [] }]
  ```

- Assembling a section — the collect of SS. Peter and Paul joins two collects:

  ```
  oratio = [{ value: ["@:Oratio Pauli", "$Oremus", "@:Oratio Petri"], condition: [] }]
  ⇒ oratio = [{ value: [<the collect of Paul>, "$Oremus", <the collect of Peter>], … }]
  ```

- A section the target only borrows is found: `@Sancti/11-09:Evangelium`, where
  `Sancti/11-09` takes its Gospel from `Commune/C8` by `vide`, pulls the common's
  Gospel.

### In the Martyrology, a reference brings its target's rubric variants with it

A day of the Martyrology lists its entries by reference, and an entry often has
a wording of its own for a rubric the list does not vary by. Where a target
varies by a rubric the borrowing variant does not name, the borrowing variant is
written once more for each such target variant — labelled with both conditions,
and resolved under the combined one — so that the entry's wording for that rubric
is not lost behind its default. A variant the list gives of its own takes
precedence: no copy is written where the list already has a variant at least as
specific for that rubric.

This is not done for the Mass and Office. There a target is read with its Mass
and Office together, so a target section can hold the Mass's wording beside a
variant that is the Office's, and bringing variants along would carry the Office
into the Mass.

For example, a day lists its entries with no condition, and the entry it names
has a default wording and one for the 1960 rubrics:

```yaml
martyrologium:
  - { condition: [], value: ["@:Octava"] }
octava:
  - { condition: [], value: ["Octava Epiphaniæ Domini."] }
  - { condition: ["1962"], value: ["Commemoratio Baptismatis Domini."] }
```

The list then resolves to both:

```yaml
martyrologium:
  - { condition: [], value: ["Octava Epiphaniæ Domini."] }
  - { condition: ["1962"], value: ["Commemoratio Baptismatis Domini."] }
```

### Edge cases

- **Unresolvable reference** (missing file or section) → the `@…` line is kept
  verbatim. Step 6 does not file such a placeholder, and step 12 leaves it
  inline.
- **Recursion depth** is capped at 5; deeper chains stop resolving.
- **Empty target section** → the reference line is removed (replaced by nothing).
- **Scalar section values** pass through unchanged.
- **`__preamble`** is passed through as it stands; its `@File` lines are broad
  references, for step 7.

---

## Step 5 — Structure the sections *(batch)*

Turns each section's lines — assembled by step 4 into the wording the section
will be said with — into the typed shape a store entry has, so that step 6 can
file it under a content-derived key. A reading becomes a reference and its
verses; a prayer, its text and closure; a chant, its antiphon and verse. The
readings of Matins are given the same reading shape as the readings of Mass, so
that a reading is one kind of thing wherever it occurs.

### Input

- The step 4 tree — every section holding its assembled lines.

### Output

- The same shape; each recognized Mass or reading section has every variant's
  `value` replaced by a typed object, keeping its `condition`. Non-recognized
  sections pass through unchanged, except for the Matins readings and the `rule`
  cleanup described below.

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

The Alleluia sung after the Gradual is **lifted out of `graduale` into
`alleluia`**, keeping the condition of the variant it came from — as
`Prefatio=X` is lifted out of `rule` below. A gradual whose second block is a
`!Tractus` has no Alleluia — that block is a tract — and yields no section.

**The boundary is the `Allelúja, allelúja.` cue, not the first reference.** Where
that cue appears after some gradual content, everything before it is the Gradual
and everything after it is the Alleluia — even when the cue falls inside a
referenced block, and even when the Gradual's own antiphon and verse are given
under two separate references. A cue that opens the whole section is not a
boundary; it is skipped as before.

Within the Gradual, antiphon and verse are told apart by the `v.` marker, not by
their order: the marked lines are the verse and the unmarked lines the antiphon,
each keeping the reference of the block it came from, even where the source lists
the verse first. After the cue, a verse that merely repeats the Gradual's verse
is dropped, and the Alleluia takes the remaining, distinctive verse.

For example, a `[Graduale]` that reads (antiphon and verse under separate
references, then the Alleluia after the cue):

```
!1 Cor 3:19; 3:20
v. Sapiéntia hujus mundi… vanæ sunt.
!1 Cor 1:19
Perdam sapiéntiam… reprobábo.
Alleluja, alleluja.
v. Sapiéntia hujus mundi… vanæ sunt, alleluia
!Phil 3:8
Verúmtamen exístimo… Dómini mei. Allelúja.
```

yields the Gradual antiphon `Perdam sapiéntiam… reprobábo.` (1 Cor 1:19) and
verse `Sapiéntia hujus mundi… vanæ sunt.` (1 Cor 3:19-20), and the Alleluia
`Verúmtamen exístimo… Dómini mei.` (Phil 3:8) — the repeated `Sapiéntia…` verse
after the cue being dropped.

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

A verse opens at its `!ref`, or at a `v.` where the source gives none, so a
verse may carry no reference. The `Allelúja, allelúja.` opening is dropped: it
is the same words every time, and the section being an Alleluia already says
them.

### Readings

The readings are treated as one kind of content wherever they occur: the Mass
readings `lectio`, `evangelium` and `ultima-evangelium`, and the readings of
Matins — `lectio1` … `lectio9` and the `…-in-N-loco` counterparts that place a
reading elsewhere in the Office. Giving them one shape lets
[step 6](#step-6--shared-stores-batch) store them together.

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

A reading with no marker keeps its lines as `{ text }`, with no `ref`. Step 6
stores it under a key built from its opening words.

#### Several references

A reading drawn from more than one passage keeps its original lines. Structuring
it would keep one reference and silently lose the interior ones. Such a reading
passes through this step unchanged, and step 6 then leaves it inline — a
deliberate omission rather than a final state.

One lesson of Matins is drawn from two passages by design: the **homily**, which
opens with the Gospel it expounds. Its lines are the Gospel — its introduction,
its reference, its opening words — then a `_` line, then the homily — its
author, its source, its text. Each part is structured as a reading of its own,
and the lesson is the homily with the Gospel beside it:

```yaml
ref: Homilía 9 in Evangelia
text: "Homilía sancti Gregórii Papæ\nLéctio sancti Evangélii, fratres caríssimi…"
evangelium:
  ref: Matt 25:14-23
  verses: ["In illo témpore: Dixit Jesus discípulis suis parábolam hanc…"]
```

A lesson in two parts that are not each one reading keeps its lines, like any
other drawn from several passages. This is the Matins lessons' alone: a reading
of the Mass in two parts is not a homily.

### The Office

The proper texts of the Office are structured by what they are, whichever Hour
says them. The Matins lessons are readings (above); the collect is the prayer
`oratio`, said at Mass and at the Hours alike.

| Kind | Sections | Shape |
| ---- | -------- | ----- |
| antiphon | `invit`, `ant-1`, `ant-2`, `ant-3` | `{ text }` |
| psalmody | `ant-matutinum`, `ant-laudes`, `ant-vespera`, `ant-vespera-3` | `{ antiphonae: [{ text, psalmus }] }` |
| hymn | `hymnus-matutinum`, `hymnus-laudes`, `hymnus-vespera`, `hymnus-vespera-3` | `{ strophae: [[line]], doxologia: [line] }` |
| chapter | `capitulum-laudes`, `capitulum-tertia`, `capitulum-sexta`, `capitulum-nona`, `capitulum-vespera`, `lectio-prima` | `{ ref, text }` |
| responsory | `responsory1` … `responsory8`, `responsory-breve-tertia`, `responsory-breve-sexta`, `responsory-breve-nona` | `{ responsum, versus, repetitio, gloria }` |
| versicle | `versum-1`, `versum-2`, `versum-3`, `versum-tertia`, `versum-sexta`, `versum-nona`, `nocturn-1-versum`, `nocturn-2-versum`, `nocturn-3-versum` | `{ versus, responsum }`, or `{ text }` where an antiphon stands for it |

The sources' marks are read as follows, and taken off the text:

- **antiphon** — the line is the antiphon. Its `*`, where the choir takes up the
  intonation, is part of the text and stays.
- **psalmody** — one entry per line. An antiphon line gives its psalm after
  `;;` — `Hæc est Virgo sápiens, * et una de número prudéntum.;;109` is the
  antiphon of Psalm 109 — as `psalmus`; a line that is nothing but `;;N` is a
  psalm said under the antiphon before it, and has no `text`. A line with no
  `;;` has no `psalmus`. A mark trailing the psalm — the `;` of `46;`, the `_`
  a substitution leaves after the last of a run of them — is dropped. At Matins a nocturn's versicle may stand among the
  antiphons, as a `V.` line and an `R.` line; it is an entry
  `{ versus, responsum }` in its place.
- **hymn** — the lines are the stanzas, a `_` line between two. The stanza whose
  first line opens with `*` is the doxology: it is said in another wording in
  some seasons, so it is `doxologia` rather than a stanza, without its `*`. The
  `v.` that opens the first line, and a `{:…:}` label before it, are dropped,
  and so is a direction to the reader — *the stanza that follows is said
  kneeling* — standing on a `!` line or between `/:` and `:/`.
- **chapter** — a `!` line is `ref`, and the lines after it, the opening `v.`
  dropped, are `text`. The `$Deo gratias` that answers a chapter is the same
  every time and is dropped.
- **responsory** — the `R.` line (`R.br.` for a short responsory) and the `*`
  line under it are `responsum`, joined by a space; the `V.` line is `versus`;
  the `R.` line after it, what is repeated, is `repetitio`; and after the
  `&Gloria` line, which stands for the *Glória Patri* — or the `$Requiem` line
  that stands in its place in the Office of the Dead — the `R.` line said
  after it is `gloria`. A responsory with neither has no `gloria`. A short
  responsory's second `R.` line — the choir repeating the first — is dropped.
- **versicle** — the `V.` line is `versus`, the `R.` line `responsum`. During
  the Easter octave the line is `Ant. Hæc dies * …`: an antiphon stands where
  the versicle is said, and it is `{ text }`.
- **a lesson of Matins** — a `&teDeum` line closing the last lesson marks where
  the *Te Deum* is said; the hymn is the reader's, and the line is dropped from
  the lesson. A lesson read in place of another begins with a direction — `!de
  Homilía Feriæ.` — before its own introduction; it is no reference, and is
  dropped. A lesson a rubric leaves out (`lectio3` under `1962`, whose
  variant is empty) stays an empty section and is **not** structured into a
  lesson of no words: an empty variant says the lesson is not read.

A section these marks do not fit — the lines in another order, or a mark
missing — keeps its lines, like a reading with several references, and step 6
leaves it inline.

The other sections of the Office are not structured. The rules of a day, the
antiphons of the small Hours, the commemorations and the uses' own sections —
the monastic hymns (`hymnusm-…`), the Cistercian chapter (`mm-capitulum`) — keep
their lines.

### An unresolved reference

A section whose lines still hold an `@…` reference that step 4 could not
resolve is structured like any other, and the reference becomes its text. Step 6
recognizes such a placeholder and does not file it.

### Rule cleanup

The `rule` section is cleaned per variant: `Gloria` and `Credo` lines are
dropped, and a `Prefatio=X` line is lifted out into a `prefatio` section (value
`X`, lowercased) carrying the same condition.

A preface may name the rubric it is said under in a trailing `(…)`:
`Prefatio=Cord (rubrica divino)` is the Sacred Heart preface under the Divino
rubrics. The condition is read with the [Appendix A](#appendix-a--rubric-conditions)
grammar and added to the variant's own, so the preface is `cord` under `divino`
— not a preface named `cord (rubrica divino)`. A condition with several
alternatives (`aut`) gives the preface once under each.

### Commemorations

The `commemoratio-oratio` / `-secreta` / `-postcommunio` sections are **not**
structured here, and are left as lines. Each of their variants opens with a
`!Pro S. …` line naming the saint the commemoration is of, which
[step 10](#step-10--split-commemorations-batch) reads to split the saint out; only
then, standing alone, is the saint's prayer structured and filed. Structured
here, the `!Pro` line would be folded into the prayer's text and the saint's
identity lost.

---

## Step 6 — Shared stores *(batch)*

The step that creates the store — before any borrowing between files is
resolved. It lifts the structured readings,
prayers and chants of each language out of the day files into shared stores and
leaves a key in their place. The same pericope is read, and the same oration
said, on many days and under many rubrics, so each text is filed once and
referred to.

### Input

- The step 5 tree.

### Output

- The **store files** at each language root — `lectio.json`, `oratio.json` and
  `antiphona.json` for the readings, prayers and chants, and `hymnus.json`,
  `capitulum.json`, `responsorium.json` and `versus.json` for the rest of the
  Office — one entry per distinct text, keyed as described under [Keys](#keys),
  in the shape step 5 gave it.

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
  ```

- Every day file rewritten so that each variant of a covered section holds the
  **key string** instead of the structured text:

  ```yaml
  evangelium:
    - condition: []
      value: matt-11-25-30
    - condition: [monastica]
      value: matt-11-25-30
  ```

Everything else — section keys, variant lists, conditions, and every
unstructured section — is unchanged.

### Covered sections

Three kinds of section are lifted, each into its own store. The sets are owned
by the calendar library and imported here, so a section can never be filed where
no reader looks for it.

**Readings**, into `lectio.json`: the Mass readings `lectio`, `evangelium` and
`ultima-evangelium`, and the Matins readings `lectio1` … `lectio9` together with
their `…-in-N-loco` counterparts. Mass and Matins readings share one store —
they are the same scripture, and a passage read at Mass on one day and at Matins
on another is stored once.

**Prayers**, into `oratio.json`: `oratio`, `secreta` and `postcommunio`. These
repeat even more heavily than the readings do, because the commons supply one
oration for a whole class of saint, with the name left as `N.` to be filled in
when the day is rendered.

**Chants**, into `antiphona.json`: `introitus`, `graduale`, `alleluia`,
`alleluiap`, `tractus`, `offertorium` and `communio`. A chant is stored whole,
with its antiphon, verse and any alleluia together, since those travel as one
piece. The antiphons of the Office are chants too, and go into the same store:
the invitatory, the antiphons of the *Benedictus* and the *Magnificat*, and the
psalmody of Matins, Lauds and Vespers.

The other texts of the Office each have a store of their own, since none is
the same kind of thing as a reading, a prayer or a chant:

- **Hymns**, into `hymnus.json`: `hymnus-matutinum`, `hymnus-laudes`,
  `hymnus-vespera`, `hymnus-vespera-3`.
- **Chapters**, into `capitulum.json`: `capitulum-laudes`, `capitulum-tertia`,
  `capitulum-sexta`, `capitulum-nona`, `capitulum-vespera`, and the short
  lesson of Prime, `lectio-prima`.
- **Responsories**, into `responsorium.json`: `responsory1` … `responsory8`,
  and the short responsories of Terce, Sext and None.
- **Versicles**, into `versus.json`: `versum-1`, `versum-2`, `versum-3`, the
  versicles of the small Hours and of the three nocturns.

Every other section is left untouched.

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

Two entries that share a reference but differ in content are **both kept**. The
first keeps the plain key; each further one is disambiguated by appending a
counter (`matt-11-25-30-2`, `matt-11-25-30-3`).

**A key is never given twice.** A counter can land on a key another reference
holds as its own: `Ps 111:1` filed a second time would take `ps-111-1-2`, which
is the plain key of `Ps 111:1-2`. Given twice, the key would name whichever text
was filed last, and the days filed first would read someone else's chant. So a
key already taken is passed over, and the counter moves on to the next free one
— `Ps 111:1` filed a third and fourth time, after `Ps 111:1-2` and `Ps 111:1-3`
took their keys, becomes `ps-111-1-4` and `ps-111-1-5`.

A **prayer**, and any entry **without a reference**, is keyed by its opening
words — the first four words of the text, in the same kebab form — followed by a
short hash of the whole content, so that two texts opening alike stay apart. For
a chant the opening words are its antiphon's:

| Opening                          | Key                                |
| -------------------------------- | ---------------------------------- |
| `Sed et reprobórum duos ördines…` | `sed-et-reproborum-duos-9f2c1a7e`  |

Because the hash covers the content, these keys never collide and take no
counter. Two identical entries produce the same key, so they still share one
entry.

In practice the reference collisions are spelling differences for the same
pericope — `coeli` against `cœli`, `ejus` against `eius`, `Judæam` against
`Judǽam`. They are preserved rather than reconciled: the step does not normalize
the orthography of a liturgical text, and each day keeps the exact wording its
source carried.

### A stable, growing store

The store is opened here and **added to** once more, by the commemoration split
([step 10](#step-10--split-commemorations-batch)), when a saint's prayer first
stands as a text of its own. Between the two, it travels with the tree unchanged:
step 7 resolves the borrowings by copying keys, which introduces no text. A key,
once given, is never reassigned.

Documents are visited in a fixed order wherever the store is added to, so the
same source tree yields the same keys and the same store file on every run.

### Edge cases

- **A value step 5 left as lines** — a reading carrying several references — is
  not a structured value; no key replaces it, and it stays inline.
- **A reading whose content is only an unresolved reference** — a lone `@…`
  line that step 4 could not resolve — is left inline. It is not a reading yet,
  and storing it would key a placeholder.
- **A value that carries no words** — an empty structured section — is not
  filed; it stays as it is.
- **An entry used only once** still moves to the store, so a covered section
  holds a key wherever step 5 gave it a shape.

---

## Step 7 — Broad references *(batch)*

Resolves the **file-level** borrowings — a whole-file include (`@File` or
`ex …`) or a selective borrow (`vide …`) — and, because every borrowed text is
already in the store, resolves them by **copying keys**. A day that draws its
Mass from a common comes to hold the keys the common holds; the text those keys
name is stored once and shared.

Step 7 runs while variant directories are still **separate** files — the fold
(step 8) follows it — so a reference such as `@SanctiM/11-14M` resolves directly
to its own file.

### Input

- The step 6 tree, one language at a time, with its stores.

### Output

- The same object shape. The borrowed sections are merged into the file's own,
  and the reserved `__preamble` key is removed. Content that is not borrowed is
  left unchanged.
- A rank that step 4 left as an inline reference is resolved now, after the
  borrowings: what it names is the rank only, not borrowings of its own (see
  [step 4](#step-4--inline-references-batch)).
- The stores, carried forward unchanged. Nothing is filed here: a borrowing
  copies keys and introduces no new text.

### The Mass and the Office borrow apart

The Mass and the Office of a day are still separate documents here, and each
resolves its own references: "still missing" is judged on the borrowing document
alone. A target, on the other hand, is read with its Mass and Office together —
unioned by condition, the Mass winning a collision — so a section either of them
holds can be borrowed.

**The Mass takes none of the Office's sections** — those
[step 12](#step-12--the-propers-batch) publishes as the Office — by include or by
borrow. A day's Office is its Office document's, which takes from its common
what it lacks for itself. Were the Mass to take them as well, its copy would win
when the two are combined (step 8), and the common's text would stand in place
of the day's own: St Agnes, who has an antiphon of her own at the *Magnificat*,
would say the common's. A day the sources give a Mass and no Office has none.
The collect is the Mass's own section, and the Mass takes it as before.

### Where references come from

Each reference carries the rubric condition of the variant it was found in.

- **`__preamble`** — a line beginning with `@` is a whole-file include. The path
  is the text after `@` up to the first `:`; any `:Section` suffix is ignored.
- **`rank`** — the fourth `;;`-separated field of a rank line:
  - `ex X` → whole-file include;
  - `vide X` → selective borrow;
  - a bare value with no keyword (e.g. `C5c`) → treated as `vide`.
- **`rule`** — a line beginning `ex X` or `vide X` (other rule lines are
  ignored).

### Include vs. borrow

- **Include (`@` / `ex`)** — import **all** sections of the referenced file.
- **Borrow (`vide`)** — import these sections:
  - **always**: the Office texts a day takes from its common —
    `lectio*` (the Matins lessons and the short lesson of Prime), `oratio*`,
    `invit`, `hymnus*`, `capitulum*`, `responsory*` (the Matins responsories
    and the short responsories), `versum*` and `nocturn-*-versum` (the
    versicles), and `ant-1`, `ant-2`, `ant-3` (the antiphons of the
    *Magnificat* and the *Benedictus*).

    The **psalmody** is not borrowed — `ant-matutinum`, `ant-laudes`,
    `ant-vespera`, `ant-vespera-3`, and the antiphons of the small Hours. A day
    that only borrows from its common says the psalms of the day of the week
    with their own antiphons; it takes the common's antiphons only by including
    it (`ex`). This is Divinum Officium's own reading of `vide`.
  - **only where still missing**: the Mass propers `introitus`, `graduale`,
    `alleluia`, `alleluiap`, `tractus`, `evangelium`, `offertorium`, `secreta`,
    `communio`, `postcommunio`, `ultima-evangelium`.

  The Mass propers fill a gap rather than furnish the day. A day that resolves
  its own Mass — from its own text, or from a whole-file include — keeps it
  untouched. One that resolves none, such as a commemoration pointing at a
  common, takes the common's rather than being left without a Mass at all.

  "Still missing" is judged as the references are resolved, and includes come
  before borrows, so an `ex` always wins over a `vide` for the same section.

Whatever the target section holds is what is copied. A section the store covers
holds a **key**, so the borrowing day comes to hold the same key and the text
stays single. A section the store does not cover — the rules, the antiphons of
the small Hours — holds its lines, and those lines are copied.

### A lifted section goes with the one it was lifted from

Step 5 lifts two sections out of others: the **Alleluia** out of the `graduale`,
and the **Preface** (`prefatio`) out of the `rule`. In the sources each is part
of its parent, and a borrowing takes or leaves the parent whole. So it is here: a
lifted section is borrowed exactly where its parent is, and judged by its
parent, not by itself.

A day that sings its own Gradual in Lent — a Gradual with a Tract, and no
Alleluia — keeps the Lenten form. Judged by itself, its missing `alleluia` would
take the common's, and the day would sing a Gradual of its own followed by an
Alleluia of someone else's. Likewise, a day whose own `rule` stands does not take
the Preface of the file it includes.

### Reference-path normalization

A raw reference target is normalized before lookup:

- stray `;mtv`, `;` and `:` characters are removed; `sancti/` is corrected to
  `Sancti/`; surrounding whitespace is trimmed;
- a `…Feria…` marker: the number *n* before `Feria` becomes the condition
  `feria-(n+1)` and `Feria` is dropped from the path;
- a bare `Cn…` target (a `C` followed by a digit) gains a `Commune/` prefix; a
  `Quadp…` / `Epi…` / `Pasc…` target gains a `Tempora/` prefix;
- a **self-reference** (a target equal to the file's own path below the
  language) is dropped.

The target is otherwise used **as written**: a variant directory (`SanctiM`) or
a filename rubric suffix (`…t`) is **not** stripped, because at this step those
files still exist separately — the reference resolves directly to the specific
variant file.

A couple of individual targets receive a fixed correction (e.g. `Tempora/Epi4`
→ `Tempora/Epi4-0`).

### Merging and condition propagation

- Imported section variants have the reference's condition **prepended** to
  their own, so a `vide` made under `1570` contributes sections tagged `1570`.
- What the day already holds is its own and takes precedence; an import only
  fills a gap. An imported variant is added only where no existing variant would
  already apply in its place — that is, where no existing variant's condition is
  contained in the import's.

  Matching whole condition sets is not enough. The Assumption gives its own
  Introit unconditionally, while its rank line includes a common under the 1962
  rubric. Imported at `1962`, the common would out-rank the day's own wherever
  1962 is in force, and the common would be sung in place of `Signum magnum`.

### Borrowing what the target borrowed

A file borrows from its target **as the target stands once its own references
are resolved**: a day drawing on a common that itself includes another common
takes both. The targets are therefore resolved first, each once per run.

Where two files borrow from each other — the Vigil of Pentecost and its rubric
file do — the one reached second through the cycle yields **nothing to borrow**
to the other, which keeps what it has. A reference the sources do not carry
likewise yields nothing. In either case the file is still written: dropping it
would lose a day of the calendar.

Files are visited in a fixed order, so which side of a cycle borrows from the
other is the same on every run.

### A translation borrows the Latin's rank

Most translated files carry no `[Rank]` at all: it says how a day is celebrated
rather than what is said on it, and that is not a matter of language. But the
rank is also where a day names the **common** it draws its Mass from, so a
translation without one borrows nothing and comes out with no Mass — even where
the common itself has been translated.

The rank is therefore taken from the base language, which is the one tree that
always has it — the same day, at the same path below the language root, its Mass
and Office together, as it stands in this step's input. No earlier step touches
the rank, so it is there however the base language's own borrowings turn out —
even for a day caught in a borrowing cycle. The sections the day then borrows
are the translation's own: a Dutch day drawing on `C4a` gets the Dutch `C4a`'s
keys, from the Dutch store.

### A translation borrows only where the base language does

A translation borrows to say what the base language borrows, not to stand in for
what the base language says of its own. Where the base language's day has a
section of its own, that text is the day's, and the translation's wording of it
can come only from the translation's own file of the same day. Borrowed, it
would be another day's text filed under this day's key: St Raphael (24 October)
draws his Office from the Apparition of St Michael (`ex Sancti/05-08`) but has
antiphons, a chapter and a hymn of his own; the Dutch file of 24 October gives
only the collect, and the Dutch would have said St Michael's.

So when a translation's document resolves its references, the base language's
document of the same day and the same book — its Mass for the Mass, its Office
for the Office, as it stands in this step's input — counts as **already held**:
an import fills only a gap that neither the translation's own sections nor the
base language's leave, judged rubric by rubric as under [Merging and condition
propagation](#merging-and-condition-propagation), and a Mass proper or a lifted
section is "still missing" only where both lack it. A section the base language
gives of its own and the translation's file lacks stays missing, and
[step 12](#step-12--the-propers-batch) renders nothing for its key. What the
base language itself borrows, the translation borrows from its own file of the
borrowed day, as before.

A text of its own that is the borrowed day's too does not stand in the way. Many
a day gives its common's collect as a section of its own, *N.* for the name:
the base language holds there the very key its common holds, and the
translation's common says that text. So a variant of the base language's own
counts as already held only where the file being borrowed from, as the base
language reads it, does not hold the same text in the same section.

This holds for every document of the translation, a common being resolved for a
day to borrow from as much as the day.

### Examples

- Preamble include + rank `ex`/`vide` (rank `vide` under `1570`):

  ```
  { __preamble: [{ value: ["@Sancti/12-26:Lectio1"], condition: [] }],
    rank: [{ value: [";;Duplex;;3;;ex Commune/C1"],   condition: [] },
           { value: [";;Simplex;;1;;vide Sancti/12-26"], condition: ["1570"] }] }
  →  includes: Commune/C1, Sancti/12-26   borrows: Sancti/12-26 (condition 1570)
  ```

- Copying a key:

  ```
  day:        { rank: [{ value: [";;Simplex;;1.1;;vide Commune/C2a"], condition: [] }] }
  Commune/C2a { introitus: [{ value: "statuit-ei-dominus-…", condition: [] }] }
  ⇒ day.introitus = [{ value: "statuit-ei-dominus-…", condition: [] }]
  ```

- A bare rank pointer `C5c` normalizes to a `vide` on `Commune/C5c` (the
  `Commune/` prefix added, nothing stripped — `Commune/C5c` is its own file).

### Edge cases

- **Bare rank reference** (no `ex`/`vide`) is treated as a `vide` commune
  pointer rather than an error.
- **`@File:Section`** in the preamble is imported as the whole file; the
  `:Section` narrowing belongs to an inline reference.
- **A reference the sources do not carry**, or one caught in a cycle, yields
  nothing to borrow; the file is kept rather than lost with the reference.

---

## Step 8 — Directory and filename suffixes to rubric conditions *(batch)*

First combines the Mass and the Office of each day into one document. Then reads
the file's **directory** and **filename** to infer which rubric(s) it represents,
adds that rubric to every section's condition, and computes an output path with
the variant markers removed so that all rubric variants of the same day or feast
land on one path. This is where variant directories are folded onto their base —
deliberately after both kinds of reference have been resolved (steps 4 and 7),
so a reference to a variant file found its own file.

### Input

- The step 7 tree, with its stores, which it carries forward unchanged.

### Output

- One document per day, its Mass and Office combined. Each variant's `condition`
  now also carries the tokens derived from the path.
- A **merged output path** (see [Path mapping](#path-mapping-2)) that folds a
  variant directory onto its base and strips the filename's rubric suffix.
  Everything landing on one path is unioned by condition.

### Combining the Mass and the Office

The two documents of a day — which resolved their own references in steps 4
and 7 — are unioned by condition, and on a collision the **Mass wins**.

A section step 5 lifted out of another goes with its parent here as it does when
borrowed (see [step 7](#a-lifted-section-goes-with-the-one-it-was-lifted-from)).
Where the Mass's Gradual stands under a condition, the Office's Alleluia under
that condition is not taken: the Vigil of St Andrew sings its own Gradual and
no Alleluia, though its Office, having included the common of an apostle, carries
the common's Gradual and Alleluia. Likewise the Office's Preface yields wherever
the Mass's rule stands.

### Folding the variant files

The variant files of a day are folded in **path order** — the base file first,
then its variant directories and suffixed files. Their sections are unioned by
condition, the earlier file's variants first; on a collision the **earlier file
wins**. Where the base file gives a variant for a use explicitly — 7 December's
`[Rank] (rubrica cisterciensis)` — it stands over a variant file's for that use.

The order is not cosmetic: step 9 reads a day's designations in it.

### Deriving the rubric context

The directory and filename are read as follows:

1. **Directory and filename.** The immediate parent directory name and the
   filename (without extension) are taken from the path. Three fixed filename
   corrections are applied: `Ferua` → `Feria` (typo), `Epi1-0` → `Epi1-0r`, and
   `Epi1-0a` → `Epi1-0`.
2. **Base directory.** The directory must begin with one of four bases —
   `Commune`, `Martyrologium`, `Sancti`, `Tempora`. If it does not, no rubric is
   derived (the condition stays empty).
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
   `10-DP`, `07-DP`, `11-03sec`, `00-VB`, `00-VE`, `09-DP`, `09-DT`, and the
   Martyrology's `Mobile` — filename
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
[Appendix A](#appendix-a--rubric-conditions). A variant with no prior condition
and no derived tokens stays the default.

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

Step 8 removes the `horas`/`missa` segment step 2 placed below the language, and
the remaining rubric markers, so a day's documents converge:

1. Drop the `horas`/`missa` segment: `la\missa\Sancti\01-01t.json` →
   `la\Sancti\01-01t.json`.
2. If the directory is a variant, rename it to its base (`SanctiCist` →
   `Sancti`).
3. Strip the filename's trailing non-digit suffix (`01-01t.json` →
   `01-01.json`). Excluded files keep their filename.

Examples:

- `la\horas\SanctiCist\01-01.json` → `la\Sancti\01-01.json`
- `la\missa\Sancti\01-01t.json` → `la\Sancti\01-01.json`

### Examples (condition derivation)

- Filename suffix `t` → `1570`:

  ```
  transform({ oratio: [{ value: "concede-…", condition: [] }] }, "Sancti/01-01t.json")
  → { oratio: [{ condition: ["1570"], value: "concede-…" }] }
  ```

- An existing condition is **extended**, not replaced (header `1570` variant in
  a `Cist` directory):

  ```
  transform({ oratio: [{ value: "x", condition: ["1570"] }] }, "SanctiCist/01-01.json")
  → { oratio: [{ condition: ["1570", "cisterciensis"], value: "x" }] }
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

## Step 9 — Filename from liturgical name *(batch)*

Names each file from the feast/office title, and folds `rank`/`officium`/`name`
into a single `name` section. Section content keeps the rubric-variant shape,
now holding keys where step 6 replaced text.

### Input

- The step 8 tree, with its stores, which it carries forward unchanged.

### Output

- Each document is written once per distinct name it yields (see Filenames).
- Its `rank`, `officium` and `name` sections are replaced by a `title` and a
  short `name`; every other section passes through unchanged.

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

### Translations are filed under the Latin's names

A translation renders the texts of a day; what it *calls* the day is its own
business, and it often differs — an abbreviation, a word more or fewer, a second
name for the same saint. So the **base language** — Latin — decides the
filenames, and the translation supplies only the content. Where the base
language files a document under several names, the translation is written under
each of them; a source the base language does not carry keeps its own name. The
base language settles the collision suffix too.

Each file the translation is written as is **described by the translation's own
designation of the same celebration**: the one it files under the same name, or
else the one it gives under the same rubric condition. The Latin 18 August is St
Agapitus under the 1962 rubrics and a day in the octave of the Assumption under
the older books; the Dutch designates both, and each file takes the Dutch
designation of its own rubric. Where the translation designates nothing under
any of the file's rubrics, the file keeps the base language's designation: a
translation's designations need not come in the base language's order, and
pairing them by position titles a day after another kept on the same date — the
Rosary file after St Mark, both 7 October.

### Content transform

`rank`, `officium` and `name` are dropped, and the document is designated as the
**file being written**, with two plain strings:

- **`title`** — the designation the file is filed under: its `officium`, or its
  `rank` where the file is filed under that. Its casing is settled so a day
  reads one way however its source spelled it — the first word may keep its
  capital, but a Latin function word (`post`, `in`, `de`, …) after it is
  lowercased.
- **`name`** — the short name of the celebration, from the `name` section of the
  same rubric condition.

Only what the source gave is emitted. A document with no `officium` and no `rank`
carries no `title`; one with no `name` carries no `name`. Keeping these out of
the rubric conditions also keeps a name given only under one use — `Adriáni`, in
the Cistercian — from being dropped along with that use downstream.

```yaml
# adriani-martyris.yml
title: S. Adriani, Martyris
name: Adriáni
```

### Edge cases

- **No derivable designation** → the original stem is the filename, and neither
  `title` nor `name` is emitted.

---

## Step 10 — Split commemorations *(batch)*

Pulls each commemorated saint out of the day files into a file of the saint's
own, merges the same saint across documents, and — because a saint's prayer now
first stands as a text in its own right — structures it and files it into the
prayer store.

### Input

- The step 9 tree, with its stores.

### Output

- Each main document rewritten **without** its `commemoratio-*` sections.
- One file per commemorated saint, `<dir>/<slug>.json`, holding a display `name`
  and the saint's `oratio` / `secreta` / `postcommunio`. Each of those sections
  holds, per variant, the **key** of the prayer in the store — the same store
  the day files draw on.
- The prayer store, extended with the saints' prayers.

### Transform

- The `commemoratio-oratio` / `commemoratio-secreta` / `commemoratio-postcommunio`
  sections are removed from the main document.
- Within each such section (a variant list of lines), each variant's first line
  names the saint — `!Pro S. …` or `Pro Ss. …`; the `S.`/`Ss.` honorific is
  dropped for the display name and the rest is kebab-slugged for the filename.
  The variant's remaining lines are the saint's prayer for that type; they are
  structured as a prayer (`{ text, closure }`) and filed into the prayer store,
  and the variant comes to hold the key, keeping its `condition`.
- Per saint, the collected type variant-lists plus a display `name` (the `!Pro`
  text, honorific kept) form the saint's file.

This is the second place the prayer store grows. A saint's collect is drawn from
a common as often as a day's is, so filing it into the same store keeps the one
copy the strategy is built to keep.

### Merging

- The same saint (slug) appearing in several documents in one directory merges
  into a single file; a non-empty section replaces the accumulated one. Because
  the fold (step 8) has already normalized variant directories onto their base,
  a saint commemorated in `SanctiCist` and in `Sancti` merges correctly.

### Edge cases

- A `commemoratio-*` variant whose first line is not a `!Pro …` line is skipped.

---

## Step 11 — Variant collapse *(batch)*

Removes the rubric variants that carry content identical to their section's
default, so the tree states a rubric variant only where the rubric actually
changes something. Because the covered sections now hold short keys, this
compares keys rather than full texts.

### Input

- The step 10 tree, with its stores, which it carries forward unchanged.

### Output

- The same shape, with redundant variants dropped. Section keys, conditions and
  every value that differs from the default are untouched.

### The rule

Applied to **every** section, within each section independently: a variant is
removed when all of the following hold.

1. The section has a **default** variant — one whose condition is empty.
2. The variant is not itself that default.
3. Its value is identical to the default's value.

The default variant is always kept, and every variant whose value differs from
the default is kept with its condition intact.

Example — an introit that is the same under every rubric:

```yaml
introitus:
  - condition: []                 value: gaudeamus-omnes-…
  - condition: [cisterciensis]    value: gaudeamus-omnes-…   # same
  - condition: [monastica]        value: gaudeamus-omnes-…   # same
  - condition: ["1570"]           value: laetabundus-…       # differs
→
introitus:
  - condition: []                 value: gaudeamus-omnes-…
  - condition: ["1570"]           value: laetabundus-…
```

### What this assumes of the consumer

Collapsing is only faithful because a rubric that finds no matching variant
falls back to the default. A day under `monastica` no longer finds a `monastica`
variant of the introit above, and must resolve to the default to read the same
text it read before. Any consumer of this tree that selects a variant by rubric
has to implement that fallback; without it, collapsing loses content.

### Edge cases

- **No default variant** — nothing is removed, even when several variants share
  a value. There is nothing to fall back to, so dropping any of them would
  change which rubrics resolve to which text.
- **Every variant identical, with a default present** — only the default
  remains.
- **A section that is not a variant list** is left unchanged.

---

## Step 12 — The propers *(batch)*

The last step, and the only one whose output leaves the pipeline: it narrows the
tree to what the calendar consumes — the propers of the Mass and of the Office
— so that the rest, the psalter, the ordinary and the rules that assemble the
Hours, is not carried into the published assets.

### Input

- The step 11 tree, and its per-language stores.

### Output

- The **days**, once for every language, at the root of the output —
  `Sancti\…` and `Tempora\…`: one file per document of the **base language**
  that has Mass or Office content, holding **only** its Mass and Office
  sections (see [Kept sections](#kept-sections)), in the rubric-variant shape
  step 11 left them. A text is never written into a day; a section holds a key
  (see [Every text is a key](#every-text-is-a-key)).
- A document with neither is **not written** at all.
- At each language root, the **stores** — `lectio.yml`, `oratio.yml`,
  `antiphona.yml`, `hymnus.yml`, `capitulum.yml`, `responsorium.yml`,
  `versus.yml` and `nomen.yml` — keyed by the keys the days hold, each entry
  that language's wording of the text (see [A translation's stores are keyed by
  the base language's](#a-translations-stores-are-keyed-by-the-base-languages)).
- The Martyrology, for each language that has one (see [The
  Martyrology](#the-martyrology)).

```
step12\
  Sancti\adriani-martyris.yml     the day, keys only
  Tempora\…
  la\lectio.yml  oratio.yml  antiphona.yml  hymnus.yml  capitulum.yml
     responsorium.yml  versus.yml  nomen.yml  Martyrologium\…
  nl\lectio.yml  oratio.yml  antiphona.yml  …  nomen.yml
```

### The days are the base language's

A translation renders the texts of a day; what the day *is* — which sections it
has, which variant applies under which rubric, which common it draws on — is
the base language's. After step 11 a translation's day is the base language's
day in other words, and where the two differ in shape it is the translation
that has gone astray: it borrowed from another common, it lacks a variant, a
file of it holds another saint. Published side by side, the two would carry
the same structure twice and let it drift.

So the days are published from the base language alone, and a translation
contributes only its wording. A document of a translation that the base
language does not publish is not published either; the sources carry one,
`Sancti\officium-defunctorum-11-02m1`.

### Every text is a key

A day file holds identifiers and keys, and no text in any language, so the one
file serves every language:

- `title` and `prefatio` are identifiers and are written as they stand: the
  designation the file is filed under, and the name of a preface.
- A reading, prayer or chant holds the key step 6 filed it under.
- A value step 6 **left inline** and that carries words — a Passion read across
  several references, a chant whose antiphon is empty and whose words all stand
  in its verse — is filed now, into the store its section draws on, keyed by its
  opening words and a short hash of its whole content, as step 6 keys an entry
  without a reference. A value that carries no words stays as it is: there is
  nothing in it to say in any language.
- `name` is filed into a fourth store, `nomen.yml`, and the day holds its key:
  the base language's name in the form step 6 gives a reference — lowercased,
  accents folded, every other run a single hyphen. A key is never given twice:
  a second name folding to a key already taken takes the next free counter, as
  in step 6.

```yaml
# Sancti\adriani-martyris.yml
title: S. Adriani, Martyris
name: adriani
introitus: ps-20-2-3
oratio: præsta-quæsumus-omnipotens-deus-96d4f120
# la\nomen.yml
adriani: Adriáni
# nl\nomen.yml
adriani: Hadrianus
```

### A translation's stores are keyed by the base language's

A translation's wording of a base text is found where the two say it: on the
same day. For every published day, every kept section and every variant of it,
the base language holds a key; the translation's **rendering** of that key is
what the translation's own file of the same day says in that place —

- its variant of the **same condition** — its default for the base language's
  default. Step 11 drops a variant only where it repeats the default, so where
  the base language still tells a variant apart and the translation has none,
  the translation lacks that text: its default says another, and renders
  nothing here;
- resolved against the translation's own store, or the value itself where the
  translation left it inline.

A rendering that carries no words is no rendering. A day the translation has no
file for, or a section its file lacks, renders nothing.

A base text is said on many days, and a translation does not always say it the
same way on each: two translators rendered the same collect differently, or a
file of the translation borrowed another common than the base language did. A
text has one home in every language, so one rendering is kept — the one found
on **most** days; between renderings found on as many days, the one met first,
days being visited in path order. The rest are not published.

`name` is rendered the same way, from the translation's `name` of the same day.

A base key the translation never renders has no entry in its store. The
calendar, reading that language, says nothing for that section — as it said
nothing where the translation's own file lacked it.

The base language's stores hold its own entries for the keys the days hold.

Each store is ordered by key.

### Which trees are published

Only the **day trees** — `Sancti` and `Tempora` — are written. A calendar asks
for the propers of a day, and those are the two trees that hold days.

A day nested in a **local calendar** under those trees is published only when
that calendar is one of these:

| Local calendar         | |
| ---------------------- | - |
| `aliquibus locis`      | "in some places" — a universal option of the general calendar |
| `Neerlandia`           | the Netherlands, which the Utrecht local proper reads |
| `Neerlandia/Ultrajectum` | the archdiocese of Utrecht, which the Utrecht local proper reads |

A local calendar is named by its whole path below the day tree, so keeping
`Neerlandia` keeps the days directly in it and not those of the calendars nested
in it: `Neerlandia/Groningen` is not kept. The other regional ones (`Urbis`,
`Bavaria`, `Brasilia`, …) are the propers of a place no local proper of the
calendar reads; they are dropped rather than shipped unreachable.

A kept local calendar is published **at its own path** —
`Sancti/Neerlandia/Ultrajectum/willibrordi-….yml` — beside the general day of
the same name, never in its place. A local day is reached only by a calendar
generated with a local proper that names its local calendar, so it cannot
shadow the general day for anyone else — nor, in that calendar, for a day the
local proper does not keep itself.

`Commune` is not published. It is a base for other days rather than a day
itself: [step 7](#step-7--broad-references-batch) has already resolved the
borrowings, so the commons' texts reach the calendar through the days that use
them — as the keys those days carry. A copy under `Commune` would only be
reachable by a lookup no calendar makes.

The remaining trees — `Ordo`, `Psalterium`, and any other the sources carry —
hold the Office and its rubrics, not the propers of a day, and are not published
either.

### Kept sections

| Kept | |
| ---- | - |
| `introitus`, `oratio`, `lectio`, `graduale`, `alleluia`, `alleluiap`, `tractus`, `evangelium`, `offertorium`, `secreta`, `communio`, `postcommunio`, `ultima-evangelium` | the Mass |
| `invit`, `hymnus-matutinum`, `ant-matutinum`, `nocturn-1-versum`, `nocturn-2-versum`, `nocturn-3-versum`, `lectio1` … `lectio9`, `responsory1` … `responsory8`, `lectio94` | Matins |
| `ant-laudes`, `capitulum-laudes`, `hymnus-laudes`, `versum-2`, `ant-2` | Lauds |
| `lectio-prima` | Prime |
| `capitulum-tertia`, `responsory-breve-tertia`, `versum-tertia`, and the same of `sexta` and `nona` | the small Hours |
| `ant-vespera`, `ant-vespera-3`, `capitulum-vespera`, `hymnus-vespera`, `hymnus-vespera-3`, `versum-1`, `versum-3`, `ant-1`, `ant-3` | Vespers |
| `title`, `name`, `prefatio` | the day |

Everything else is dropped. A document counts as having Mass content when it
keeps at least one section of the Mass, and Office content when it keeps one of
the Office; `title`, `name` and `prefatio` alone are not enough, since nearly
every document carries those. `oratio` is both: the collect is said at Mass and
at the Hours.

`lectio94` is the saint's legend in one lesson, which the 1960 rubrics read as
the last lesson of Matins on a day the saint is commemorated, or keeps a feast
of the third class. The other forms the sources place a lesson in — the
`…-in-N-loco` lessons, the Tridentine and Dominican ones — are other rubrics'
and are dropped, as are the sections of the uses (`hymnusm-…`,
`mm-capitulum`), and the commemorations.

`rule` is dropped here, at the end. It carries how a day is to be observed — how
many lessons, which preface — and the pipeline needs it up to this point:
[step 5](#step-5--structure-the-sections-batch) reads it to lift out `prefatio`.
Once that is done nothing in the propers refers to it again.

### Days whose Mass changes with the season

A handful of days are not one Mass but several, one per part of the year, and
the sources hold them as a single document whose sections carry a season token.
Published as one file, such a day would offer the calendar a choice it has no
way to make; published as one file per season, each falls out as an ordinary day
with an ordinary Mass.

Our Lady on Saturday is the case the sources carry. Its five Masses are
*Rorate coeli* in Advent, *Vultum tuum* from Christmas to the Purification, and
*Salve sancta parens* three times over. Each season is written as its own day,
under `Sancti` and named for the stretch of the year it covers, whatever tree the
source document sat in. Narrowing a document to a season goes section by section:

- A section that has a variant for the season keeps that variant, and only it.
- A section that has none keeps the variants naming **no** season.
- The season token is then removed from the conditions that remain; any other
  token on a variant survives.

A section left with nothing is dropped. The source document itself is **not**
published: it is the five days taken together, and no calendar asks for it.

### Rubric systems not published

The propers are published for one **rubric system** — the 1962 rubrics, the ones
the shipped calendar follows. A variant that requires a different system can
never be chosen when that calendar is generated, so it is dropped rather than
shipped unreachable.

| Kind                | Tokens                                                              |
| ------------------- | ------------------------------------------------------------------- |
| Editions            | `1570`, `1617`, `1888`, `1906`, `1910`, `1913`, `1930`, `1939`, `1951`, `1955`, `1962`, `1963`, `2020` |
| Orders and usages   | `monastica`, `cisterciensis`, `praedicatorum`, `altovadensis`, `divino`, `summorum`, `trident`, `Barroux` |
| Local usages        | any `dioecesis …` or `civitate …`                                    |

A condition token that is **not** a rubric system is left alone. Tokens such as
`octava`, `commemoratio`, `adventus`, `paschali`, `quadragesimae`, `feria-2` …
`feria-7`, `defunctorum`, `septem-dolorum`, `transfer` and `special-a` …
`special-s` say *when* a text applies, not *under whose rubrics*. The 1962
calendar uses them, so they are published.

A section left with no variants is dropped, and a document left with no Mass
content is not written.

### Compaction

The variant shape earns its keep where a section actually varies. Where it does
not, it is scaffolding around a single value, and the published propers drop it.

Two rules, applied last:

1. **An empty condition is omitted.** A variant with no rubric tokens carries no
   `condition` field at all.
2. **A section with only the default variant becomes that variant's value** —
   unless the value is an array, which would be indistinguishable from a variant
   list.

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

### Section order

Sections are written in the order they occur in the Mass, so a day file reads
the way the day is celebrated:

| # | Section | |
| - | ------- | - |
| 1 | `title` | the celebration, before its texts |
| 2 | `name` | its short name |
| 3 | `introitus` | Introit |
| 4 | `oratio` | Collect |
| 5 | `lectio` | Epistle |
| 6 | `graduale` | Gradual |
| 7 | `alleluia` | Alleluia |
| 8 | `alleluiap` | Alleluia in paschaltide |
| 9 | `tractus` | Tract |
| 10 | `evangelium` | Gospel |
| 11 | `offertorium` | Offertory |
| 12 | `secreta` | Secret |
| 13 | `prefatio` | Preface |
| 14 | `communio` | Communion |
| 15 | `postcommunio` | Postcommunion |
| 16 | `ultima-evangelium` | Last Gospel |

The Office follows, in the order of the Hours: first Vespers (`ant-1`,
`versum-1`), Matins (`invit`, `hymnus-matutinum`, `ant-matutinum`, then each
nocturn's versicle, lessons and responsories, and `lectio94`), Lauds
(`ant-laudes`, `capitulum-laudes`, `hymnus-laudes`, `versum-2`, `ant-2`),
Prime (`lectio-prima`), Terce, Sext and None (each its chapter, short
responsory and versicle), and second Vespers (`ant-vespera`, `ant-vespera-3`,
`capitulum-vespera`, `hymnus-vespera`, `hymnus-vespera-3`, `versum-3`,
`ant-3`).

A section outside these lists — there should be none — is written after them,
in alphabetical order, so nothing is silently dropped by being unrecognized.

The store files are ordered by key, so both they and the day files diff cleanly
between runs.

### The store subset

Only the entries the days name are carried over. Entries only a dropped section
or variant named — the lessons of other rubrics, the monastic hymns — do not
travel with the propers; neither do a translation's entries the base language's
days never come to.

### The Martyrology

The Martyrology is published beside the propers, as
`Martyrologium/<MM-DD>.yml` for each date, `Martyrologium/mobile.yml` for the
movable days and `Martyrologium/conclusio.yml` for the versicle that closes
every reading, under each language whose sources carry a Martyrology. Its text is read at
Prime, and nothing about it varies with the day it falls on beyond what these
files say, so it is published already reduced to the rubric in force: a section
takes its variant for that rubric, or its default where it has none. A variant
for any other rubric is dropped. No condition survives into the published
files.

A date's file holds:

- `titulus` — the line that opens the day's reading, its date in the Roman
  reckoning: *Duodécimo Kaléndas Februárii*;
- `elogia` — the day's entries, in the order the day lists them, one text each.

```yaml
titulus: Duodécimo Kaléndas Februárii
elogia:
  - Romæ pássio sanctæ Agnétis, Vírginis et Mártyris; …
  - Athénis natális sancti Públii Epíscopi, …
```

The list of entries is taken as the references step 4 resolved it to, with:

- **an entry the language has no words for left out.** The sources list an
  entry another book carries; where its section is empty here, the reference
  stays as it stood, and Divinum Officium prints nothing for it. Neither does
  this.
- **blank lines left out.** They only keep the conditionals in the list apart.
- **the rubrics within the text left out.** A passage between `/:` and `:/` is
  a direction to the reader — *Hic vox elevatur, et omnes genua flectunt* — not
  part of what is read. A line that is nothing else is dropped, and a direction
  within a line is removed from it.

A date whose entries are all left out keeps its `titulus` and has no `elogia`.

`mobile.yml` maps the day each announcement belongs to — as the sources key
it, by week of the year and weekday (`adv1-0`, `pasc0-1`, `pent02-5`), or
`10-du` for the last Sunday of October, in the lowercase step 1 gives every
section name — to the lines of the announcement read before the entries of
that day. An announcement that is empty under the rubric in force is not
published. Nor are the three the sources key to something other than a date:
`defuncti` and `defunctim`, which Divinum Officium attaches to the office of
the day it is read on (and the commemoration of the faithful departed is in the
entries of 2 November already), and `nativity`, which nothing reads (the
announcement of the Nativity is in the entries of 25 December).

```yaml
quad6-0:
  - Domínica secúnda Passiónis, seu in palmis, …
pasc5-3:
  - Vigília Ascensiónis Dómini nostri Jesu Christi.
  - Romæ Litaníæ minóres ad sanctum Petrum.
```

`conclusio.yml` holds the versicle and its response, from the Office's common
prayers (`Conclmart`), with their `V.` and `R.` marks taken off:

```yaml
versus: Et álibi aliórum plurimórum sanctórum Mártyrum et Confessórum, atque sanctárum Vírginum.
responsum: Deo grátias.
```

The response is the prayer the versicle's `$Deo gratias` line names. A language
carrying the common prayers but no Martyrology of its own publishes no
conclusion either: there is no reading for it to close.

### Edge cases

- **A value left inline** by step 6 is filed here where it carries words (see
  [Every text is a key](#every-text-is-a-key)). One that carries none — an empty
  section, an unresolved inline reference — stays inline and needs no store
  entry.
- **A key naming no entry in the base language's store** is impossible by
  construction, since the subset is built from the keys the days actually hold.
  In a translation's store it is the rule wherever the translation renders
  nothing.

---

## Appendix A — Rubric conditions

Rubric conditions — from section headers, filename and directory suffixes, and
inline conditionals — select which variant of a text applies under which rubric.
A **condition** is a set of rubric *tokens* (e.g. `1570`, `2020`, `monastica`);
a **variant** pairs a `value` with a `condition` (its tokens), where an empty
condition denotes the default/unconditional case.

> This appendix covers the condition handling used by steps 1, 5 and 8.
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
