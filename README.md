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
calendar and the days of the Mass propers, which are the same in every language,
and each language holds its words for them — its readings, prayers and chants —
and its translations. Install the calendar and the languages you read.

```bash
pnpm add @sint-willibrordkerk/liturgical-calendar @sint-willibrordkerk/liturgical-calendar-la
# or Dutch, or both
pnpm add @sint-willibrordkerk/liturgical-calendar @sint-willibrordkerk/liturgical-calendar-nl
```

A language runs to about a megabyte, so a caller carries only the languages they
ask for.

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
  in. It supplies the words of the Mass propers and the translations. Optional;
  omit it for the bare calendar, whose days have no Mass.
- `options` (Options): Optional.
  - `martyrologium` (boolean): give each day the Roman Martyrology; see
    [The Martyrology](#the-martyrology).

### With Local Propers

```javascript
import nl from '@sint-willibrordkerk/liturgical-calendar-nl';

// Generate calendar with local propers (e.g., Utrecht diocese)
const calendar = generateCalendar(2026, ['ultrajectum'], nl);

// November 7th will show local feast
const november7 = calendar[11][7];
console.log(november7.title); // "H. Willibrordus" (in Dutch)
```

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
pnpm pipeline
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
│   ├── propers/         # Local proper calendars
│   └── mass-propers/    # The days of the Mass propers, keys only (generated)
├── languages/           # One package per language: what the keys say
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
