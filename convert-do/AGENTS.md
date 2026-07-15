# Pipeline: Divinum Officium → gestructureerde YAML

De scripts in `convert-do/` zetten bronbestanden van het [Divinum
Officium](https://www.divinumofficium.com)-project stapsgewijs om naar
genormaliseerde YAML met duidelijke secties, rubriek-varianten en opgeloste
referenties. Elke stap leest uit de output van de vorige stap onder
`.divinum-officium/step{N}/` (relatief aan `process.cwd()`).

> **Let op — status van deze pipeline**
> - De actieve implementatie is de **TypeScript**-pipeline in deze map,
>   aangestuurd door [`index.ts`](index.ts) → [`pipeline.ts`](pipeline.ts).
>   De stappen zijn **0-geïndexeerd** (`step0` … `step9`).
> - **Step 0 t/m 6** draaien in-memory (streaming); **step 7 t/m 9** zijn
>   directory-batchstappen (fan-out / cross-file merges) die de
>   gematerialiseerde `step{N-1}`-map lezen. Zie
>   [Hoe de runner werkt](#hoe-de-runner-werkt).
> - Uitvoeren gaat via `npx tsx convert-do/index.ts` (er is geen
>   `pnpm`-script per stap meer).

---

## Uitvoeren

De pipeline wordt direct via `index.ts` gedraaid met `tsx`:

```bash
# Volledige pipeline (step 0-9), output in .divinum-officium/step9/
npx tsx convert-do/index.ts

# Tot en met een specifieke stap
npx tsx convert-do/index.ts --to 5

# Vanaf een specifieke stap (leest .divinum-officium/step{from-1} als input)
npx tsx convert-do/index.ts --from 7 --to 9

# Eén stap
npx tsx convert-do/index.ts --step 6

# Opnieuw genereren i.p.v. bestaande output hergebruiken
npx tsx convert-do/index.ts --force
```

CLI-opties (zie [`index.ts`](index.ts)):

| Optie            | Default | Betekenis                                             |
| ---------------- | ------- | ----------------------------------------------------- |
| `--from <N>`     | `0`     | Startstap (0–9).                                      |
| `--to <N>`       | `9`     | Eindstap (0–9). Output komt in `step{to}/`.           |
| `--step <N>`     | —       | Kortere schrijfwijze voor `--from N --to N`.          |
| `-f`, `--force`  | `false` | Output-map leegmaken en alle bestanden herverwerken. Zonder deze vlag worden bestaande output-bestanden overgeslagen (caching). |

`step0` vereist de env-variabele **`DIVINUM_OFFICIUM_BASE`** (pad naar de
`divinum-officium`-repo; er wordt automatisch `web/www` aan toegevoegd). Vanaf
`--from 1` wordt gelezen uit `.divinum-officium/step{from-1}` en is de
bronrepo niet nodig.

---

## Hoe de runner werkt

De runner heeft **twee modi**, gesplitst op `STREAMING_MAX_STEP = 6`:

### Streaming (step 0–6)

[`pipeline.ts`](pipeline.ts) verwerkt bestand-voor-bestand in plaats van per
stap een hele map:

1. **`getInputFiles(fromStep)`** — bij `fromStep 0` alle relevante `.txt` onder
   `DIVINUM_OFFICIUM_BASE/{horas,missa}` (via [`step0.getInputFiles`](step0.ts));
   anders alle bestanden onder `.divinum-officium/step{fromStep-1}`.
2. **Output-pad bepalen** — per invoerbestand wordt het output-pad berekend.
   Daarbij worden padtransformaties toegepast afhankelijk van het stap-bereik:
   - `getStep0OutputFile` — `.txt` → `.yml` en taalmap → ISO-code
     (`Latin` → `la`, enz.).
   - `getStep2OutputFile` — strip `\horas\` / `\missa\` en de directory- en
     bestandsnaam-suffixen, zodat varianten op **hetzelfde output-pad**
     uitkomen.
3. **Mergen** — meerdere invoerbestanden die naar hetzelfde output-pad wijzen
   (o.a. horas + missa, en rubriek-varianten) worden samengevoegd. `missa`
   heeft voorrang bij key-conflicten; `rule`-arrays worden als unie
   gededupliceerd (zie `processInputFiles`).
4. **Transformeren** — per bestand worden de transforms `step0` … `step6`
   in volgorde toegepast, voor zover ze binnen `[fromStep, toStep]` vallen.
5. **Caching & dependencies** — bestaande output wordt overgeslagen tenzij
   `--force`. Step 4 en 5 declareren afhankelijkheden (`extractDependencies`);
   ontbreekt een dependency nog in de cache, dan wordt het bestand achteraan de
   wachtrij gezet en later opnieuw geprobeerd.

### Batch (step 7–9)

Deze stappen kunnen **meerdere output-bestanden per invoer** produceren (step 7
schrijft één document onder meerdere naam-bestandsnamen; step 8 splitst
commemoraties naar aparte bestanden) of voegen samen **over bestanden heen**
(step 8 mergt dezelfde heilige uit meerdere bestanden). Dat past niet in het
1-op-1 streaming-model, dus `runBatchStep` draait ze als directory-operatie: lees
de hele `step{N-1}`-map, transformeer, schrijf `step{N}`. Batch-stappen bouwen
hun output altijd volledig opnieuw op (rm + mkdir); `--force` is voor hen niet
relevant. De gedeelde helpers staan in [`lib/batch.ts`](lib/batch.ts).

---

## Overzicht van de stappen (0-geïndexeerd)

| Stap | Input                                    | Transform                | Kort                                                                     |
| ---- | ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| 0    | `DIVINUM_OFFICIUM_BASE` `.txt`           | [`step0.ts`](step0.ts)   | Tekst → array van regels; taalmap → ISO-code                             |
| 1    | step0                                    | [`step1.ts`](step1.ts)   | Regels groeperen per sectie `[Key] (condition)` → object                 |
| 2    | step1                                    | [`step2.ts`](step2.ts)   | Directory-/bestandsnaam-suffixen → rubriek-condities (`includes`)        |
| 3    | step2                                    | [`step3.ts`](step3.ts)   | Inline conditionals in regels verwerken → rubriek-varianten              |
| 4    | step3                                    | [`step4.ts`](step4.ts)   | Brede referenties (`@File`, `ex …`, `vide …`) resolven                   |
| 5    | step4                                    | [`step5.ts`](step5.ts)   | Inline referenties `@File:Section:…:s/…/…/` resolven                     |
| 6    | step5                                    | [`step6.ts`](step6.ts)   | Rubriek-varianten materialiseren → `key` + `key/rubric` (platte `string[]`) |
| 7    | step6                                    | [`step7.ts`](step7.ts)   | Bestandsnaam = kebab van naam; `rank`/`officium` → `name` *(batch)*      |
| 8    | step7                                    | [`step8.ts`](step8.ts)   | Commemoraties naar aparte bestanden per heilige *(batch)*               |
| 9    | step8                                    | [`step9.ts`](step9.ts)   | Missa-secties structureren (`verse`/`prayer`/`antiphonal`) *(batch)*     |

---

## Step 0 — Tekst naar regel-array

- **Input:** `.txt` onder `DIVINUM_OFFICIUM_BASE/horas` en `…/missa`.
- **Filtering:** [`fileFilter`](step0.ts) houdt alleen `Latin/…`-paden aan (dus
  geen `Latin-gabc/`, `Help/`) en sluit diverse bestanden uit (`*.pl.txt`,
  `*tts.txt`, `ruler.txt`, `Linguae.txt`, `source.txt`, `Mobile.txt`, enz.).
  Het pad wordt relatief aan de taalroot gecontroleerd (bijv. `Latin/01-01.txt`).
- **`transform`:** splitst de bestandsinhoud op `\r?\n` naar een `string[]`.
- **`getOutputFile`:** `.txt` → `.yml` en de taalmap → ISO-code. De volledige
  lijst codes staat in `LANGUAGE_CODES` (`Latin` → `la`, `Nederlands` → `nl`,
  `English` → `en`, `Latin-Bea` → `la-bea`, enz.).

## Step 1 — Secties als object-keys

- **`transform(lines)`** → object waarin elke `[Sectienaam]` (of
  `[Sectie] (condition)`) een key wordt (kebab-case). Regels vóór de eerste
  sectie komen in `__preamble`. Elke sectie is een array van
  `{ value: string[]; condition: string[] }`; de condition komt uit het
  `(...)`-deel van de sectiekop (via `applyCondition`).
- In het preamble worden regels met `;;` afgekapt tot het deel vóór `;;`.
- Lege secties/varianten worden weggefilterd.

## Step 2 — Suffixen naar rubriek-condities

- **`transform(obj, inputFile)`** — leidt uit de directory- en bestandsnaam de
  rubriek-context af en voegt die als `includes`-condities toe aan de secties
  (via `applyIncludes`). De `mappings`-tabel vertaalt suffixen naar tokens,
  o.a. `t` → `1570`, `n` → `2020`, `r` → `1962`, `o` → `1888`, `oct` →
  `octava`, `cist` → `cisterciensis`, `M` → `monastica`, `OP` → `praedicatorum`,
  plus `…Feria`-nummering. `directoryMappings` doet hetzelfde voor
  variant-directories.
- **`getOutputFile`** — strip `\horas\`/`\missa\`, herleid variant-directories
  naar hun basis (`Commune`, `Martyrologium`, `Sancti`, `Tempora`) en verwijder
  niet-numerieke bestandsnaam-suffixen, zodat varianten naar het basisbestand
  mergen.

## Step 3 — Inline conditionals

- **`transform(input, inputFile)`** — verwerkt condition-regels binnen een
  sectie (poort van Divinum Officium's `process_conditional_lines`, zie
  [technical.html](https://www.divinumofficium.com/www/horas/Help/technical.html)):
  regels als `(sed rubrica 196 aut rubrica 1930)` splitsen de volgende regels op
  in rubriek-varianten (`{ value, condition }[]`).
- **Uitzondering:** bestanden onder een `Ordo/`-map worden ongewijzigd
  doorgegeven (`isStep3SkippedForPath`).

## Step 4 — Brede referenties resolven

- **`transform(obj, inputFile)`** — resolvet referenties op bestandsniveau:
  `@File` in het `__preamble` en `ex …` / `vide …` in de `rank`-regels. De
  gerefereerde secties worden ingeladen en samengevoegd, met propagatie van de
  condities. Voor `vide` worden alleen bepaalde secties overgenomen (`lectio*`,
  `ant-laudes`, `ant-vespera`, `versum*`, `oratio*`). `__preamble` wordt daarna
  verwijderd.
- **`extractDependencies`** — bepaalt welke andere bestanden eerst verwerkt
  moeten zijn (gebruikt door de dependency-retry in de runner).

## Step 5 — Inline referenties resolven

- **`transform(obj, inputFile)`** — resolvet referenties **binnen regels** in de
  vorm `@File:Section:lineRange:s/pattern/replacement/`. Ondersteunt
  substituties (`s/…/…/flags`) en een beperkte resolutiediepte
  (`MAX_RESOLVE_DEPTH = 5`).
- **`extractDependencies`** — zoals step 4.

## Step 6 — Rubriek-varianten materialiseren

Brug tussen de twee representaties: step 0–5 houden elke sectie als
`{ value, condition }[]` (de rubriek zit in de data); step 7–9 verwachten platte
`string[]` per key met de rubriek in de **key-naam**.

- **`transform(obj)`** — per key: de variant met lege condition houdt de basiskey
  (`oratio`); elke conditionele variant wordt `key/<gesorteerde-tokens>` (bijv.
  `oratio/1570`, `oratio/1570-octava`). De exacte suffix maakt voor step 7–9 niet
  uit — die kijken alleen naar het deel vóór de `/`.

## Step 7 — Bestandsnaam uit liturgische naam *(batch)*

- **`transform(obj)`** — vouw `rank`/`officium` samen tot `name` (voor `rank` het
  eerste deel vóór `;;`); overige keys blijven.
- **`run(inputDir, outputDir)`** — schrijf elk document onder elke distincte
  kebab-naam die uit `name`/`officium`/`rank` volgt; botsingen binnen een map
  (zelfde naam, andere inhoud) krijgen de originele stam als suffix.

## Step 8 — Commemoraties splitsen *(batch)*

- **`transform(obj)`** → `{ main, commemorations }`: `main` is het document zonder
  `commemoratio-*`-keys; `commemorations` bevat per heilige de `oratio`/`secreta`/
  `postcommunio`.
- **`run(inputDir, outputDir)`** — schrijf de gestripte main-bestanden plus per
  heilige `<dir>/<slug>.yml` (`name` uit de `!Pro S. …`-regel). Dezelfde heilige
  uit meerdere bestanden in dezelfde map mergt tot één bestand.

## Step 9 — Missa-secties structureren *(batch)*

- **`transform(obj)`** — zet secties om naar vaste types: `verse` `{ ref, text }`,
  `prayer` `{ text, closure }`, `antiphonal` `{ antiphon, verse }` (graduale ook
  `alleluia`). `rule` wordt opgeschoond (Gloria/Credo eruit; `Prefatio=X` → een
  `prefatio`-key). Niet-missa keys blijven ongewijzigd.
- **`run(inputDir, outputDir)`** — puur per bestand; geen cross-file logica.

---

## Ondersteunende modules

- [`condition.ts`](condition.ts) — rubriek-condities parsen en toepassen
  (`applyCondition`, `applyIncludes`, `getIncludesExcludes`, `parseConditional`).
- [`lib/batch.ts`](lib/batch.ts) — gedeelde batch-helpers (`runBatched`,
  `collectYmlFiles`, `ensureDir`) voor step 7–9.
- [`lib/`](lib) — `grouper.mjs` en `dependency-resolver.mjs` zijn overblijfselen
  van een eerdere opzet en worden nergens meer geïmporteerd.

## Tests

```bash
pnpm test            # vitest, hele repo
npx vitest run convert-do/step9.test.ts
```

Per-stap transform-tests: `step6.test.ts` … `step9.test.ts`; een end-to-end
batchtest in `batchSteps.test.ts`. Verder `step0.getInputFiles.test.ts`,
`pipeline.getInputFiles.test.ts`, `condition.test.ts`. `step3.test.ts` bevat
bestaande, niet-gerelateerde faalgevallen (verwijst naar een verwijderde API).
