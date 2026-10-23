# Pipeline: Divinum Officium → structured data

The scripts in `convert-do/` turn source files from the [Divinum
Officium](https://www.divinumofficium.com) project, step by step, into
normalized data with named sections, rubric variants and resolved references.
Each step reads the output of the one before it, under
`.divinum-officium/step{N}/` (relative to `process.cwd()`).

For what each step *decides* — and why — see [`SPEC.md`](SPEC.md). This file
describes how the runner is put together and where things live.

> **The strategy in one line** — every reading, prayer and chant is filed into a
> per-language store as soon as its wording is final (step 6), and a day that
> borrows from a common copies the common's **keys** (step 7), not its text.
> Inline `@File:Section` references assemble wording, so they are resolved on
> the lines before that (step 4). See the opening of [`SPEC.md`](SPEC.md).

> **Storage format** — the intermediate trees (`step0` … `step11`) are **JSON**
> (`.json`): nothing but the next step reads them, and JSON parses about seventy
> times faster than YAML. Only the last step's output (`step12`) is **YAML**
> (`.yml`), since it is published and read by people. The choice lives in one
> place, [`lib/serialize.ts`](lib/serialize.ts).

> **Status of this pipeline**
> - The active implementation is the **TypeScript** pipeline in this folder,
>   driven by [`index.ts`](index.ts) → [`pipeline.ts`](pipeline.ts). The steps
>   are **0-indexed** (`step0` … `step12`).
> - **Steps 0–3** run in memory (streaming); **steps 4–12** are directory batch
>   passes that read the materialized `step{N-1}` folder. See
>   [How the runner works](#how-the-runner-works).
> - It is run with `npx tsx convert-do/index.ts` (or `pnpm pipeline`).

---

## Running it

```bash
# Full pipeline (steps 0-12), output in .divinum-officium/step12/
npx tsx convert-do/index.ts

# Up to a given step
npx tsx convert-do/index.ts --to 5

# From a given step (reads .divinum-officium/step{from-1} as input)
npx tsx convert-do/index.ts --from 7 --to 12

# One step
npx tsx convert-do/index.ts --step 6

# Rebuild rather than reuse existing output
npx tsx convert-do/index.ts --force
```

CLI options (see [`index.ts`](index.ts)):

| Option          | Default | Meaning                                              |
| --------------- | ------- | ---------------------------------------------------- |
| `--from <N>`    | `0`     | First step (0–12).                                   |
| `--to <N>`      | `12`    | Last step (0–12). Output lands in `step{to}/`.       |
| `--step <N>`    | —       | Shorthand for `--from N --to N`.                     |
| `-f`, `--force` | `false` | Empty the streaming output folder and reprocess everything. Without it, existing streaming outputs are skipped (caching). Batch steps always rebuild. |

`step0` needs the env variable **`DIVINUM_OFFICIUM_BASE`** (path to the
`divinum-officium` repository; `web/www` is appended automatically). From
`--from 1` onwards the input is `.divinum-officium/step{from-1}` and the source
repository is not needed.

Publishing the result into the language packages is a separate, deliberate step:

```bash
pnpm copy-mass-propers
```

---

## How the runner works

The runner has **two modes**, split at `STREAMING_MAX_STEP = 3`.

### Streaming (steps 0–3)

[`pipeline.ts`](pipeline.ts) works file by file rather than folder by folder.
These steps read only the file in front of them, so the outputs are independent
and processed in parallel.

1. **`getInputFiles(fromStep)`** — at `fromStep 0`, every relevant `.txt` under
   `DIVINUM_OFFICIUM_BASE/{horas,missa}` (via
   [`step0.getInputFiles`](step0.ts)); otherwise every file under
   `.divinum-officium/step{fromStep-1}`.
2. **Deciding the output path** — computed per input file:
   - `getStep0OutputFile` — `.txt` → `.json`, and the language folder → its ISO
     code (`Latin` → `la`, and so on).
   - `getStep2OutputFile` — move `horas` / `missa` below the language
     (`missa/la/…` → `la/missa/…`). The Mass and the Office of a day stay two
     documents until step 8 combines them.
3. **Transforming** — the transforms `step0` … `step3` are applied in order, as
   far as they fall within `[fromStep, toStep]`. Every input has an output of
   its own (`processInputFile`).
4. **Caching** — existing output is skipped unless `--force`.

### Batch (steps 4–12)

From step 4 on, a step reads more than one file at a time: it resolves a
reference by reading the file it names, files texts into a per-language store,
folds the variant files of a day together, writes a document under several
names, or merges a saint across documents. `runBatchStep` runs each as a
directory operation: read the whole `step{N-1}` folder, transform, write
`step{N}`. Batch steps always rebuild their output from scratch (rm + mkdir).
Shared helpers live in [`lib/batch.ts`](lib/batch.ts).

**The stores travel with the tree.** From step 6 on, each language root holds
`lectio.json`, `oratio.json` and `antiphona.json`. Every later step skips them
when it collects documents (`collectDocumentFiles`) and carries them forward
(`copyStores`); only step 10 adds to one — the prayer store. See
[`lib/stores.ts`](lib/stores.ts).

**References resolve in memory, per language.** Steps 4 and 7 read a language's
whole tree (`readTree`, keyed by language, source and path) and resolve each
document once, through a memoized resolver
([`createSourcedResolver`](lib/broad.ts)). The Mass (`missa`) and the Office
(`horas`) of a day resolve their own references; a target is read through
`view`, its Mass and Office together (the Mass winning a collision), as it stands
once *its* references are resolved. A borrowing cycle — the Vigil of Pentecost
and its rubric file include each other — is cut where it closes: the side
reached second borrows nothing from the other. Documents are visited in a fixed
order (`documentsOf`), so that is the same on every run. A translation without a
rank takes the base language's, read from the same input tree.

---

## The steps at a glance (0-indexed)

| Step | Input                          | Transform                | In short                                                                    |
| ---- | ------------------------------ | ------------------------ | --------------------------------------------------------------------------- |
| 0    | `DIVINUM_OFFICIUM_BASE` `.txt` | [`step0.ts`](step0.ts)   | Text → array of lines; language folder → ISO code                           |
| 1    | step0                          | [`step1.ts`](step1.ts)   | Group lines per section `[Key] (condition)` → object                        |
| 2    | step1                          | [`step2.ts`](step2.ts)   | File Mass and Office side by side below the language                        |
| 3    | step2                          | [`step3.ts`](step3.ts)   | Inline conditionals within lines → rubric variants                          |
| 4    | step3                          | [`step4.ts`](step4.ts)   | Inline references `@File:Section:…:s/…/…/` — assemble the wording *(batch)* |
| 5    | step4                          | [`step5.ts`](step5.ts)   | Structure the sections (`verse` / `prayer` / `antiphonal`) *(batch)*        |
| 6    | step5                          | [`step6.ts`](step6.ts)   | Shared stores for readings, prayers and chants; sections hold keys *(batch)* |
| 7    | step6                          | [`step7.ts`](step7.ts)   | Broad references (`@File`, `ex …`, `vide …`) — copy keys *(batch)*          |
| 8    | step7                          | [`step8.ts`](step8.ts)   | Directory and filename suffixes → rubric conditions; fold variants *(batch)* |
| 9    | step8                          | [`step9.ts`](step9.ts)   | Filename from the liturgical name *(batch)*                                 |
| 10   | step9                          | [`step10.ts`](step10.ts) | Commemorations into their own files; their prayers filed *(batch)*         |
| 11   | step10                         | [`step11.ts`](step11.ts) | Collapse variants that repeat the default *(batch)*                         |
| 12   | step11                         | [`step12.ts`](step12.ts) | The published Mass propers *(batch)*                                        |

---

## Step 0 — Text to line array

- **Input:** `.txt` under `DIVINUM_OFFICIUM_BASE/horas` and `…/missa`.
- **Filtering:** [`fileFilter`](step0.ts) keeps only the **ingested languages**
  named by `INGESTED_LANGUAGES` — every language is a full copy of the tree and
  costs its own pass and its own published package — and excludes a set of
  auxiliary files (`*pl.txt`, `*tts.txt`, `ruler.txt`, `Linguae.txt`,
  `source.txt`, and others), plus `Help/` and `Latin-gabc/`.
- **`transform`:** splits the file on `\r?\n` into a `string[]`.
- **`getOutputFile`:** `.txt` → `.json`, and the language folder → its ISO code.
  The full table is `LANGUAGE_CODES` (`Latin` → `la`, `Nederlands` → `nl`,
  `English` → `en`, `Latin-Bea` → `la-bea`, …), so adding a language is one
  entry in `INGESTED_LANGUAGES`.

## Step 1 — Sections as object keys

- **`transform(lines)`** → an object in which every `[Section]` (or
  `[Section] (condition)`) becomes a key (kebab-case). Lines before the first
  section go to `__preamble`. Each section is an array of
  `{ value: string[]; condition: string[] }`; the condition comes from the
  `(...)` part of the section header (via `applyCondition`).
- Empty sections and variants are filtered out.

## Step 2 — Mass and Office side by side

- **`transform(obj)`** — the identity: section content does not change.
- **`getOutputFile`** — moves `horas` / `missa` below the language
  (`missa/la/Sancti/01-01` → `la/missa/Sancti/01-01`). The two stay separate
  documents, each resolving its own references, until step 8 combines them.
  Variant directories stay separate here too; step 8 folds them.

## Step 3 — Inline conditionals

- **`transform(input, inputFile)`** — handles condition lines within a section
  (a port of Divinum Officium's `process_conditional_lines`, see
  [technical.html](https://www.divinumofficium.com/www/horas/Help/technical.html)):
  a line such as `(sed rubrica 196 aut rubrica 1930)` splits the lines that
  follow into rubric variants (`{ value, condition }[]`).
- **Exception:** files under an `Ordo/` folder pass through untouched
  (`isStep3SkippedForPath`).

## Step 4 — Inline references *(batch)*

- **`transform(obj, ownPath, lookup)`** — replaces each `@File:Section:lineRange:s/…/…/`
  line with the lines it names. A section may join several references and lines
  of its own. `@:Section` names the current file; an omitted section names the
  one holding the reference. Bounded depth (`MAX_RESOLVE_DEPTH = 5`).
- **`lookup`** reads a target as its broad references leave it — the
  line-level resolver of [`lib/broad.ts`](lib/broad.ts) with `LINE_RULES` — so a
  section the target only borrows from its common is found.
- `__preamble` and the `ex`/`vide` lines are left for step 7, and so is a rank
  that is itself a reference (`DEFERRED_SECTIONS`): step 7 resolves it after the
  borrowings, so it does not borrow on the day's behalf.
- **`parseReference`** — the substitution runs from the first `:s/` (or `: s/`)
  to the end of the line, so a colon inside it belongs to it.

## Step 5 — Structure the sections *(batch)*

- **`transform(obj)`** — turns each variant's section content into fixed shapes:
  `verse` `{ ref, text }`, `prayer` `{ text, closure }`, `antiphonal`
  `{ antiphon, verse }`, readings into `{ ref, verses }`. The alleluia becomes a
  section of its own rather than sitting under the gradual, and `gradualep` is
  renamed `alleluiap`. A trailing `Alleluja` is stripped from every chant.
  `rule` is cleaned up (Gloria/Credo removed; `Prefatio=X` lifted out into a
  `prefatio` key, a trailing `(rubrica …)` read as its condition).
- `commemoratio-*` sections stay as lines: step 10 reads their `!Pro` line.

## Step 6 — Shared stores *(batch)*

- Readings, prayers and chants repeat across the year, so each is written once
  into a store at the language root — `lectio.json`, `oratio.json`,
  `antiphona.json` — and the sections refer to it by key. A key is the
  kebab-cased scripture reference, or the opening words plus a short hash. A
  counter suffix never lands on a key already given.
- **`createLectioStore(initial?)`** — a store may be opened on what was filed
  before; step 10 does, to add the saints' prayers.

## Step 7 — Broad references *(batch)*

- Resolves `@File` (preamble) and `ex …` / `vide …` (rank, rule) with the
  key-level resolver (`KEYED_RULES`): a borrowed section's **key** is copied.
  For `vide` only certain sections are taken (`lectio*`, `ant-laudes`,
  `ant-vespera`, `versum*`, `oratio*`), plus the Mass propers where the day is
  still missing them. `__preamble` is then removed.
- **Lifted sections** — `alleluia` (out of `graduale`) and `prefatio` (out of
  `rule`) are borrowed exactly where their parent is (`liftedFrom`).
- Runs before the fold, so `@SanctiM/11-14M` still finds a file of its own.

## Step 8 — Suffixes to rubric conditions; fold *(batch)*

- **`transform(obj, inputFile)`** — derives the rubric context from the
  directory and filename and adds it to each variant's existing condition (via
  `applyIncludes`). The `mappings` table turns suffixes into tokens: `t` →
  `1570`, `n` → `2020`, `r` → `1962`, `o` → `1888`, `oct` → `octava`,
  `cist` → `cisterciensis`, `M` → `monastica`, `OP` → `praedicatorum`, plus the
  `…Feria` numbering. `directoryMappings` does the same for variant directories.
- **`getOutputFile`** — folds a variant directory onto its base (`Commune`,
  `Martyrologium`, `Sancti`, `Tempora`) and strips non-numeric filename
  suffixes. A commemoration file (`…cc`, `…octt`) is **not** folded.
- **`run`** — first combines each day's Office and Mass (`combineSources`: the
  Mass wins a collision, and a lifted section goes with its parent), then groups
  the days by folded output path and unions them (`mergeDocuments`: path order,
  the earlier file's variants first and winning a collision).

## Step 9 — Filename from the liturgical name *(batch)*

- **`collectNames(obj, stem)`** — every file the document yields: each
  designation (officium, rank, name) becomes a file carrying that one.
- **`toKebabFileName`** — the naming rule. It must agree exactly with
  `titleToFileName` in the calendar's asset loader; a test pins the two together.
- **`preferCurrentEdition`** — where several documents claim one name, only
  those claiming it under the published edition keep it.
- **`namesForTranslation`** — a translation is filed under the names the base
  language gives a day, each described by the translation's own designation of
  the same celebration (same name, else same rubric condition — `conditions` on
  each candidate), or else by the base language's. The base language settles the
  collision suffix too.

## Step 10 — Split commemorations *(batch)*

- **`transform(obj)`** → `{ main, commemorations }`: `main` without its
  `commemoratio-*` keys; `commemorations` holds each saint's `oratio` /
  `secreta` / `postcommunio` as variant lists of lines.
- **`run`** — writes the stripped main files plus `<dir>/<slug>.json` per saint
  (`name` from the `!Pro S. …` line), merging the same saint across files.
  Each prayer is structured (`linesToPrayer`) and filed into the prayer store
  (`filePrayers`), which is written back with the saints' prayers added.

## Step 11 — Variant collapse *(batch)*

- **`collapseVariants`** — drops variants repeating the section's default, which
  the runtime undoes by falling back to the default.

## Step 12 — The Mass propers *(batch)*

- The last step, and the only one whose output leaves the pipeline. It narrows
  the tree to what the calendar consumes, so the Divine Office is not carried
  into the published assets.
- Only the **day trees** are published (`Sancti`, `Tempora`), plus days under
  `aliquibus locis`. Variants requiring a rubric system other than the one in
  force are dropped. A day whose Mass changes with the season is written as one
  day per season.
- The **days are written once**, from the base language (`step12/Sancti`,
  `step12/Tempora`), holding keys alone: what step 6 left inline is filed now
  (`fileInline`), and the name goes into a fourth store, `nomen`
  (`fileName`). `copy-mass-propers` bundles them into the calendar package.
- Each language root holds only its **stores**, keyed by the base language's
  keys. A translation's entry is what its own file of the same day says in the
  key's place (`renderingsOf`), the rendering found on most days winning
  (`chooseRenderings`).
- The **Martyrology** is written beside the propers, for each language that has
  one (`publishMartyrology`): `Martyrologium/<MM-DD>.yml` (`titulus`, `elogia`),
  `mobile.yml` (the movable days' announcements) and `conclusio.yml`. It is
  reduced to the rubric in force here, so no conditions survive into it.

---

## Supporting modules

- [`condition.ts`](condition.ts) — parse and apply rubric conditions
  (`applyCondition`, `applyIncludes`, `getIncludesExcludes`,
  `parseConditional`).
- [`lib/broad.ts`](lib/broad.ts) — broad references on any value, lines or
  keys: `extractExVideReferences`, `importReferences`, the memoized
  `createSourcedResolver` (and its one-document form `createBroadResolver`),
  `withBaseRank`, and the `LINE_RULES` / `KEYED_RULES` that say what a borrow
  takes before and after structuring. Used by steps 4, 7 and 8.
- [`lib/stores.ts`](lib/stores.ts) — the store files: `isStoreFile`,
  `collectDocumentFiles`, `readStore` / `writeStore`, `copyStores`.
- [`lib/batch.ts`](lib/batch.ts) — shared batch helpers (`runBatched`,
  `collectYmlFiles`, `ensureDir`).
- [`lib/variants.ts`](lib/variants.ts) — `isVariantArray` / `mapVariants`, for
  transforming sections per variant, and `unionDocuments`.
- [`lib/mappings.ts`](lib/mappings.ts) — `directoryMappings` / `mappings`, the
  rubric suffix tables used by step 8.
- [`lib/paths.ts`](lib/paths.ts) — path separator helpers (`SEP`, `SEP_RE`,
  `escapeRegExp`, `splitPath`) so the pipeline works on Windows and POSIX alike.
- [`lib/references.ts`](lib/references.ts) — `canonicalizeRef`, the canonical
  form of a scripture reference, applied where step 5 first reads one.
- [`lib/rubrics.ts`](lib/rubrics.ts) — which rubric is published
  (`PUBLISHED_RUBRIC`), which language is the base (`BASE_LANGUAGE`), and which
  tokens name an edition or a use, so steps 9 and 12 judge them the same way.
- [`lib/serialize.ts`](lib/serialize.ts) — the storage format in one place:
  JSON for the intermediates, YAML for the published output.

## Tests

```bash
pnpm test            # vitest, whole repo
npx vitest run convert-do/step7.test.ts
```

Per-step tests, `step0.test.ts` … `step12.test.ts`, and an end-to-end test of
the naming and commemoration steps in `batchSteps.test.ts`. Beyond those:
`condition.test.ts`, `lib/broad.test.ts`, `lib/stores.test.ts`,
`lib/references.test.ts`, `lib/rubrics.test.ts`, and the `getInputFiles` tests
in `pipeline.test.ts`.

The unit tests do not catch a change that only shows in the published output.
After a change to the pipeline, compare the number of published days per
language against the previous run.
