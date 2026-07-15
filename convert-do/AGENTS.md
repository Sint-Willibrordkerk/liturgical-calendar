# Pipeline: Divinum Officium → gestructureerde YAML

De scripts in `convert-do/` zetten bronbestanden van het [Divinum
Officium](https://www.divinumofficium.com)-project stapsgewijs om naar
genormaliseerde YAML met duidelijke secties, rubriek-varianten en opgeloste
referenties. Elke stap leest uit de output van de vorige stap onder
`.divinum-officium/step{N}/` (relatief aan `process.cwd()`).

> **Let op — status van deze pipeline**
> - De actieve implementatie is de **TypeScript**-pipeline in deze map,
>   aangestuurd door [`index.ts`](index.ts) → [`pipeline.ts`](pipeline.ts).
>   De stappen zijn **0-geïndexeerd** (`step0` … `step13`).
> - Alleen **step 0 t/m 5** zijn daadwerkelijk geïmplementeerd en aangesloten.
>   [`step6.ts`](step6.ts) bestaat maar staat **uitgecommentarieerd** in de
>   pipeline (andere `transform`-signatuur); step 7–13 bestaan (nog) niet als
>   TypeScript.
> - De `pnpm`-scripts (`pipeline`, `pipeline:streaming`, `step1`…`step13`) en
>   `turbo.json` verwijzen naar een **`scripts2/`-map die niet bestaat** — die
>   commando's werken op dit moment niet. Zie
>   [Uitvoeren](#uitvoeren).

---

## Uitvoeren

De pipeline wordt direct via `index.ts` gedraaid met `tsx`:

```bash
# Volledige (geïmplementeerde) pipeline, output in .divinum-officium/step{to}/
npx tsx convert-do/index.ts

# Tot en met een specifieke stap
npx tsx convert-do/index.ts --to 5

# Vanaf een specifieke stap (leest .divinum-officium/step{from-1} als input)
npx tsx convert-do/index.ts --from 4 --to 5

# Eén stap
npx tsx convert-do/index.ts --step 2

# Opnieuw genereren i.p.v. bestaande output hergebruiken
npx tsx convert-do/index.ts --force
```

CLI-opties (zie [`index.ts`](index.ts)):

| Optie            | Default | Betekenis                                             |
| ---------------- | ------- | ----------------------------------------------------- |
| `--from <N>`     | `0`     | Startstap (0–13).                                     |
| `--to <N>`       | `13`    | Eindstap (0–13). Output komt in `step{to}/`.          |
| `--step <N>`     | —       | Kortere schrijfwijze voor `--from N --to N`.          |
| `-f`, `--force`  | `false` | Output-map leegmaken en alle bestanden herverwerken. Zonder deze vlag worden bestaande output-bestanden overgeslagen (caching). |

`step0` vereist de env-variabele **`DIVINUM_OFFICIUM_BASE`** (pad naar de
`divinum-officium`-repo; er wordt automatisch `web/www` aan toegevoegd). Vanaf
`--from 1` wordt gelezen uit `.divinum-officium/step{from-1}` en is de
bronrepo niet nodig.

---

## Hoe de runner werkt

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
4. **Transformeren** — per bestand worden de transforms `step0` … `step5`
   in volgorde toegepast, voor zover ze binnen `[fromStep, toStep]` vallen.
5. **Caching & dependencies** — bestaande output wordt overgeslagen tenzij
   `--force`. Step 4 en 5 declareren afhankelijkheden (`extractDependencies`);
   ontbreekt een dependency nog in de cache, dan wordt het bestand achteraan de
   wachtrij gezet en later opnieuw geprobeerd.

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
| 6    | step5                                    | [`step6.ts`](step6.ts)   | **Uitgecommentarieerd** — niet actief in de pipeline                     |
| 7–13 | —                                        | —                        | **Niet geïmplementeerd** in `convert-do`                                 |

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

## Step 6 — (niet actief)

[`step6.ts`](step6.ts) bevat nog een referentie-resolutievariant, maar heeft een
andere `transform`-signatuur (`(obj, context, resolvedFiles)`) dan de runner
aanroept, en staat daarom uitgecommentarieerd in [`pipeline.ts`](pipeline.ts).
Nog niet geïntegreerd.

---

## Ondersteunende modules

- [`condition.ts`](condition.ts) — rubriek-condities parsen en toepassen
  (`applyCondition`, `applyIncludes`, `getIncludesExcludes`, `parseConditional`).
- [`lib/`](lib) — `grouper.mjs` en `dependency-resolver.mjs` (hulpmiddelen uit
  een eerdere opzet).

## Tests

```bash
pnpm test            # vitest, hele repo
npx vitest run convert-do/step0.getInputFiles.test.ts
```

Bestaande testbestanden: `step0.getInputFiles.test.ts`,
`pipeline.getInputFiles.test.ts`, `step3.test.ts`, `condition.test.ts`.

---

## Verouderde `pnpm`-scripts

`package.json` en `turbo.json` verwijzen nog naar `scripts2/step1.mjs` …
`scripts2/step13.mjs`. Die map bestaat niet meer, dus `pnpm pipeline`,
`pnpm pipeline:streaming` en `pnpm step1` … `pnpm step13` falen op dit moment.
Gebruik in plaats daarvan `npx tsx convert-do/index.ts` (zie
[Uitvoeren](#uitvoeren)). Deze scripts en `turbo.json` moeten nog worden
bijgewerkt of verwijderd.
