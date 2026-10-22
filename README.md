# Liturgical Calendar

Generate a Catholic liturgical calendar in accordance with the 1960 Code of
Rubrics, as promulgated in the 1962 Missal (Traditional Latin Mass /
Extraordinary Form). The rubrics are of 1960 and the books of 1962, which is
why the calendar data is `calendar1962.yml` and the propers are published
under the `1962` rubric.

## Overview

This library generates a complete liturgical calendar for any given year. It supports:

- **Base calendar**: The universal calendar
- **Local propers**: Add the local propers of your diocese or congregation to this repository; see Ultrajectum as an example.
- **Mass propers**: The Introit, readings, chants and prayers of each day,
  generated from Divinum Officium
- **Translations**: Multi-language support; see nl as an example.

## Installation

The calendar and the propers are published separately: this package holds the
calendar, and each language holds its own Mass propers and translations. Install
the calendar and the languages you read.

```bash
pnpm add @sint-willibrordkerk/liturgical-calendar @sint-willibrordkerk/liturgical-calendar-la
# or Dutch, or both
pnpm add @sint-willibrordkerk/liturgical-calendar @sint-willibrordkerk/liturgical-calendar-nl
```

The propers run to well over a megabyte per language, so a caller carries only
the languages they ask for.

## Usage

### Basic Example

```javascript
import generateCalendar from '@sint-willibrordkerk/liturgical-calendar';
import la from '@sint-willibrordkerk/liturgical-calendar-la';

// Generate calendar for 2026
const calendar = generateCalendar(2026, [], la);

// Access a specific day
const january1 = calendar[1][1]; // January 1st
console.log(january1.title); // "in-circumcisione-domini"
console.log(january1.mass.introitus); // the Introit, in Latin
```

Called without a language the calendar is still generated — the days fall where
they fall — but no day carries a Mass and nothing is translated.

### Parameters

- `year` (number): The year for which to generate the calendar
- `propers` (string[]): Array of proper names to include (e.g., `['ultrajectum', 'fsspx']`)
- `language` (Language): A language package —
  `@sint-willibrordkerk/liturgical-calendar-la`, `…-nl` — imported and passed
  in. It supplies both the Mass propers and the translations. Optional; omit it
  for the bare calendar.
