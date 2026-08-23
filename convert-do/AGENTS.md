# Pipeline: Divinum Officium → structured data

The scripts in `convert-do/` turn source files from the [Divinum
Officium](https://www.divinumofficium.com) project, step by step, into
normalized data with named sections, rubric variants and resolved references.
Each step reads the output of the one before it, under
`.divinum-officium/step{N}/` (relative to `process.cwd()`).

For what each step *decides* — and why — see [`SPEC.md`](SPEC.md). This file
describes how the runner is put together and where things live.

> **Storage format** — the intermediate trees (`step0` … `step10`) are **JSON**
> (`.json`): nothing but the next step reads them, and JSON parses about seventy
> times faster than YAML. Only the last step's output (`step11`) is **YAML**
> (`.yml`), since it is published and read by people. The choice lives in one
> place, [`lib/serialize.ts`](lib/serialize.ts).

> **Status of this pipeline**
> - The active implementation is the **TypeScript** pipeline in this folder,
>   driven by [`index.ts`](index.ts) → [`pipeline.ts`](pipeline.ts). The steps
>   are **0-indexed** (`step0` … `step11`).
> - **Steps 0–6** run in memory (streaming); **steps 7–11** are directory batch
>   passes (fan-out / cross-file merges) that read the materialized
>   `step{N-1}` folder. See [How the runner works](#how-the-runner-works).
> - It is run with `npx tsx convert-do/index.ts` (there is no per-step
>   `pnpm` script).

---

## Running it

```bash
# Full pipeline (steps 0-11), output in .divinum-officium/step11/
npx tsx convert-do/index.ts

# Up to a given step
npx tsx convert-do/index.ts --to 5

# From a given step (reads .divinum-officium/step{from-1} as input)
npx tsx convert-do/index.ts --from 7 --to 11

# One step
npx tsx convert-do/index.ts --step 6

# Rebuild rather than reuse existing output
npx tsx convert-do/index.ts --force
```

CLI options (see [`index.ts`](index.ts)):

| Option          | Default | Meaning                                              |
| --------------- | ------- | ---------------------------------------------------- |
| `--from <N>`    | `0`     | First step (0–11).                                   |
| `--to <N>`      | `11`    | Last step (0–11). Output lands in `step{to}/`.       |
| `--step <N>`    | —       | Shorthand for `--from N --to N`.                     |
| `-f`, `--force` | `false` | Empty the output folder and reprocess everything. Without it, existing output files are skipped (caching). |

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

The runner has **two modes**, split at `STREAMING_MAX_STEP = 6`.

### Streaming (steps 0–6)

[`pipeline.ts`](pipeline.ts) works file by file rather than folder by folder:

1. **`getInputFiles(fromStep)`** — at `fromStep 0`, every relevant `.txt` under
   `DIVINUM_OFFICIUM_BASE/{horas,missa}` (via
   [`step0.getInputFiles`](step0.ts)); otherwise every file under
   `.divinum-officium/step{fromStep-1}`.
2. **Deciding the output path** — computed per input file, applying the path
   transforms that fall in the step range:
   - `getStep0OutputFile` — `.txt` → `.json`, and the language folder → its ISO
     code (`Latin` → `la`, and so on).
   - `getStep2OutputFile` — strip `horas` / `missa`, so the Mass and the Office
     of a day land on the **same output path** and are combined.
   - `getStep6OutputFile` — fold a variant directory onto its base and strip the
     filename suffix, so rubric variants land on the same output path. This
     happens deliberately *after* the reference steps (4–5), so references
     resolve while variant directories are still separate files.
3. **Merging** — several input files landing on one output path (horas + missa,
   and the rubric variants) are unioned by condition; `missa` wins a condition
   collision (see `processInputFiles`).
4. **Transforming** — the transforms `step0` … `step6` are applied in order, as
   far as they fall within `[fromStep, toStep]`.
5. **Caching and dependencies** — existing output is skipped unless `--force`.
   Step 4 declares what a document borrows from (`extractDependencies`); a
   document whose dependency has not been written yet goes to the back of the
   queue and is tried again. A translation that carries no rank of its own waits
   for the base language's document the same way.
   **When the queue stalls** — two documents waiting on each other, or a
   reference the sources do not carry — the gate comes off and the remaining
   documents are written with what they could not resolve left in place. Waiting
   longer cannot help, and dropping a document loses a day of the calendar.

`STREAMING_CHECKPOINTS = [4]` materializes the **unfolded** step4 tree, so both
step 4 and step 5 can resolve references against files whose variant
directories are still separate.

### Batch (steps 7–11)

These steps can produce **several output files from one input** (step 7 writes a
document under each of its names; step 8 splits commemorations out; step 11
writes one day per season), or merge **across files** (step 8 merges the same
saint from several documents; step 10 builds shared stores). That does not fit
the one-to-one streaming model, so `runBatchStep` runs them as a directory
operation: read the whole `step{N-1}` folder, transform, write `step{N}`. Batch
steps always rebuild their output from scratch (rm + mkdir); `--force` does not
apply to them. Shared helpers live in [`lib/batch.ts`](lib/batch.ts).

---

## The steps at a glance (0-indexed)

| Step | Input                          | Transform                | In short                                                                    |
| ---- | ------------------------------ | ------------------------ | --------------------------------------------------------------------------- |
| 0    | `DIVINUM_OFFICIUM_BASE` `.txt` | [`step0.ts`](step0.ts)   | Text → array of lines; language folder → ISO code                           |
| 1    | step0                          | [`step1.ts`](step1.ts)   | Group lines per section `[Key] (condition)` → object                        |
| 2    | step1                          | [`step2.ts`](step2.ts)   | Combine Mass and Office (strip `horas` / `missa`)                           |
| 3    | step2                          | [`step3.ts`](step3.ts)   | Inline conditionals within lines → rubric variants                          |
| 4    | step3                          | [`step4.ts`](step4.ts)   | Resolve broad references (`@File`, `ex …`, `vide …`)                        |
| 5    | step4                          | [`step5.ts`](step5.ts)   | Resolve inline references `@File:Section:…:s/…/…/`                          |
| 6    | step5                          | [`step6.ts`](step6.ts)   | Directory and filename suffixes → rubric conditions; fold variants together  |
| 7    | step6                          | [`step7.ts`](step7.ts)   | Filename from the liturgical name *(batch)*                                 |
| 8    | step7                          | [`step8.ts`](step8.ts)   | Commemorations into their own files, one per saint *(batch)*                |
| 9    | step8                          | [`step9.ts`](step9.ts)   | Structure the Mass sections (`verse` / `prayer` / `antiphonal`) *(batch)*   |
| 10   | step9                          | [`step10.ts`](step10.ts) | Shared stores for readings, prayers and chants; collapse variants *(batch)* |
| 11   | step10                         | [`step11.ts`](step11.ts) | The published Mass propers *(batch)*                                        |

---

## Step 0 — Text to line array

- **Input:** `.txt` under `DIVINUM_OFFICIUM_BASE/horas` and `…/missa`.
- **Filtering:** [`fileFilter`](step0.ts) keeps only the **ingested languages**
  named by `INGESTED_LANGUAGES` — every language is a full copy of the tree and
  costs its own pass and its own published package — and excludes a set of
  auxiliary files (`*pl.txt`, `*tts.txt`, `ruler.txt`, `Linguae.txt`,
  `source.txt`, `Mobile.txt`, and others), plus `Help/` and `Latin-gabc/`.
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
- In the preamble, lines containing `;;` are cut back to the part before it.
- Empty sections and variants are filtered out.

## Step 2 — Combine Mass and Office

- **`transform(obj)`** — the identity: section content does not change.
- **`getOutputFile`** — strips `horas` / `missa`, so the Mass and Office
  versions of a day land on one output path. The runner merges them (`missa`
  wins a key collision). Variant directories stay separate here; step 6 folds
  them.

## Step 3 — Inline conditionals

- **`transform(input, inputFile)`** — handles condition lines within a section
  (a port of Divinum Officium's `process_conditional_lines`, see
  [technical.html](https://www.divinumofficium.com/www/horas/Help/technical.html)):
  a line such as `(sed rubrica 196 aut rubrica 1930)` splits the lines that
  follow into rubric variants (`{ value, condition }[]`).
- **Exception:** files under an `Ordo/` folder pass through untouched
  (`isStep3SkippedForPath`).

## Step 4 — Resolve broad references

- **`transform(obj, inputFile)`** — resolves file-level references: `@File` in
  the `__preamble`, and `ex …` / `vide …` in the `rank` lines. The referenced
  sections are read and merged, with the conditions propagated. For `vide` only
  certain sections are taken (`lectio*`, `ant-laudes`, `ant-vespera`,
  `versum*`, `oratio*`), plus the Mass propers where the day is still missing
  them. `__preamble` is then removed.
  A reference the sources do not carry, or one caught in a cycle, simply yields
  nothing to borrow: the document is kept rather than lost with the reference.
- **`extractDependencies`** — says which other files must be processed first.
  This step runs before the fold (step 6), so a reference to a variant
  directory (`@SanctiM/11-14M`) still finds a file of its own.

## Step 5 — Resolve inline references

- **`transform(obj, inputFile)`** — resolves references **within lines**, of the
  form `@File:Section:lineRange:s/pattern/replacement/`. Supports substitutions
  (`s/…/…/flags`) and a bounded resolution depth (`MAX_RESOLVE_DEPTH = 5`).
  Reads the referenced files from the materialized, still **unfolded** step4
  tree, so variant references resolve too.

## Step 6 — Suffixes to rubric conditions

- **`transform(obj, inputFile)`** — derives the rubric context from the
  directory and filename and adds it to each variant's existing condition (via
  `applyIncludes`), so the step-1 header condition is **extended**, not
  replaced. The `mappings` table turns suffixes into tokens: `t` → `1570`,
  `n` → `2020`, `r` → `1962`, `o` → `1888`, `oct` → `octava`,
  `cist` → `cisterciensis`, `M` → `monastica`, `OP` → `praedicatorum`, plus the
  `…Feria` numbering. `directoryMappings` does the same for variant directories.
- **`getOutputFile`** — folds a variant directory onto its base (`Commune`,
  `Martyrologium`, `Sancti`, `Tempora`) and strips non-numeric filename
  suffixes, so variants merge into the base file. A commemoration file is
  **not** folded: it is a celebration of its own, kept beside the day rather
  than merged into it.

The batch steps keep the **rubric-variant shape** (`{ value, condition }[]`);
there is no separate materialization step. Each batch step applies its transform
per variant (to `variant.value`) and keeps the `condition`.

## Step 7 — Filename from the liturgical name *(batch)*

- **`collectNames(obj, stem)`** — every file the document yields. A celebration
  is designated under each of its rubrics, and each designation becomes a file
  carrying that one. Where a condition has both an `officium` and a `name`, the
  officium names the file; `rank` still names a file of its own, since it often
  carries the specific feast where the officium gives only a generic one.
- **`toKebabFileName`** — the naming rule. It must agree exactly with
  `titleToFileName` in the calendar's asset loader, or a day is filed under one
  name and looked up under another; a test pins the two together.
- **`preferCurrentEdition`** — where several documents claim one name, only
  those claiming it under the published edition keep it. A name **no** current
  designation claims is left alone.
- **`namesForTranslation`** — a translation is filed under the names the base
  language gives a day, not its own: what a translation calls a day is its own
  business and often differs. The base language settles the collision suffix
  too.
- **`run(inputDir, outputDir)`** — writes each document under each of its names;
  a collision within a folder (same name, different content) takes the source
  stem as a suffix, named the same way every other filename is.

## Step 8 — Split commemorations *(batch)*

- **`transform(obj)`** → `{ main, commemorations }`: `main` is the document
  without its `commemoratio-*` keys; `commemorations` holds each saint's
  `oratio` / `secreta` / `postcommunio` as variant lists.
- **`run(inputDir, outputDir)`** — writes the stripped main files plus
  `<dir>/<slug>.json` per saint (`name` from the `!Pro S. …` line). The same
  saint from several files in one folder merges into one file.

## Step 9 — Structure the Mass sections *(batch)*

- **`transform(obj)`** — turns each variant's section content into fixed shapes:
  `verse` `{ ref, text }`, `prayer` `{ text, closure }`, `antiphonal`
  `{ antiphon, verse }`, readings into `{ ref, verses }`. The alleluia becomes a
  section of its own rather than sitting under the gradual, and `gradualep` is
  renamed `alleluiap` — it is not a gradual but the extended alleluia of
  paschaltide. A trailing `Alleluja` is stripped from every chant, so the season
  decides where it belongs. `rule` is cleaned up (Gloria/Credo removed;
  `Prefatio=X` lifted out into a `prefatio` key).
- **`run(inputDir, outputDir)`** — per file; no cross-file logic.

## Step 10 — Shared stores *(batch)*

- Readings, prayers and chants repeat across the year, so each is written once
  into a store at the language root — `lectio.yml`, `oratio.yml`,
  `antiphona.yml` — and the sections refer to it by key. A key is the kebab-cased
  scripture reference, or the opening words plus a short hash.
- Variants repeating the default are dropped, which the runtime undoes by
  falling back to the default.

## Step 11 — The Mass propers *(batch)*

- The last step, and the only one whose output leaves the pipeline. It narrows
  the tree to what the calendar consumes, so the Divine Office — by far the
  larger part — is not carried into the published assets.
- Only the **day trees** are published (`Sancti`, `Tempora`), plus days under
  `aliquibus locis`. Variants requiring a rubric system other than the one in
  force are dropped, since they could never be chosen.
- A day whose Mass changes with the season is written as one day per season.

---

## Supporting modules

- [`condition.ts`](condition.ts) — parse and apply rubric conditions
  (`applyCondition`, `applyIncludes`, `getIncludesExcludes`,
  `parseConditional`).
- [`lib/batch.ts`](lib/batch.ts) — shared batch helpers (`runBatched`,
  `collectYmlFiles`, `ensureDir`) for steps 7–11.
- [`lib/variants.ts`](lib/variants.ts) — `isVariantArray` / `mapVariants`, for
  transforming sections per variant in the batch steps.
- [`lib/mappings.ts`](lib/mappings.ts) — `directoryMappings` / `mappings`, the
  rubric suffix tables, shared by steps 4 and 6.
- [`lib/paths.ts`](lib/paths.ts) — path separator helpers (`SEP`, `SEP_RE`,
  `escapeRegExp`, `splitPath`) so the pipeline works on Windows and POSIX alike.
- [`lib/rubrics.ts`](lib/rubrics.ts) — which rubric is published
  (`PUBLISHED_RUBRIC`), which language is the base (`BASE_LANGUAGE`), and which
  tokens name an edition or a use, so steps 7 and 11 judge them the same way.
- [`lib/serialize.ts`](lib/serialize.ts) — the storage format in one place:
  JSON for the intermediates, YAML for the published output.

## Tests

```bash
pnpm test            # vitest, whole repo
npx vitest run convert-do/step9.test.ts
```

Per-step transform tests, `step0.test.ts` … `step11.test.ts`, and an end-to-end
batch test in `batchSteps.test.ts`. Beyond those: `condition.test.ts`,
`lib/rubrics.test.ts`, and the `getInputFiles` tests in `pipeline.test.ts`.
