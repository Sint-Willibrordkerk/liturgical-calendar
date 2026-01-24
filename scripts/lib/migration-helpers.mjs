import { STANDARD_ENDINGS } from "./config.mjs";

function migrateReference(reference) {
  if (!reference) return reference;
  reference = reference
    .replace("ex ", "@")
    .replace("vide ", "@")
    .replace(/;$/, "");
  if (!reference.includes("/"))
    reference = reference
      .replace(/^@(C\d)/, "@Commune/$1")
      .replace(/^@(Epi|Pasc|Quadp)/, "@Tempora/$1");
  if (reference.startsWith("@") && reference.includes("/")) return reference;
  throw new Error(`Reference "${reference}" is not valid`);
}

function migrateVerse(verse) {
  verse = verse.filter((line, index) => index === 0 || !line.startsWith("!"));

  if (verse[0].startsWith("!")) {
    if (verse.length !== 2) throw new Error(`Verse "${verse}" is not valid`);
    return {
      text: verse[1].replace(/^[vV]\. ?/, ""),
      references: verse[0].replace("!", ""),
    };
  } else {
    if (verse.length !== 1) throw new Error(`Verse "${verse}" is not valid`);
    return {
      text: verse[0].replace(/^[vV]\. ?/, ""),
    };
  }
}

function migrateOfficium(officium) {
  if (!officium.length === 1)
    throw new Error(`Officium "${officium}" is not valid`);
  return officium[0];
}

function migrateRank(rank) {
  const rankLine = rank[0];
  const parts = rankLine.split(";;");

  if (parts.length < 3 || parts.length > 4)
    throw new Error(`Rank "${rankLine}" is not valid`);

  const result = {
    ...(parts[0] ? { name: parts[0] } : {}),
    ...(parts[1] ? { rank: parts[1] } : {}),
    ...(parts[2] ? { numericRank: parts[2] } : {}),
    ...(parts[3] ? { references: migrateReference(parts[3]) } : {}),
  };
  return result;
}

function migrateRule(rule) {
  return Object.fromEntries(
    rule.map((line) => {
      if (line.startsWith("ex ") || line.startsWith("vide ")) {
        return ["reference", migrateReference(line)];
      } else if (line.includes("=")) {
        const [key, value] = line.split("=");
        return [key.trim(), value.trim()];
      } else {
        return [line.trim(), true];
      }
    })
  );
}

function migrateOration(oration) {
  if (oration.length === 1 && oration[0] === "!Oratio propria.") return null;

  oration = oration.filter((line) => !line.startsWith("!"));
  if (oration.length !== 2)
    throw new Error(`Oration "${oration}" is not valid`);
  return {
    text: oration[0],
    ending: STANDARD_ENDINGS[oration[1]],
  };
}

function migrateCommemoration(commemoration) {
  if (commemoration.length < 2 || commemoration.length > 3)
    throw new Error(`Commemoration "${commemoration}" is not valid`);
  return commemoration[1].startsWith("@")
    ? { reference: commemoration[1] }
    : migrateOration(commemoration.slice(1));
}

function migrateCommemorations(commemorations) {
  const result = [];
  while (commemorations.length) {
    const slice = commemorations[1].startsWith("@") ? 2 : 3;
    result.push(migrateCommemoration(commemorations.slice(0, slice)));
    commemorations = commemorations.slice(slice);
  }
  return result;
}

function migrateIntroitus(introitus) {
  const readVerse = () => {
    const slice = introitus[0].startsWith("!") ? 2 : 1;
    const result = migrateVerse(introitus.slice(0, slice));
    introitus = introitus.slice(slice);
    return result;
  };

  const antiphon = readVerse();
  const verse = readVerse();
  const gloriaPatri = introitus[0] === "&Gloria";
  if (gloriaPatri) introitus = introitus.slice(1);

  const secondAntiphon = introitus[0].replace(/^v\. ?/, "");
  if (secondAntiphon !== antiphon.text)
    throw new Error(
      `Introitus antiphon mismatch: \n ${secondAntiphon}\n ${antiphon.text}`
    );

  return { antiphon, verse, gloriaPatri };
}

function migrateGraduale(graduale) {
  const readVerse = () => {
    const slice = graduale[0].startsWith("!") ? 2 : 1;
    const result = migrateVerse(graduale.slice(0, slice));
    graduale = graduale.slice(slice);
    return result;
  };

  const antiphon = readVerse();
  const verse = readVerse();

  if (antiphon.references && !verse.references) {
    verse.references = antiphon.references.split(";").at(-1).trim();
    antiphon.references = antiphon.references.split(";").slice(0, -1).join(";");

    if (!verse.references.match("^[a-zA-Z]{1,3}"))
      verse.references = `${antiphon.references.split(" ")[0]} ${
        verse.references
      }`;
  }

  let alleluia;
  if (graduale[0] === "Allelúja, allelúja.") {
    graduale = graduale.slice(1);
    alleluia = readVerse();
  }
  return { antiphon, verse, alleluia };
}

export {
  migrateReference,
  migrateVerse,
  migrateOfficium,
  migrateRank,
  migrateRule,
  migrateOration,
  migrateCommemoration,
  migrateCommemorations,
  migrateIntroitus,
  migrateGraduale,
};
