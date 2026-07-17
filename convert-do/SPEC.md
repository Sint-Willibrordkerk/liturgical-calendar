# convert-do — Pipeline Specification

This document is the precise, per-step specification for the `convert-do/`
pipeline, which converts source files from the [Divinum
Officium](https://www.divinumofficium.com) project into normalized YAML.

Where [AGENTS.md](AGENTS.md) explains *how to run* the pipeline, this document
specifies *what each step guarantees*: its inputs, its outputs, the
transformation it performs, the resulting data shape, and its handling of
boundary cases. It describes observable behavior, not implementation. Section
numbering follows the step numbers (step 0 … step 9).

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

- **Streaming (steps 0–6)** — each source file is processed independently and
  passed through every step in the requested range before being written once.
- **Batch (steps 7–9)** — whole-directory passes that may produce several
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

## Appendix A — Rubric conditions

Rubric conditions — from section headers, filename and directory suffixes, and
inline conditionals — select which variant of a text applies under which rubric.
A **condition** is a set of rubric *tokens* (e.g. `1570`, `2020`, `monastica`);
a **variant** pairs a `value` (its lines) with a `condition` (its tokens), where
an empty condition denotes the default/unconditional case.

> This appendix currently covers the condition handling used by steps 1–2.
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
