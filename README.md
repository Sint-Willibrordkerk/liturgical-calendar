# Liturgical Calendar

Generate a Catholic liturgical calendar in accordance with the 1960 rubrics (Traditional Latin Mass / Extraordinary Form).

## Overview

This library generates a complete liturgical calendar for any given year, following the 1960 Roman Catholic liturgical calendar. It supports:

- **Base calendar**: The universal 1960 liturgical calendar
- **Local propers**: Add the local propers of your dioces or congregation to this repository; see Ultrajectum as an example. 
- **Translations**: Multi-language support; see nl as an example.

## Installation

The calendar and the propers are published separately: this package holds the
calendar, and each language holds its own Mass propers and translations. Install
the calendar and the languages you read.

```bash
pnpm add liturgical-calendar @sint-willibrordkerk/liturgical-calendar-la
# or Dutch, or both
pnpm add liturgical-calendar @sint-willibrordkerk/liturgical-calendar-nl
```

The propers run to well over a megabyte per language, so a caller carries only
the languages they ask for.

## Usage

### Basic Example

```javascript
import generateCalendar from 'liturgical-calendar';
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
  commemorations: Commemoration[];
};
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
│   ├── sanctorum.yml
│   └── propers/         # Local proper calendars
├── languages/           # One package per language
│   ├── la/assets/       #   mass-propers/la/ (generated)
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
