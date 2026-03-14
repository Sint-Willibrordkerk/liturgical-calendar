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
  tridentina: "1570",
  "summorum pontificum": "1942",
  "196": "1962",
  "1960": "1962",
  innovata: "2020",
  innovatis: "2020",
  "^monastica": "monastica",
  "post septuagesimam": "septuagesimam",
  feriali: "feria",
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
  value: any,
  result: object[]
) {
  const defaultValue = result.find((item) => "default" in item)?.default;

  if (!includes.length && excludes.length) {
    result.push({ default: value });
    excludes.forEach((exclude) =>
      result.push({ condition: [exclude], value: defaultValue ?? [] })
    );
  }

  if (includes.length) {
    result.push({ condition: includes, value });
    if (excludes.length)
      excludes.forEach((exclude) =>
        result.push({
          condition: [...includes, exclude],
          value: defaultValue,
        })
      );
  }
}

export function applyCondition(
  condition: string | null,
  value: any,
  result: object[]
) {
  if (!condition) {
    result.push({ default: value });
  } else {
    for (const autPart of condition.replaceAll("-", " ").split(/\baut\b/)) {
      let negation = false;
      const includes: string[] = [];
      const excludes: string[] = [];

      for (const etPart of autPart
        .split(/\b(et|nisi)\b/)
        .map((part) => part.trim())) {
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
          predicates[predicate as keyof typeof predicates]
            ? predicates[predicate as keyof typeof predicates]
            : predicate
        );
      }

      applyIncludes(includes, excludes, value, result);
    }
  }
}
