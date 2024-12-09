const { writeFileSync, readFileSync } = require("fs");
const { default: generateCalendar } = require("../dist/index");
const { parse, stringify } = require("yaml");

writeFileSync("./test_output.yml", stringify(generateCalendar(2024, "nl_NL")));
