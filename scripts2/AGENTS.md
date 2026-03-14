# Pipeline: Divinum Officium → gestructureerde YAML

De scripts in `scripts2/` zetten bronbestanden van het Divinum Officium-project stapsgewijs om naar genormaliseerde YAML met duidelijke secties, opgeloste referenties en bestandsnamen op basis van de liturgische naam. Elke stap leest uit de vorige en schrijft naar een eigen map onder `.divinum-officium/`.

**Uitvoeren:**
- `pnpm pipeline` — via Turbo, voert step1 … step13 in volgorde uit met tussenbestanden (caching)
- `pnpm pipeline:streaming` — streaming modus, verwerkt bestanden in-memory zonder tussenbestanden
- `pnpm step1`, `pnpm step2` … `pnpm step13` — individuele stappen los uitvoeren

---

## Overzicht


| Stap | Input                                         | Output | Kort                                                                       |
| ---- | --------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| 1    | `DIVINUM_OFFICIUM_BASE` (horas, missa) `.txt` | step1  | Tekst → YAML (één array van regels)                                        |
| 2    | step1                                         | step2  | Modificaties aan regels (zoals scripts/modify-source-files.mjs)            |
| 3    | step2                                         | step3  | Regels groeperen per sectie `[Key]`                                        |
| 4    | step3                                         | step4  | Horas + missa mergen per pad (rank→name, rule gededupliceerd)              |
| 5    | step4                                         | step5  | Rubric-varianten (01-12t, 01-12n, …) mergen in base-bestand met key-suffix |
| 6    | step5                                         | step6  | Directory-varianten (Martyrologium1570, SanctiCist, …) mergen in base-dir  |
| 7    | step6                                         | step7  | Keys normaliseren + rubric-conditions → `key/rubric`                       |
| 8    | step7                                         | step8  | Inline conditionals (rubrica/sed/aut/et) → eigen keys per rubric           |
| 9    | step8                                         | step9  | Referenties `@File:Section` resolven                                       |
| 10   | step9                                         | step10 | Bredere refs (preamble, ex, vide); opruimen                                |
| 11   | step10                                        | step11 | Bestandsnaam(s) = kebab van naam; meerdere bestanden bij meerdere namen    |
| 12   | step11                                        | step12 | Aparte bestanden voor commemoratio's (oratio, secreta, postcommunio)       |
| 13   | step12                                        | step13 | Missa-secties structureren (Verse/Prayer/Antiphonal)                       |


Elke stap leegt aan het begin de eigen **output-directory** (rm dan mkdir) voordat er wordt geschreven.

---

## Step 1 — Tekst naar YAML (regel-array)

- **Input:** `{DIVINUM_OFFICIUM_BASE}/horas` en `{DIVINUM_OFFICIUM_BASE}/missa` (alle `.txt`, behalve o.a. `*.pl.txt`, `*tts.txt`).
- **Output:** `.divinum-officium/step1` — zelfde mappenstructuur, bestanden als `.yml`. Elk bestand is één YAML-array: elke bronregel één element.
- **Taalcodes:** Taalmappen worden omgezet naar 2-letterige ISO-codes (of korte variant-codes):
  | Bron | Code |
  |------|------|
  | Latin | la |
  | Latin-Bea | la-bea |
  | Latin-gabc | la-gabc |
  | English | en |
  | Nederlands | nl |
  | Deutsch | de |
  | Francais | fr |
  | Italiano | it |
  | Espanol | es |
  | Portugues | pt |
  | Polski | pl |
  | Polski-Newer | pl-newer |
  | Magyar | hu |
  | Dansk | da |
  | Bohemice | cs |
  | Cesky-Schaller | cs-schaller |
  | Ukrainian | uk |
  | Vietnamice | vi |
- **Doel:** Eenduidig formaat voor verdere stappen. Encoding: eerst UTF-8, fallback Latin-1.
- **Script:** `pnpm step1` — vereist env `DIVINUM_OFFICIUM_BASE` (bijv. pad naar `divinum-officium/web/www`).

