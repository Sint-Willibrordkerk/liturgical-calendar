const { writeFileSync } = require("fs");
const { default: generateCalendar } = require("../dist/index.mjs");
const { default: nl } = require("../languages/nl/dist/index.mjs");
const { stringify } = require("yaml");

writeFileSync("./test_output.yml", stringify(generateCalendar({ year: 2026, languages: [nl] })[8][19]));
