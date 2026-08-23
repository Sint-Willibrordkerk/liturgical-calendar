const backscopedStopwords = { sed: 1, vero: 1, atque: 2, attamen: 3 };
const stopwords = { ...backscopedStopwords, si: 0, deinde: 1 };
const instructions = ["dicitur, dicuntur", "omittitur, omittuntur"];
const scopes = [
  "loco hujus versus",
  "loco horum versuum",
  "hic versus",
  "hi versus",
];

const subjects = [
  "rubricis",
  "rubrica",
  "tempore",
  "missa",
  "communi",
  "die",
  "feria",
  "commune",
  "votiva",
  "officio",
  "ad",
  "mense",
];

const predicates = {
  tridentina: ["1570"],
  "summorum pontificum": ["1942"],
  "196": ["1962"],
  "1960": ["1962"],
  innovata: ["2020"],
  innovatis: ["2020"],
  "^monastica": ["monastica"],
  "Monastic.*Divino": ["monastica", "1913"],
  "post septuagesimam": ["septuagesimam"],
  feriali: ["feria"],
};

/*
           -> []
x          -> [{ default: x }]
A aut B  y -> [{ default: x }, { condition: A, value: y }, { condition: B, value: y }]
A et B   z -> [{ default: x }, { condition: A, value: y }, { condition: B, value: y }, { condition: [A,B], value: z }]
A nisi C w -> [{ default: x }, { condition: A, value: w }, { condition: B, value: y }, { condition: [A,B], value: z }, { condition: [A,C], value: y }]

A aut B et C aut D et E nisi F nisi G y -> [
  { default: x },
  { condition: [A], value: y }, [A], []
  { condition: [B,C], value: y }, [B,C], []
  { condition: [D,E], value: y }, [D,E], [F,G]
  { condition: [D,E,F], value: x },
  { condition: [D,E,G], value: x },
]
*/

export function applyIncludes(
  includes: string[],
  excludes: string[],
  value: string[],
  variants: { value: string[]; condition: string[] }[]
) {
  const defaultValue: string[] =
    variants.find((item) => !item.condition.length)?.value ?? [];
  const result = [...variants];

  const findIndexByCondition = (condition: string[]) => {
    return result.findIndex(
      (item) =>
        item.condition.length === condition.length &&
        item.condition.every((conditionItem) =>
          condition.includes(conditionItem)
        )
    );
  };

  const pushResult = (condition: string[], value: string[]) => {
    const index = findIndexByCondition(condition);
    result[index === -1 ? result.length : index] = { condition, value };
  };

  if (!includes.length && excludes.length) {
    pushResult([], value);
    excludes.forEach((exclude) => pushResult([exclude], defaultValue ?? []));
  } else {
    pushResult(includes, value);

    if (excludes.length)
      excludes.forEach((exclude) =>
        pushResult([...includes, exclude], defaultValue)
      );
  }

  return result;
}

export function getIncludesExcludes(condition: string) {
  const conditions: { includes: string[]; excludes: string[] }[] = [];
  for (const autPart of condition.replaceAll("-", " ").split(/\baut\b/)) {
    let negation = false;
    const includes: string[] = [];
    const excludes: string[] = [];

    for (const etPart of autPart
      .split(/\b(et|nisi)\b/)
      .map((part) => part.trim())
      .filter(Boolean)) {
      if (etPart === "nisi") negation = true;
      if (etPart === "et" || etPart === "nisi") continue;

      const parts = etPart.split(" ", 2);

      let predicate;
      if (parts.length > 1 && subjects.includes(parts[0]!)) {
        predicate = parts[1]!;
      } else {
        predicate = parts.join(" ");
      }

      (negation ? excludes : includes).push(
        ...(predicates[predicate as keyof typeof predicates]
          ? predicates[predicate as keyof typeof predicates]
          : [predicate])
      );
    }

    conditions.push({ includes, excludes });
  }
  return conditions;
}

export function applyCondition(
  condition: string | null,
  value: string[],
  variants: { value: string[]; condition: string[] }[]
) {
  let result = [...variants];
  if (!condition) {
    result.push({ value, condition: [] });
  } else {
    const conditions = getIncludesExcludes(condition);

    for (const { includes, excludes } of conditions) {
      result = applyIncludes(includes, excludes, value, result);
    }
  }
  return result;
}

export function parseConditional(conditional: string) {
  const stopword = Object.keys(stopwords).find((stopword) =>
    conditional.startsWith(stopword)
  );
  if (stopword) conditional = conditional.slice(stopword.length).trim();

  const semper = conditional.endsWith("semper");
  if (semper) conditional = conditional.slice(0, -6).trim();

  const instruction = instructions.find((instruction) =>
    conditional.endsWith(instruction)
  );
  if (instruction)
    conditional = conditional.slice(0, -instruction.length).trim();

  const scope = scopes.find((scope) => conditional.endsWith(scope));
  if (scope) conditional = conditional.slice(0, -scope.length).trim();

  let strength = 0;
  strength += stopwords[stopword as keyof typeof stopwords] ?? 0;

  let backScope: "scope-null" | "scope-line" | "scope-chunk" | "scope-nest" =
    stopword && stopword in backscopedStopwords ? "scope-line" : "scope-null";
  if (scope?.includes("versuum") || scope?.includes("omittuntur"))
    backScope = "scope-nest";
  else if (scope?.includes("versus") || scope?.includes("omittitur"))
    backScope = "scope-chunk";
  else if (semper) backScope = "scope-null";

  let forwardScope: "scope-null" | "scope-line" | "scope-chunk" | "scope-nest";
  if (scope?.includes("omittitur") || scope?.includes("omittuntur")) {
    forwardScope = "scope-null";
  } else if (scope?.includes("dicuntur")) {
    forwardScope = backScope == "scope-chunk" ? "scope-chunk" : "scope-nest";
  } else {
    forwardScope =
      backScope == "scope-chunk" || backScope == "scope-nest"
        ? "scope-chunk"
        : "scope-line";
  }

  return {
    stopword,
    condition: conditional,
    scope,
    instruction,
    semper,
    strength,
    backScope,
    forwardScope,
  };
}