---

## Step 2 — Modificaties aan bronregels

- **Input:** `.divinum-officium/step1` (YAML per bestand = array van regels).
- **Output:** `.divinum-officium/step2` —zelfde structuur; regels waar nodig gewijzigd.
- **Doel:** Aanpassingen zoals in `scripts/modify-source-files.mjs`: per bestand of pad kunnen regels worden aangepast (vervangen, verwijderen). Eerste toepassing: `(rubrica tridentina)` overal laten verdwijnen in bestanden zoals `12-29o.yml`, zodat sectiekoppen `[Lectio1] (rubrica tridentina)` worden tot `[Lectio1]`. Uitbreidbaar met meer regels in `MODIFICATIONS` in `scripts2/step2.mjs`.

---

## Step 3 — Secties als object-keys

- **Input:** `.divinum-officium/step2` (YAML per bestand = array van regels).
- **Output:** `.divinum-officium/step3` — per bestand een object. Regels die met `[Sectienaam]` of `[Sectie] (condition)` beginnen starten een nieuwe key; regels ervóór komen in `__preamble`. Sectie-inhoud = array van regels.

---

## Step 4 — Horas + missa mergen

- **Input:** `.divinum-officium/step3/horas` en `.divinum-officium/step3/missa` (zelfde relatieve paden binnen elk).
- **Output:** `.divinum-officium/step4` — één bestand per pad (geen aparte horas/missa-mappen meer).
- **Doel:**
  - Sectiekeys naar kebab-case.
  - Keys met condition `[X] (condition)` → base key + variant-keys `baseKey/rubric` (onlyIn/exceptIn); `nisi` = exceptIn.
  - Rubric-namen uit conditions (o.a. "rubrica tridentina") worden geëxtraheerd en als key-suffix gebruikt.

---

## Step 5 — Rubric-varianten mergen in base

- **Input:** `.divinum-officium/step4` (één bestand per pad; bestanden met suffix zoals `01-12t`, `01-12n` naast `01-12`).
- **Output:** `.divinum-officium/step5` — één bestand per **base**. Rank→name toegepast.
- **Doel:** Bestanden met rubric-suffix (t, o, r, n, da, p, q, cc, oct, nt, ot, rt, …) worden in het base-bestand gemerged met key-suffix (bijv. `rank/tridentine`). Output-directory wordt aan het begin geleegd.

---

## Step 6 — Directory-varianten mergen in base-directory

- **Input:** `.divinum-officium/step5` (bestanden in directories met suffixen zoals `Martyrologium1570`, `SanctiCist`, `TemporaOP`).
- **Output:** `.divinum-officium/step6` — één directory per **base**. Variant-directories worden opgeheven; bestanden met dezelfde naam worden samengevoegd.
- **Doel:** Bestanden uit variant-directories (met suffix zoals `1570`, `1955R`, `1960`, `Cist`, `M`, `OP`) worden gemerged met het corresponderende bestand in de base-directory. Keys uit variant-bestanden krijgen een suffix (bijv. `__preamble/1570`, `name/cist`). De suffix is lowercase. Output-directory wordt aan het begin geleegd.
- **Mapping:**
  - `Martyrologium1570` → `Martyrologium` met suffix `/1570`
  - `Martyrologium1955R` → `Martyrologium` met suffix `/1955r`
  - `Martyrologium1960` → `Martyrologium` met suffix `/1960`
  - `SanctiCist` → `Sancti` met suffix `/cist`
  - `SanctiM` → `Sancti` met suffix `/m`
  - `SanctiOP` → `Sancti` met suffix `/op`
  - (idem voor `Tempora`-varianten)

---

## Step 7 — Key-normalisatie en rubric-conditions

- **Input:** `.divinum-officium/step6`.
- **Output:** `.divinum-officium/step7`.
- **Doel:**
  - Sectiekeys naar kebab-case.
  - Keys met condition `[X] (condition)` → base key + variant-keys `baseKey/rubric` (onlyIn/exceptIn); `nisi` = exceptIn.
  - Rubric-namen uit conditions worden geëxtraheerd en als key-suffix gebruikt.

