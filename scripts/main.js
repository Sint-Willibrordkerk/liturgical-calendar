const { writeFileSync } = require("fs");
const { default: generateCalendar } = require("../dist/index");
const { stringify } = require("yaml");

writeFileSync(
  "./test_output.yml",
  stringify(generateCalendar(2025, ["ultrajectum", "fsspx"], "nl_NL"))
);