- `options` (Options): Optional.
  - `martyrologium` (boolean): give each day the Roman Martyrology; see
    [The Martyrology](#the-martyrology).
  - `votiveMasses` (string[]): votive Masses to observe; see
    [Votive Masses](#votive-masses).

### With Local Propers

```javascript
import nl from '@sint-willibrordkerk/liturgical-calendar-nl';

// Generate calendar with local propers (e.g., Utrecht diocese)
const calendar = generateCalendar(2026, ['ultrajectum'], nl);

// November 7th will show local feast
const november7 = calendar[11][7];
console.log(november7.title); // "H. Willibrordus" (in Dutch)
```

### Votive Masses

A votive Mass is said outside the order of the office, as a matter of local
devotion. They are opt-in: name the ones observed in the fourth argument, each by
its Latin slug (like the calendar's other titles).

```javascript
const calendar = generateCalendar(2026, [], la, {
  votiveMasses: [
    'sacratissimi-cordis-domini-nostri-jesu-christi',
    'immaculati-cordis-beatae-mariae-virginis',
  ],
});
```

The catalogue (`VotiveMassId`) covers the votive Masses the general rubrics name
— of the mysteries of the Lord (§308), of the Blessed Virgin (§309), and of the
angels (§310). But the rubrics fix a recurring **day** for only these, so only
these are placed on the calendar:

| id (slug) | Day | Class | Rubric |
| --- | --- | --- | --- |
| `sacratissimi-cordis-domini-nostri-jesu-christi` | first Friday of the month | 3rd | §385b |
| `immaculati-cordis-beatae-mariae-virginis` | first Saturday of the month | 3rd | §385c |
| `domini-nostri-jesu-christi-summi-et-aeterni-sacerdotis` | first Thursday of the month | 3rd | §385a |
| `sanctorum-angelorum` | every Tuesday | 4th | §310b, §389 |

The rest of the catalogue — the Holy Trinity, the Holy Name, the Precious Blood,
Christ the King, the Blessed Sacrament, the Holy Cross, the Passion, the Holy
Family, the Holy Spirit, and the Saturday Office of Our Lady (already in the base
calendar) — may be enabled, but the rubrics give them no day, so the calendar
places them nowhere: they are said for an occasion the priest chooses, not on a
date. The same holds for the votive Masses the rubrics tie to an occasion rather
than a day (§329, §342: dedications, the rogations, the Forty Hours, weddings, and
the like) and for the open categories of any saint (§311) and the Masses "for
various occasions" (§313); these are not part of the calendar's placement.

A votive Mass is said on a day open to its class (§317, §384): a third-class
votive — the Sacred Heart, the Immaculate Heart, the Eternal High Priest — on a
day of the third or fourth class, and a fourth-class votive — the Holy Angels —
only on a fourth-class day. Where it is admitted it takes the day's place, with
no commemoration of what it displaced. So on the first Saturday the Immaculate
Heart is shown even over a third-class feast, and over the Saturday Office of the
Blessed Virgin. It still yields to any day of the first or second class, to a
vigil, and to the privileged ferias of Advent and Lent, which are no free day.
A day the votive takes wears the votive's color — white for all four — in place
of the feria's.

The Eternal High Priest is granted the first Thursday *or* the first Saturday
(§385a); the Thursday is taken, leaving the first Saturday to the Immaculate
Heart.

The Sacred Heart and the Immaculate Heart borrow the Mass of their own feast, so
they carry full propers wherever the language provides them. The Eternal High
Priest and the votive of the Holy Angels have no feast in the universal calendar
to draw on; until their propers are added to the language packages, those days
carry the votive's name but no Mass.

### Calendar Structure

The returned calendar is a nested object:

```typescript
type Calendar = Record<
  number, // month (1-12)
  Record<
    number, // day (1-31)
    LiturgicalDay | undefined
  >
>;

type LiturgicalDay = {
  title?: string;
  type?: string;
  liturgicalClass: number;
  season: Season;
  color: Color;
  alternativeColor?: Color;
  seasonName?: string;
  colorName?: string;
  alternativeColorName?: string;
  commemorations: Commemoration[];
  martyrologium?: Martyrologium;
};
```

### Seasons and Colors

Every day carries the season it falls in and the color its Mass wears, as the
1960 rubrics divide the year (nn. 71–78) and assign the vestments (nn. 117–134).

```javascript
const gaudete = calendar[12][13]; // the Third Sunday of Advent, 2026
console.log(gaudete.season); // "adventus"
console.log(gaudete.color); // "violet"
console.log(gaudete.alternativeColor); // "rose"
```

The seasons are named as the rubrics name them:

| `season`        | From                        | To                                  |
| --------------- | --------------------------- | ----------------------------------- |
| `adventus`      | First Sunday of Advent      | Vigil of the Nativity               |
| `nativitatis`   | Christmas Day               | 5 January                           |
| `epiphaniae`    | Epiphany                    | 13 January                          |
| `per-annum`     | 14 January                  | Saturday before Septuagesima        |
| `septuagesimae` | Septuagesima Sunday         | Shrove Tuesday                      |
| `quadragesimae` | Ash Wednesday               | Saturday before Passion Sunday      |
| `passionis`     | Passion Sunday              | Holy Saturday                       |
| `paschatis`     | Easter Sunday               | Vigil of the Ascension              |
| `ascensionis`   | Ascension                   | Vigil of Pentecost                  |
| `pentecostes`   | Pentecost                   | Saturday in the octave of Pentecost |
| `per-annum`     | Trinity Sunday              | Saturday before Advent              |

The colors are `white`, `red`, `green`, `violet`, `rose` and `black`. The color
is that of the Mass said; a commemoration carries none, being a collect added to
that Mass rather than a Mass of its own. `alternativeColor` is set only on
Gaudete and Laetare Sunday, where rose may be worn in place of violet.

`season` and `color` are identifiers and never change with the language. The
language names them beside the identifier, in `seasonName`, `colorName` and
`alternativeColorName` — "Advent" and "paars" in Dutch, "Tempus Adventus" and
"violaceus" in Latin — and without a language those fields are absent.

A day's color comes from its entry in the calendar data where that names one,
and otherwise from a rule: a feast is white, a vigil outside paschaltide is
violet, and any other day — a Sunday, a feria, a day of an octave — wears the
color of its season. So the calendar data names only the exceptions: the
martyrs, the apostles and evangelists, and the feasts of the Cross and the
Precious Blood are marked `red`; Good Friday and All Souls `black`; the Vigil of
Pentecost `red`; the September Ember days `violet`.

Holy Saturday is given to Passiontide and wears violet; the Mass of the Easter
Vigil, celebrated that night, is white.

### The Martyrology

Ask for it and each day carries the Roman Martyrology printed under its date,
as the 1960 rubrics have it:

```javascript
const calendar = generateCalendar(2026, [], la, { martyrologium: true });
const reading = calendar[1][21].martyrologium;
console.log(reading.titulus); // "Duodécimo Kaléndas Februárii"
console.log(reading.lunaName); // "Luna secúnda"
console.log(reading.elogia[0]); // "Romæ pássio sanctæ Agnétis, …"
```

```typescript
type Martyrologium = {
  titulus: string; // the date in the Roman reckoning
  luna?: number; // the age of the moon, 1–30
  lunaName?: string; // as the language says it
  mobile?: string[]; // the announcement of a movable day, read first
  elogia: string[]; // the entries, in the order they are read
  conclusio?: { versus: string; responsum: string };
};
```

The Martyrology of a date is **read the day before**, at Prime: the reading on
the 21st of January above is the one said on the 20th. A day carries the
reading of its own date so that the entries stay with the saints' day; whoever
reads it, reads it a day early. So Easter's *Hac die quam fecit Dóminus*, said on
Easter Sunday before the Martyrology of the Monday, is in the Monday's
`mobile`.

The text is Divinum Officium's. The age of the moon is reckoned from the
Martyrology's own tables, for the years they cover (1582–2299); in a leap year
the 24th and 25th of February are both *Sexto Kaléndas Mártii*, with the same
moon. Rubrics addressed to the reader — *Hic vox elevatur…* — are left out of
the text.

The Martyrology is in Latin only: Divinum Officium has no Dutch one, so a Dutch
calendar asked for it carries none. It adds about half a megabyte to the Latin
package and a few kilobytes to each day, which is why it is left out unless
asked for.

### Colors in Local Propers

A day in a local proper is white unless it says otherwise. Give a martyr's day
its color beside its title:

```yaml
- slot-name: dioecesis-3
  calendar:
    15-07: S. Plechelmi
    18-07: { title: S. Frederici, color: red }
```

## Development

### Building

```bash
pnpm install
pnpm build            # the calendar
pnpm build:languages  # the language packages
```

The Mass propers are generated from [Divinum
Officium](https://github.com/DivinumOfficium/divinum-officium) rather than kept
in this repository. To rebuild them, point `DIVINUM_OFFICIUM_BASE` at a checkout
and run:

```bash
pnpm pipeline --from 0 --to 11
pnpm copy-mass-propers
```

### Running

```bash
pnpm start # uses scripts/main.js to generate test_output.yml
```

### Project Structure

```
├── assets/              # What every language shares
│   ├── calendar1962.yml # Base calendar
│   └── propers/         # Local proper calendars
├── languages/           # One package per language
│   ├── la/assets/       #   mass-propers/la/, martyrologium/la/ (generated)
│   └── nl/assets/       #   mass-propers/nl/ (generated), translations/nl/
├── convert-do/          # The pipeline that generates the Mass propers
├── src/                 # TypeScript source
├── dist/                # Compiled output
└── scripts/             # Utility scripts
```

## License

MIT

## Author

Sint Willibrordus Stichting
