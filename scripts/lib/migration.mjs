import { readFile, access } from "fs/promises";
import { logger } from "../common/logger.mjs";
import { writeYamlFile, readYamlFile } from "../common/fileUtils.mjs";
import { toKebabCase } from "../common/utils.mjs";
import { constants } from "fs";

const rubricTypes = [
  "rubrica [tT]ridentina",
  "rubrica tridentina loco (?:hujus|hæc) versus",
  "rubrica 1570",
  "rubrica 1617",
  "rubrica 1888",
  "rubrica 1906",
  "rubrica 1910",
  "rubrica 1930",
  "rubrica 1939",
  "rubrica 195",
  "rubrica 1951",
  "rubrica 1955",
  "rubrica 196",
  "rubrica 1960",
  "rubrica 1960 loco hujus versus",
  "rubrica 1960 loco horum versuum",
  "rubrica 1962",
  "rubrica 1963",
  "rubrica divino",
  "rubrica divino afflatu",
  "rubrica innovata",
  "rubrica [mM]onastica",
  "rubrica cisterciensis",
  "rubrica cisterciensis et feria [2-7]",
  "rubrica cisterciensis loco (?:hujus|hæc) versus",
  "rubrica altovadensis",
  "rubrica praedicatorum",
  "rubrica Barroux",
  "rubrica (?:Ordo )?Praedicatorum",
  "communi Summorum Pontificum",
  "communi Summorum Pontificum et ad missam",
  "die in Cœna Domini",
  "die in Parasceve",
  "die Sabbato Sancto",
  "die Omnium Defunctorum",
  "die doctorum",
  "die Nat28",
  "die Nat29",
  "post partum(?: loco horum versuum)?",
  "tempore post partum loco horum versuum",
  "Adventus(?: loco horum versuum)?",
  "(?:tempore )?[nN]ativitatis",
  "die Epiphaniæ",
  "(?:tempore )?[eE]piphaniæ",
  "tempore post Epiphaniam",
  "post Septuagesimam",
  "(?:tempore )?[sS]eptuagesimæ",
  "Quadragesimæ",
  "(?:tempore )?Passionis(?: loco horum versuum)?",
  "(?:tempore )?[pP]aschali(?: loco horum versuum)?",
  "tempore Octava",
  "tempore Octava Paschæ",
  "commune C1\\[012\\]",
  "commune C[0-9]+",
  "commune C4 aut commune C5 loco hujus versus",
  "feria [1-7]",
  "mense \\d+",
];
const rubricsUnion = `(?:${rubricTypes.join("|")})`;
const rubricOptions = `(?:${rubricsUnion})(?: aut ${rubricsUnion})*`;

const rubricaPattern = /^\((.+)\)$/;
const deindePattern = new RegExp(
  `^deinde( ${rubricOptions})?(?: dicuntur| dicitur)?(?: semper)?$`
);
const diciturPattern = new RegExp(
  `^(${rubricOptions})(?: (?:dicitur|dicuntur)(?: semper)?)$`
);
const sedPattern = new RegExp(
  `^sed (${rubricOptions})(?: (?:dicitur|dicuntur))?$`
);
const omittiturPattern = new RegExp(
  `^sed (${rubricOptions})(?: hæc versus)? (?:omittitur|omittuntur)$`
);
const nisiPattern = new RegExp(
  `^(?:sed (${rubricOptions}) )?nisi (${rubricOptions})$`
);

function migrateKey(key) {
  // Check if key has pattern: [Key] (rubrics key)
  const keyPattern = key.match(/^\[([^\]]+)\](?: \(([^)]+)\))?$/);
  if (keyPattern)
    return keyPattern[2]
      ? `${toKebabCase(keyPattern[2])}/${toKebabCase(keyPattern[1])}`
      : toKebabCase(keyPattern[1]);

  throw new Error(`Key "${key}" does not match key pattern`);
}

