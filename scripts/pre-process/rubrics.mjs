import { toKebabCase } from "../common/utils.mjs";
import { logger } from "../common/logger.mjs";

const years = {
  1570: ["tridentina", "trident"],
  1617: [],
  1888: [],
  1906: [],
  1911: ["divino"],
  1930: ["193"],
  1951: [],
  1954: [],
  1955: [],
  1961: ["196", "1960"],
  1962: [],
  1963: [],
  2020: ["newcal", "innovata"],
};

const orders = {
  "SOCist-1951": ["cisterciensis", "cisterciensisa", "cisterciensisi"],
  "SOCist-1957": ["altovadensis"],
  OP: ["praedicatorum", "ordo praedicatorum"],
  OSB: ["barroux"],
  monastica: ["^monastic"],
};

const tempores = [
  "tempore adventus",
  "tempore post septuagesimam",
  "tempore paschali",
  "tempore octava corpus",
  "tempore octava ssmi cordis",
  "die caroli",
];
const other = [
  "communi summorum pontificum",
  "ad vesperam",
  "ad missam",
  "missa brevior",
  "missa longior",
  "rubrica numquam",
];

const FERIA = /^(?:feria|mense) [0-9]+$/i;

export function resolveRubrics(rubrics) {
  if (!rubrics) return { allow: ["default"], disallow: [] };
  const rubricItems = rubrics.replace("sed non", "nisi").split(" aut ");

  const result = { allow: [], disallow: [] };
  let hasNisi = false;

  for (const item of rubricItems) {
    if (item.startsWith("nisi")) {
      hasNisi = true;
    }
    for (const subItem of item.split(/ ?nisi /)) {
      if (!subItem.trim()) continue;

      const resolved = subItem
        .split(/ et /)
        .map((subSubItem) => resolveRubricsItem(subSubItem))
        .join("/");
      if (resolved) {
        if (hasNisi) {
          result.disallow = [...result.disallow, resolved];
        } else {
          result.allow = [...result.allow, resolved];
        }
      }
      if (item.includes("nisi")) {
        hasNisi = true;
      }
    }
  }

  if (hasNisi && !result.allow.length) {
    result.allow = ["default"];
  }

  return result;
}

function resolveRubricsItem(rubrics) {
  const feria = rubrics.match(FERIA);
  if (feria) {
    return toKebabCase(feria[0]);
  }

  for (const [key, alts] of Object.entries({ ...years, ...orders })) {
    if (
      [key, ...alts]
        .map((item) => `rubrica ${item}`)
        .includes(rubrics.toLowerCase())
    ) {
      return key;
    }
  }

  if ([...other, ...tempores].includes(rubrics.toLowerCase())) {
    return rubrics.toLowerCase();
  }

  throw new Error(`Unknown rubrics: ${rubrics}`);
}

export function applyRubrics(rubrics, key, value) {
  const result = {};
  rubrics.allow?.forEach((rubric) => {
    rubric = rubric === "default" ? null : rubric;
    result[rubric ? `${rubric}/${key}` : key] = value;
  });
  rubrics.disallow?.forEach((rubric) => {
    result[rubric ? `${rubric}/${key}` : key] = [];
  });
  return result;
}
