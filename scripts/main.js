const { writeFileSync } = require("fs");
const { default: generateCalendar } = require("../dist/index.mjs");
const { stringify } = require("yaml");

console.log(generateCalendar);

writeFileSync(
  "./test_output.yml",
  stringify(generateCalendar(2025, ["ultrajectum", "fsspx"], "nl_NL"))
);