function migrateValue(value) {
  const result = { default: [] };

  for (let i = 0; i < value.length; i++) {
    const line = value[i];
    const rubrica = line.match(rubricaPattern)?.[1];
    if (rubrica) {
      if (deindePattern.test(rubrica)) continue;

      const nextLine = value[++i];
      let includes,
        excludes,
        replace = false;
      const dicitur = rubrica.match(diciturPattern);
      const sed = rubrica.match(sedPattern);
      const omittitur = rubrica.match(omittiturPattern);
      const nisi = rubrica.match(nisiPattern);

      if (dicitur) includes = dicitur[1];
      else if (sed) {
        includes = sed[1];
        replace = true;
      } else if (omittitur) excludes = omittitur[1];
      else if (nisi) {
        includes = nisi[1];
        excludes = nisi[2];
      } else throw new Error(`Unknown rubrica: ${rubrica}`);

      includes = includes?.split(" aut ").map(toKebabCase);
      excludes = excludes?.split(" aut ").map(toKebabCase);

      includes?.forEach((rubrica) => {
        result[rubrica] ??= [...result.default];
      });
      excludes?.forEach((rubrica) => {
        result[rubrica] ??= [...result.default];
      });
      Object.entries(result).forEach(([key, segment]) => {
        if ((!includes || includes.includes(key)) && !excludes?.includes(key))
          segment[replace ? segment.length - 1 : segment.length] = nextLine;
      });
    } else {
      Object.values(result).forEach((segment) => segment.push(line));
    }
  }
  return result;
}

function migrateSection(section) {
  const sectionLines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);

  const rawKey = sectionLines[0];
  const rawValue = sectionLines.slice(1);

  const keyReference = rawKey.match(/^(?:\((nisi )?rubrica (.*)\))?(@.*)$/);
  if (keyReference) {
    const key = keyReference[2]
      ? `rubrica-${keyReference[2]}/references`
      : "references";
    return keyReference[1]
      ? { references: keyReference[3], [key]: [] }
      : { [key]: keyReference[3] };
  } else {
    let key = migrateKey(rawKey);
    let value = migrateValue(rawValue);

    if (key === "rank" || key.endsWith("/rank")) {
      Object.entries(value).forEach(([rubric, item]) => {
        value[rubric] = item.flatMap((line) => line.split(";;"));
        if (value[rubric][3])
          value[rubric][3] = value[rubric][3].replace(/^(?:ex|vide) /, "@");
      });
    }

    if (key.startsWith("nisi-")) {
      return {
        [key.split("/")[1]]: value.default,
        ...Object.fromEntries(
          key
            .split("/")[0]
            .replace("nisi-", "")
            .split(" aut ")
            .map((rubric) => [`${rubric}/${key.split("/")[1]}`, []])
        ),
        ...Object.fromEntries(
          Object.entries(value)
            .filter(([rubric]) => rubric !== "default")
            .map(([rubric, value]) => [`${rubric}/${key.split("/")[1]}`, value])
        ),
      };
    }

    return {
      [key]: value.default,
      ...Object.fromEntries(
        Object.entries(value)
          .filter(([rubric]) => rubric !== "default")
          .map(([rubric, value]) => [`${rubric}/${key}`, value])
      ),
    };
  }
}

function migrateContent(content) {
  const sections = content
    .split(/\r?\n\r?\n/)
    .map((section) => section.trim())
    .filter((section) => section.length);
  logger.debug(`Found ${sections.length} sections`);

  return sections.reduce((acc, section) => {
    const result = migrateSection(section);
    const duplicateKeys = Object.keys(result).filter((key) => !!acc[key]);
    if (duplicateKeys.length > 0)
      throw new Error(`Duplicate key: ${duplicateKeys.join(", ")}`);

    return {
      ...acc,
      ...result,
    };
  }, {});
}

export async function migrateFile(from, to) {
  const content = await readFile(from, "utf-8");
  let result = migrateContent(content);
  let hasOtherResult = true;

  try {
    await access(to, constants.F_OK);
  } catch {
    hasOtherResult = false;
  }

  if (hasOtherResult) {
    const otherResult = await readYamlFile(to);
    result = { ...otherResult, ...result };

    Object.entries(result).forEach(([key, value]) => {
      if (
        !otherResult[key] ||
        (typeof value === "string" && value === otherResult[key]) ||
        (Array.isArray(value) &&
          value.length === otherResult[key].length &&
          value.every((item, index) => item === otherResult[key][index]))
      )
        return;
      const rubrica = key.includes("/") ? key.split("/")[0] : undefined;
      const subKey = rubrica ? key.split("/")[1] : key;

      if (subKey === "references")
        result.references = [value, otherResult.references];
      else if (subKey === "rule")
        result.rule = Array.from(new Set([...value, ...otherResult.rule]));
      else if (
        subKey === "name" &&
        value[0] === otherResult[key][0] &&
        value.slice(1).every((item) => item.includes("=")) &&
        otherResult[key].slice(1).every((item) => item.includes("="))
      ) {
        result.name = [
          value[0],
          ...new Set([...value.slice(1), ...otherResult[key].slice(1)]),
        ];
      } else {
        logger.debug(`value: ${value}`);
        logger.debug(`other: ${otherResult[key]}`);
        throw new Error(`Duplicate key: ${key}`);
      }
    });
  }

  await writeYamlFile(to, result);
}
