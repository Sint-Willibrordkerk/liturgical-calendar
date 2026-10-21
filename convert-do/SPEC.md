# convert-do — Pipeline Specification

This document is the precise, per-step specification for the `convert-do/`
pipeline, which converts source files from the [Divinum
Officium](https://www.divinumofficium.com) project into normalized YAML.

Where [AGENTS.md](AGENTS.md) explains *how to run* the pipeline, this document
specifies *what each step guarantees*: its inputs, its outputs, the
transformation it performs, the resulting data shape, and its handling of
boundary cases. It describes observable behavior, not implementation. Section
numbering follows the step numbers (step 0 … step 11).

## The governing strategy: a text has one home, and references point at it

A liturgical text — a reading, a prayer, a chant — is said on many days and
under many rubrics. The commons exist precisely so that a class of saint shares
one set of texts, and a day borrows them rather than restating them.

The pipeline is built around that fact. Every reading, prayer and chant is
**structured and filed into a per-language store as early as it is final**, and
what remains in a day file is a **key** into that store. A borrowing — a common
a day draws its Mass from, a section pulled from another file — is then resolved
by **copying the key**, not the text. The text is never duplicated, so it never
has to be de-duplicated: the store *is* the single home, established before the
first borrowing is resolved.

This is the ordering that follows from it, and the reason the steps sit where
they do:

1. A store key is derived from a text's **structured** content (its canonical
   scripture reference, or its opening words), so a section must be **structured**
   (step 4) before it can be **filed** (step 5).
2. A borrowing resolves to the key its target already holds, so the target must
   be filed before the borrowing is **resolved** (step 6). Filing therefore
   comes before reference resolution — the store is built *first*.
3. Only then are the rubric-variant directories **folded** (step 7), the files
   **named** (step 8), the commemorations **split out** (step 9), the redundant
   variants **collapsed** (step 10), and the Mass propers **published** (step 11).

The store is opened at step 5 and **added to** by the two later steps that
finalize new text — reference resolution (step 6), where a substituted borrow
becomes a text of its own, and the commemoration split (step 9), where a saint's
prayers first stand alone. It is never rewritten, only extended, and step 11
ships the subset the propers actually name.

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

- **Streaming (steps 0–3)** — each source file is processed independently and
  passed through every step in the requested range before being written once.
  These steps read only the file in front of them.
- **Batch (steps 4–11)** — whole-directory passes. From step 4 on, a step reads
  more than one file at a time: it files texts into a per-language store, reads
  another day's file to resolve a borrowing, merges the same saint across
  documents, or writes a shared file alongside the tree. Each batch step fully
  rebuilds its output directory.

The move to batch at step 4 is not incidental. The store is per language, and
resolving a borrowing means reading the target's file; neither fits the
one-file-at-a-time streaming model, and both begin at step 4.

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
  step 6 sees a clean reference `@SanctiM/11-14M`.
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
  point — step 7 folds those.

### Path mapping

- Drop the leading `horas`/`missa` segment:
  - `missa\Sancti\01-01.json` → `Sancti\01-01.json`
  - `horas\Sancti\01-01.json` → `Sancti\01-01.json`
- A variant directory or filename suffix is left untouched (that is step 7's
  job): `missa\SanctiCist\01-01t.json` → `SanctiCist\01-01t.json`.

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

## Step 4 — Structure the sections *(batch)*

The first **batch** step, and the first act of the governing strategy: it turns
a section's lines into the typed shape a store entry has, so that step 5 can
file it under a content-derived key. A reading becomes a reference and its
verses; a prayer, its text and closure; a chant, its antiphon and verse. The
readings of Matins are given the same reading shape as the readings of Mass, so
that a reading is one kind of thing wherever it occurs.

### Input