---

## Step 8 — Inline conditionals verwerken

- **Input:** `.divinum-officium/step7`.
- **Output:** `.divinum-officium/step8`.
- **Doel:** Regels die een condition zijn (bijv. `(sed rubrica 196 aut rubrica 1930)`) worden verwerkt volgens de [Divinum Officium Technical](https://www.divinumofficium.com/www/horas/Help/technical.html) documentatie. De volgende regels tot de volgende condition worden onder eigen keys gezet per rubric: `key`, `key/196`, `key/1930`, enz. Alleen base keys (zonder `/`) worden gesplitst; keys met rubric-suffix blijven ongewijzigd. Condition-regels verdwijnen uit de output.

---

## Step 9 — Referenties resolven

- **Input:** `.divinum-officium/step8`.
- **Output:** `.divinum-officium/step9`.
- **Doel:** Referenties `@File:Section:lineRange:s/pattern/replacement/` vervangen door de opgehaalde content. Ontbrekende sectie: sectie-context. Beperkte resolutiediepte (MAX_RESOLVE_DEPTH). Ondersteunt single-tree (na step 4).

---

## Step 10 — Bredere referenties en opruimen

- **Input:** `.divinum-officium/step9`.
- **Output:** `.divinum-officium/step10`.
- **Doel:**
  - Bredere referenties: preamble-`@`, en `ex …` / `vide …` in rank/rule (genormaliseerde paden, bijv. C11 → Commune/C11).
  - Deze refs resolven waar nodig; daarna preamble-refs en ex/vide uit de content verwijderen.
  - Lege `__preamble` weglaten.

---

## Step 11 — Bestandsnaam = kebab van naam; meerdere bestanden bij meerdere namen

- **Input:** `.divinum-officium/step10` (huidige bestandsnamen bijv. `01-01.yml`, `C1.yml`).
- **Output:** `.divinum-officium/step11` —zelfde mappenstructuur. Voor elk bestand worden alle distincte "namen" verzameld uit base en rubric-varianten: `name`, `officium`, `rank` (eerste deel vóór `;;`) en alle `name/xxx`, `officium/xxx`, `rank/xxx`. Per distincte kebab-naam wordt één bestand geschreven met dezelfde inhoud. Hebben verschillende rubrieken dus eigen namen, dan ontstaan meerdere bestanden (zelfde inhoud, verschillende bestandsnaam). Geen naam → originele stem. Collisions (zelfde kebab in één map, andere inhoud) → suffix met originele stem.
- **Kebab:** lowercase, spaties → `-`, ongeldige tekens weg.

---

## Step 12 — Commemoratio's als aparte bestanden

- **Input:** `.divinum-officium/step11`.
- **Output:** `.divinum-officium/step12` — per directory één bestand per gecommemoreerde heilige. Bestandsnaam = kebab van de naam uit de "!Pro S. …" regel (bijv. `anastasia.yml`, `stephano-protomartyre.yml`).
- **Doel:** Secties `commemoratio-oratio`, `commemoratio-secreta`, `commemoratio-postcommunio` (eventueel met rubric-suffix) uit step11-bestanden verzamelen; per unieke commemoration-naam een YAML-bestand schrijven met keys `name`, `oratio`, `secreta`, `postcommunio`. De eerste regel ("!Pro S. …") wordt niet in de inhoud opgenomen; de rest van elke sectie wel. Meerdere step11-bestanden die dezelfde heilige commemoreren leveren één step12-bestand (inhoud wordt samengevoegd).

---

## Step 13 — Missa-secties structureren

- **Input:** `.divinum-officium/step12` (één boom).
- **Output:** `.divinum-officium/step13` —zelfde paden; secties introitus, oratio, lectio, enz. omgezet naar vaste types.
- **Doel:** Secties van het type Verse/Prayer/Antiphonal (introitus, oratio, lectio, graduale, evangelium, offertorium, secreta, communio, postcommunio, …) omzetten naar gestructureerde objecten (`{ ref, text }`, `{ text, closure }`, `{ antiphon, verse }`). Overige keys ongewijzigd. Output-directory wordt aan het begin geleegd.
- **Missa:** Verse `{ ref, text }`; Prayer `{ text, closure }`; Antiphonal `{ antiphon, verse }`. Regels voor "v.": begin-weglating; halverwege = scheiding antiphon/verse. Alleluia-markers strippen waar afgesproken.

---

## Volgorde en afhankelijkheden

- Step 1 vereist alleen `DIVINUM_OFFICIUM_BASE`.
- Step 2 leest step1; step 3 … 13 lezen steeds de output van de vorige stap.
- Voor een volledige run: `pnpm pipeline` (Turbo) of `pnpm step1` → `pnpm step2` → … → `pnpm step13`.

---

## Streaming modus

De streaming modus (`pnpm pipeline:streaming`) verwerkt bestanden in-memory zonder tussenbestanden op te slaan. Dit is nuttig voor:
- Snellere volledige runs wanneer caching niet nodig is
- Testen van de hele pipeline zonder disk I/O overhead
- Verwerking tot een specifieke stap

### CLI opties

```bash
# Volledige pipeline (step 1-13)
node scripts2/pipeline.mjs

# Tot en met specifieke stap
node scripts2/pipeline.mjs --to 5

# Vanaf specifieke stap
node scripts2/pipeline.mjs --from 4 --to 8

# Enkele stap
node scripts2/pipeline.mjs --step 7

# Help
node scripts2/pipeline.mjs --help
```

### Hoe het werkt

1. **Beginstate (--from):**
   - `--from 1` (standaard): start bij bron-.txt bestanden.
   - `--from N` (N > 1): laad beginstate uit `.divinum-officium/step{N-1}` (bestaande YAML-bestanden). Geen bronbestanden nodig.

2. **Verwerking:**
   - Geen voorafgaande groepering: per output-key worden bronbestanden (of bij --from > 1: één bestand per key) één voor één verwerkt.
   - **Merge when exists:** als het outputbestand voor die key al bestaat (bijv. door een eerder verwerkt bronbestand), wordt het bestaande bestand geladen en met het nieuwe resultaat gemerged (step 4/5/6 merge), daarna weggeschreven.
   - Bij `--from 1`: volgorde van keys door dependency graph (topologisch) als toStep ≥ 9.
   - Stappen fromStep t/m toStep worden op het (gemergede) resultaat uitgevoerd; alleen eindresultaat wordt weggeschreven.

### Architectuur

De step scripts exporteren nu `transform()` functies (en `merge()` voor step 4-6) die door de pipeline runner worden aangeroepen:

```
scripts2/
├── lib/
│   ├── grouper.mjs          # Bepaalt output-key per bronbestand
│   └── dependency-resolver.mjs  # Bouwt en sorteert dependency graph
├── pipeline.mjs              # Streaming pipeline runner met CLI
└── step1.mjs ... step13.mjs  # Stappen met geëxporteerde transform functies
```

### Opslag halverwege: alternatieven voor YAML

YAML is handig: leesbaar, diff-vriendelijk en eenvoudig te debuggen. Als je vooral wilt **versnellen** of **schalen**:

- **JSON** — Sneller parsen dan YAML, geen comments; prima voor tussenstappen.
- **MessagePack / BSON** — Binair, compacter en sneller I/O; minder leesbaar.
- **SQLite** — Eén bestand, query’s mogelijk, transacties; wel meer setup en minder handig voor “één object per bestand”.
- **Alleen eindresultaat opslaan** — Tussenstappen in memory (zoals in streaming) en alleen de laatste stap naar disk; dan is formaat minder belangrijk.

Voor deze pipeline blijft YAML een goede keuze: menselijk leesbaar, werkt goed met git, en de bottleneck zit vaker in de transformaties dan in het schrijven van tussenbestanden.
