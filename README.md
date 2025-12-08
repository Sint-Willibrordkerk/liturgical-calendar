# Liturgical Calendar

Generate a Catholic liturgical calendar in accordance with the 1960 rubrics (Traditional Latin Mass / Extraordinary Form).

## Overview

This library generates a complete liturgical calendar for any given year, following the 1960 Roman Catholic liturgical calendar. It supports:

- **Base calendar**: The universal 1960 liturgical calendar
- **Local propers**: Add the local propers of your dioces or congregation to this repository; see Ultrajectum as an example. 
- **Translations**: Multi-language support; see nl_NL as an example.

## Installation

```bash
npm install liturgical-calendar
# or
pnpm add liturgical-calendar
# or
yarn add liturgical-calendar
```

## Usage

### Basic Example

```javascript
import generateCalendar from 'liturgical-calendar';

// Generate calendar for 2026
const calendar = generateCalendar(2026);

// Access a specific day
const january1 = calendar[1][1]; // January 1st
console.log(january1.title); // "Octava Nativitatis Domini"
```

### Parameters

- `year` (number): The year for which to generate the calendar
- `propers` (string[]): Array of proper names to include (e.g., `['ultrajectum', 'fsspx']`)
- `lang` (string): Language code for translations (e.g., `'en'`, `'nl_NL'`)

### With Local Propers

```javascript
// Generate calendar with local propers (e.g., Utrecht diocese)
const calendar = generateCalendar(2026, ['ultrajectum'], 'nl_NL');

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
pnpm build
```

### Running

```bash
pnpm start # uses scripts/main.js to generate test_output.yml
```

### Project Structure

```
├── assets/              # YAML data files
│   ├── calendar1962.yml # Base calendar
│   ├── propers/         # Local proper calendars
│   └── translations/    # Translation files
├── src/                 # TypeScript source
├── dist/                # Compiled output
└── scripts/              # Utility scripts
```

## License

MIT

## Author

Sint Willibrordus Stichting