- The step 3 tree — a directory of variant-shaped files.

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
[step 5](#step-5--shared-stores-batch) store them together.

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

A reading with no marker keeps its lines as `{ text }`, with no `ref`. Step 5
stores it under a key built from its opening words.

#### Several references

A reading drawn from more than one passage keeps its original lines. Structuring
it would keep one reference and silently lose the interior ones. Such a reading
passes through this step unchanged, and step 5 then leaves it inline — a
deliberate omission rather than a final state.

### A section that is still a reference

A section whose content is a single **inline reference** — a lone `@…` line
naming a section of another file — is **not** structured here. It carries no
text of its own yet; its text lives in the file it points at.
[Step 6](#step-6--resolve-references-batch) resolves it to the key that file's
section already holds. Left to structure, a `@Commune/C1:Lectio1` line would be
read as a reading whose text is the reference itself, and the pointer would be
lost. So the variant is kept as its lines, marked for step 6.

The whole-file and rank-line references (`@File`, `ex …`, `vide …`) live in the
`__preamble`, `rank` and `rule` sections, which this step does not structure, so
they are untouched here in any case.

### Rule cleanup

The `rule` section is cleaned per variant: `Gloria` and `Credo` lines are
dropped, and a `Prefatio=X` line is lifted out into a `prefatio` section (value
`X`, lowercased) carrying the same condition.

### Commemorations

The `commemoratio-oratio` / `-secreta` / `-postcommunio` sections are **not**
structured here, and are left as lines. Each of their variants opens with a
`!Pro S. …` line naming the saint the commemoration is of, which
[step 9](#step-9--split-commemorations-batch) reads to split the saint out; only
then, standing alone, is the saint's prayer structured and filed. Structured
here, the `!Pro` line would be folded into the prayer's text and the saint's
identity lost.

---

## Step 5 — Shared stores *(batch)*

The second act of the governing strategy, and the step that creates the store —
early, before any borrowing is resolved. It lifts the structured readings,
prayers and chants of each language out of the day files into shared stores and
leaves a key in their place. The same pericope is read, and the same oration
said, on many days and under many rubrics, so each text is filed once and
referred to.

### Input

- The step 4 tree.

### Output

- Three **store files** at each language root — `lectio.json`, `oratio.json`
  and `antiphona.json` — one entry per distinct reading, prayer and chant, keyed
  as described under [Keys](#keys), in the shape step 4 gave it.

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
piece.

Every other section is left untouched. A section still holding an inline
reference (step 4 left it as lines) is not a structured value and is not filed;
it stays as lines for step 6.

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

The store is opened here and **added to** by two later steps — reference
resolution ([step 6](#step-6--resolve-references-batch)), when a substituted
borrow becomes a text of its own, and the commemoration split
([step 9](#step-9--split-commemorations-batch)), when a saint's prayer first
stands alone. A key, once given, is never reassigned. Documents are visited in a
fixed order at every step that files into the store, so the same source tree
yields the same keys and the same store file on every run.

### Edge cases

- **A value step 4 left as lines** — a reading carrying several references, or a
  section still holding an inline reference — is not a structured value; no key
  replaces it, and it stays inline.
- **A value that carries no words** — an empty structured section — is not
  filed; it stays as it is.
- **An entry used only once** still moves to the store, so a covered section
  holds a key wherever step 4 gave it a shape.

---

## Step 6 — Resolve references *(batch)*

The third act of the governing strategy: it resolves the borrowings, and because
every text already lives in the store, it resolves them by **copying keys**, not
text. A day that draws its Mass from a common takes the common's keys; the text
those keys name is written once and shared.

Step 6 runs while variant directories (e.g. `SanctiM`, `SanctiCist`) are still
**separate** files — the fold (step 7) has not yet folded them onto their base —
so a reference such as `@SanctiM/11-14M` resolves directly to its own file.

### Input

- The step 5 tree — each file with its covered sections already keyed — plus,
  for the substitutions below, the step 5 stores.

### Output

- The same object shape. The borrowed sections are merged in — as keys where the
  target holds keys — and the reserved `__preamble` key is removed. Content that
  is not a reference is left unchanged.

There are two kinds of reference, resolved in turn.

### Broad references (`@File`, `ex …`, `vide …`)

A file that carries little or no proper text points at another with a
whole-file include (`@File` or `ex …`) or a selective borrow (`vide …`). Each
reference carries the rubric condition of the variant it was found in.

- **`__preamble`** — a line beginning with `@` is a whole-file include. The path
  is the text after `@` up to the first `:`; any `:Section` suffix is ignored
  here (it is the inline references' concern below).
- **`rank`** — the fourth `;;`-separated field of a rank line: `ex X` →
  include; `vide X` → borrow; a bare value with no keyword (e.g. `C5c`) →
  treated as `vide`.
- **`rule`** — a line beginning `ex X` or `vide X`.

**Include (`@` / `ex`)** copies **all** sections of the referenced file.
**Borrow (`vide`)** copies these:

- **always**: `lectio*`, `ant-laudes`, `ant-vespera`, `versum*`, `oratio*` — the
  Matins lessons and the antiphons, versicles and orations of Lauds and Vespers,
  the Office texts a day takes from its common.
- **only where still missing**: the Mass propers `introitus`, `graduale`,
  `gradualep`, `tractus`, `evangelium`, `offertorium`, `secreta`, `communio`,
  `postcommunio`, `ultima-evangelium`.

The Mass propers fill a gap rather than furnish the day. A day that resolves its
own Mass — from its own text, or from a whole-file include — keeps it untouched;
one that resolves none, such as a commemoration pointing at a common, takes the
common's. "Still missing" is judged as the references are resolved, and includes
come before borrows, so an `ex` always wins over a `vide` for the same section.

Whatever the target section holds is what is copied: a covered section holds a
**key**, so the borrowing day comes to hold the same key, and the text stays
single. An Office section the store does not cover holds its lines, and those
lines are copied as before.

#### Reference-path normalization

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
files still exist separately. A couple of individual targets receive a fixed
correction (e.g. `Tempora/Epi4` → `Tempora/Epi4-0`).

#### Merging and condition propagation

- Imported section variants have the reference's condition **prepended** to
  their own, so a `vide` made under `1570` contributes sections tagged `1570`.
- If the file already has that section, an imported variant is added only where
  no existing variant would already apply in its place — that is, where no
  existing variant's condition is a subset of the import's. What the day already
  holds is its own and takes precedence; an import only fills a gap. (Matching
  whole condition sets is not enough: a day's unconditional Introit must not be
  displaced by a common imported under `1962`.)

### Inline references (`@File:Section:…`)

An inline reference replaces a single **reference line** — a section whose
content step 4 left as a lone `@…` line — with what that reference names. Its
syntax is `@File:Section:lineRange:s/pattern/replacement/flags`, colon-separated,
where all parts after `File` are optional:

- **`File`** — the target path, relative to the language root; omitted (`@:…`)
  it is the current file.
- **`Section`** — the section to pull, kebab-cased; omitted, the target's first
  content section.
- **`lineRange`** — `N` or `N-M`, selecting entries *N*…*M* (1-based, inclusive).
- **`substitution`** — one or more `s/pattern/replacement/flags` groups.

Resolution turns on whether the reference is **plain** or **modified**:

- **A plain reference** — no line range, no substitution — resolves to the
  **key the target section already holds** for the current rubric condition
  (an exact condition match, else the default, else the first variant). The
  borrowing section comes to hold that same key; nothing new is stored, and the
  text stays single. Where the target section is one the store does not cover,
  its value — the lines it holds — is copied instead, exactly as the broad
  references copy an uncovered section.
- **A modified reference** — a line range, a substitution, or both — names a
  text that differs from the one in the store. The target entry is read from the
  store, the range and substitutions are applied to its structured content, and
  the **result is written inline**, not filed: a modification is usually unique,
  and storing it would grow the store with entries nothing else shares. The
  borrowing section then holds that structured value directly.

  A substitution is a regular-expression replace on the entry's text (each verse
  of a reading, the text of a prayer, the words of a chant); an invalid pattern
  is skipped. A line range selects verses of a multi-verse reading, or lines of
  a text.

- If a plain reference's resolved value is **itself a reference**, it is
  resolved transitively, up to a depth of **5**.

A reference that cannot be resolved — a missing file, or a missing section — is
**left in place** as its `@…` line, exactly as it stood. Step 11 then leaves it
inline. A reference that resolves to an empty section removes the line.

### Dependencies and ordering

A borrowing resolves against the target's **resolved** keys — a common that
itself includes another common must be resolved first — so step 6 orders its work
by the references each file declares: a file is held back until every file it
references has been resolved, then retried. References are resolved relative to
the language root, so files nested more than one directory below it (e.g.
`Sancti/Urbis/…`) resolve correctly.

When the queue **stalls** — two files waiting on each other (the Vigil of
Pentecost and its rubric file each borrow from the other), or a reference the
sources do not carry — the gate comes off and the remaining files are resolved
with whatever they could not follow left in place. Waiting longer cannot help,
and dropping a file loses a day of the calendar.

Because the borrowings now move keys rather than whole texts, this ordering pass
carries far less than it did when references copied the readings themselves.

### A translation borrows the Latin's rank

Most translated files carry no `[Rank]` at all: the rank says how a day is
celebrated rather than what is said on it, and that is not a matter of language.
But the rank is also where a day names the **common** it draws its Mass from, so
a translation without one borrows nothing and comes out with no Mass — even where
the common itself has been translated.

The rank is therefore taken from the base language, which is the one tree that
always has it. The sections the day then borrows are the translation's own: a
Dutch day drawing on `C4a` gets the Dutch `C4a`'s keys, into the Dutch store.
Where the base language's document has not been produced yet, the day waits for
it as it waits for any other dependency.

### Examples

- Preamble include + rank `ex`/`vide`, copying keys:

  ```
  { __preamble: [{ value: ["@Commune/C1"], condition: [] }],
    rank: [{ value: [";;Simplex;;1;;vide Sancti/12-26"], condition: ["1570"] }] }
  with Commune/C1 → { evangelium: [{ value: "matt-5-1-12", condition: [] }], … }
  ⇒ the day comes to hold evangelium = matt-5-1-12 (the same key C1 holds)
  ```

- A plain inline reference resolves to the target's key:

  ```
  lectio1 = [{ value: ["@Commune/C1:Lectio1"], condition: [] }]
  with Commune/C1 → { lectio1: [{ value: "in-illo-tempore-…-8f2c", condition: [] }] }
  ⇒ lectio1 = [{ value: "in-illo-tempore-…-8f2c", condition: [] }]
  ```

- A bare rank pointer `C5c` normalizes to a `vide` on `Commune/C5c`.

### Edge cases

- **Bare rank reference** (no `ex`/`vide`) is treated as a `vide` commune
  pointer rather than an error.
- **`@File:Section`** in the preamble is a whole-file include here; the
  `:Section` narrowing is an inline reference's concern.
- **A declared reference never produced** leaves the file queued and, if never
  satisfied, is written with the reference unresolved (non-fatal) rather than
  crashing.
- **A modified reference whose target the store does not hold** — an inline
  reference into an uncovered section, with a line range — falls back to copying
  the target's lines and applying the range and substitutions to them.

---

## Step 7 — Directory and filename suffixes to rubric conditions *(batch)*

Reads the file's **directory** and **filename** to infer which rubric(s) it
represents, adds that rubric to every section's condition, and computes an output
path with the variant markers removed so that all rubric variants of the same day
or feast land on one path. This is where variant directories are folded onto
their base — deliberately after references have been resolved (step 6), so a
reference to a variant file still found its own file.

### Input

- The step 6 tree.

### Output

- The same object shape. Each variant's `condition` now also carries the tokens
  derived from the path.
- A **merged output path** (see [Path mapping](#path-mapping-2)) that folds a
  variant directory onto its base and strips the filename's rubric suffix. The
  runner unions everything landing on one path, merging section variants by
  condition.

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

The path has already had its `horas`/`missa` root removed by step 2. Step 7
removes the remaining rubric markers so variants converge:

1. If the directory is a variant, rename it to its base (`SanctiCist` →
   `Sancti`).
2. Strip the filename's trailing non-digit suffix (`01-01t.json` →
   `01-01.json`). Excluded files keep their filename.

Examples:

- `root\SanctiCist\01-01.json` → `root\Sancti\01-01.json`
- `root\Sancti\01-01t.json` → `root\Sancti\01-01.json`

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

## Step 8 — Filename from liturgical name *(batch)*

Names each file from the feast/office title, and folds `rank`/`officium`/`name`
into a single `name` section. Section content keeps the rubric-variant shape,
now holding keys where step 5 replaced text.

### Input

- The step 7 tree.

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
each of them, described by its own designations as far as it has them; a source
the base language does not carry keeps its own name. The base language settles
the collision suffix too.

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

## Step 9 — Split commemorations *(batch)*

Pulls each commemorated saint out of the day files into a file of the saint's
own, merges the same saint across documents, and — because a saint's prayer now
first stands as a text in its own right — structures it and files it into the
prayer store.

### Input

- The step 8 tree, and the language's prayer store as step 5 (and step 6) left
  it.

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
  the fold (step 7) has already normalized variant directories onto their base,
  a saint commemorated in `SanctiCist` and in `Sancti` merges correctly.

### Edge cases

- A `commemoratio-*` variant whose first line is not a `!Pro …` line is skipped.

---

## Step 10 — Variant collapse *(batch)*

Removes the rubric variants that carry content identical to their section's
default, so the tree states a rubric variant only where the rubric actually
changes something. Because the covered sections now hold short keys, this
compares keys rather than full texts.

### Input

- The step 9 tree.

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

## Step 11 — Mass propers *(batch)*

The last step, and the only one whose output leaves the pipeline: it narrows the
tree to what the calendar consumes — the Mass propers — so that the rest, which
is the Divine Office, is not carried into the published assets.

### Input

- The step 10 tree, and its per-language stores.

### Output

- One file per document that has Mass content, holding **only** its Mass
  sections, in the rubric-variant shape step 10 left them.
- A `lectio.yml`, `oratio.yml` and `antiphona.yml` at each language root, holding
  **only** the store entries those sections refer to.
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
itself: [step 6](#step-6--resolve-references-batch) has already resolved the
borrowings, so the commons' texts reach the calendar through the days that use
them — as the keys those days carry. A copy under `Commune` would only be
reachable by a lookup no calendar makes.

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

`rule` is dropped here, at the end. It carries how a day is to be observed — how
many lessons, which preface — and the pipeline needs it up to this point:
[step 4](#step-4--structure-the-sections-batch) reads it to lift out `prefatio`.
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

A section outside this list — there should be none — is written after them, in
alphabetical order, so nothing is silently dropped by being unrecognized.

The store files are ordered by key, so both they and the day files diff cleanly
between runs.

### The store subset

Only the entries the kept sections name are carried over. The Office readings
share the step 5 store but are not published, so most of its entries do not
travel with the propers; neither do entries only a dropped variant named.

### Edge cases

- **A reading left inline** by step 5 (several references) or by step 6 (a
  modified inline reference, an unresolved one) stays inline here; it is content,
  not a key, and needs no store entry.
- **A key naming no store entry** is impossible by construction, since the
  subset is built from the keys the kept sections actually hold.

---

## Appendix A — Rubric conditions

Rubric conditions — from section headers, filename and directory suffixes, and
inline conditionals — select which variant of a text applies under which rubric.
A **condition** is a set of rubric *tokens* (e.g. `1570`, `2020`, `monastica`);
a **variant** pairs a `value` with a `condition` (its tokens), where an empty
condition denotes the default/unconditional case.

> This appendix covers the condition handling used by steps 1, 6 and 7.
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
