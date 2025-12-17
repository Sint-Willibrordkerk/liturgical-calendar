import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { stringify } from "yaml";

const MISSAL_DIR =
  "C:/Users/ntvan/Projecten/divinum-officium/web/www/missa/Latin";
const COMMUNE_DIR =
  "C:/Users/ntvan/Projecten/divinum-officium/web/www/horas/Latin";
const OUTPUT_FILE = "assets/mass-propers/index.yml";

// Standard prayer endings from Prayers.txt
const STANDARD_ENDINGS = {
  "$Per Dominum": "per-dominum",
  // "Per Dóminum nostrum Jesum Christum, Fílium tuum: qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Qui tecum": "qui-tecum",
  // "Qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Qui vivis": "qui-vivis",
  // "Qui vivis et regnas cum Deo Patre in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Per eundem": "per-eundem",
  // "Per eundem Dóminum nostrum Jesum Christum, Fílium tuum: qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
};

function expandEnding(text) {
  if (!text) return text;
  for (const [key, value] of Object.entries(STANDARD_ENDINGS)) {
    if (text.includes(key)) {
      return text.replace(key, value);
    }
  }
  return text;
}

function parseReference(ref) {
  // Extract reference from lines like "!Ps 24:1-3" or "!Gal 4:1-7."
  if (!ref || !ref.startsWith("!")) return null;
  return ref.slice(1).replace(/\.$/, "").trim();
}

function extractBook(ref) {
  // Extract book name from reference (e.g., "Ps" from "Ps 97:3-4", "1 Cor" from "1 Cor 4:1")
  if (!ref) return null;
  // Match book name: optional number, word(s), followed by space and chapter/verse
  const match = ref.match(/^(\d*\s*[A-Za-z]+(?:\s+[A-Za-z]+)?)\s/);
  return match ? match[1].trim() : null;
}

function completeVerseReference(verseRef, antiphonRef) {
  // If verse reference is missing the book, use the book from antiphon reference
  if (!verseRef || !antiphonRef) return verseRef;

  const verseBook = extractBook(verseRef);
  if (verseBook) return verseRef; // Verse already has a book

  const antiphonBook = extractBook(antiphonRef);
  if (!antiphonBook) return verseRef; // Can't complete if antiphon has no book

  // Add the book to the verse reference
  return `${antiphonBook} ${verseRef.trim()}`;
}

function removeTrailingAlleluia(text) {
  // Remove trailing "Alleluja" or "Alleluia" (with or without punctuation)
  if (!text) return text;
  return text.replace(/\s*[Aa]llel[úu]?ja\.?\s*$/, "").trim();
}

function parseReferences(ref) {
  // Convert reference string to string or array
  // If it contains semicolons, split into array; otherwise return as string
  // Any reference without a book (not the first) takes the book from the previous reference
  if (!ref) return undefined;
  if (ref.includes(";")) {
    const parts = ref
      .split(";")
      .map((p) => p.trim())
      .filter((p) => p);

    // Complete references that are missing a book using the previous reference's book
    const completed = parts.map((part, index) => {
      if (index === 0) return part; // First reference stays as is

      const hasBook = extractBook(part);
      if (hasBook) return part; // Already has a book

      // Use book from previous reference
      const prevBook = extractBook(parts[index - 1]);
      if (prevBook) {
        return `${prevBook} ${part.trim()}`;
      }

      return part; // Can't complete, return as is
    });

    return completed;
  }
  return ref;
}

// Cache for parsed files to avoid re-parsing
const fileCache = new Map();

function resolveReference(ref, sectionName, visited = new Set()) {
  // References like "@Tempora/Nat30" or "@Sancti/08-03:Oratio"
  if (!ref || !ref.startsWith("@")) return null;

  const refPath = ref.slice(1);
  const [filePath, targetSection] = refPath.includes(":")
    ? refPath.split(":", 2)
    : [refPath, sectionName];

  // Prevent infinite recursion
  const cacheKey = `${filePath}:${targetSection}`;
  if (visited.has(cacheKey)) return null;
  visited.add(cacheKey);

  // Try to find the file in main directory first, then in obsolete/Commune
  let fullPath = join(MISSAL_DIR, filePath + ".txt");
  try {
    statSync(fullPath);
  } catch {
    // Try in obsolete/Commune directory
    fullPath = join(COMMUNE_DIR, filePath + ".txt");
    try {
      statSync(fullPath);
    } catch {
      return null; // File doesn't exist in either location
    }
  }

  // Parse the file (with caching)
  let lines;
  if (fileCache.has(fullPath)) {
    lines = fileCache.get(fullPath);
  } else {
    const content = readFileSync(fullPath, "utf-8");
    lines = content.split("\n").map((l) => l.trim());
    fileCache.set(fullPath, lines);
  }

  // Find the target section
  const sectionTag = `[${targetSection}]`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === sectionTag || lines[i].startsWith(sectionTag)) {
      return parseSection(sectionTag, lines, i).content;
    }
  }

  return null;
}

function parseSection(section, lines, i) {
  const content = [];
  let inSection = false;
  let currentLine = i + 1;

  while (currentLine < lines.length) {
    const line = lines[currentLine].trim();

    if (line.startsWith("[")) {
      break; // New section starts
    }

    if (line) {
      content.push(line);
    }

    currentLine++;
  }

  return { content, nextIndex: currentLine };
}

function parseIntroit(lines, i, context = "") {
  let { content, nextIndex } = parseSection("[Introitus]", lines, i);
  if (!content.length) {
    console.log(`[Introit] Skipped in ${context}: No content found`);
    return { introit: null, nextIndex };
  }

  // Check if the content is a reference
  if (content.length === 1 && content[0].startsWith("@")) {
    const resolved = resolveReference(content[0], "Introitus");
    if (resolved) {
      content = resolved;
    } else {
      console.log(
        `[Introit] Skipped in ${context}: Reference "${content[0]}" could not be resolved`
      );
      return { introit: null, nextIndex };
    }
  }

  let antiphonRef = null;
  let verseRef = null;
  let verseText = "";
  let antiphonText = "";
  let lastRef = null;
  let expectingAntiphon = true;

  for (let j = 0; j < content.length; j++) {
    const line = content[j];

    if (line.startsWith("!")) {
      lastRef = parseReference(line);
      // The first reference goes with the antiphon (if "v." follows), otherwise we need to track
    } else if (line.startsWith("v. ")) {
      // "v." prefix indicates the antiphon text
      if (lastRef && expectingAntiphon) {
        antiphonRef = lastRef;
        antiphonText = line.slice(3).trim();
        expectingAntiphon = false;
        lastRef = null;
      }
    } else if (line && !line.startsWith("V.")) {
      if (expectingAntiphon && lastRef) {
        // First text block is antiphon
        antiphonRef = lastRef;
        antiphonText = line;
        expectingAntiphon = false;
        lastRef = null;
      } else if (!expectingAntiphon && lastRef) {
        // Second text block is verse
        verseRef = lastRef;
        verseText = line;
        lastRef = null;
      } else if (!antiphonText && !lastRef) {
        // No reference, assume it's the antiphon if we don't have one yet
        antiphonText = line;
      } else if (!verseText && !lastRef && antiphonText) {
        // No reference, and we have antiphon, so this is the verse
        verseText = line;
      }
    }
  }

  if (!antiphonText) {
    console.log(`[Introit] Skipped in ${context}: No antiphon text found`);
    return { introit: null, nextIndex };
  }

  return {
    introit: {
      antiphon: {
        text: antiphonText,
        ...(antiphonRef ? { references: parseReferences(antiphonRef) } : {}),
      },
      verse: {
        text: verseText || "",
        ...(verseRef ? { references: parseReferences(verseRef) } : {}),
      },
    },
    nextIndex,
  };
}

function parseCollect(lines, i, context = "") {
  let { content, nextIndex } = parseSection("[Oratio]", lines, i);
  if (!content.length) {
    console.log(`[Collect] Skipped in ${context}: No content found`);
    return { collect: null, nextIndex };
  }

  // Check if the content is a reference
  if (content.length === 1 && content[0].startsWith("@")) {
    const resolved = resolveReference(content[0], "Oratio");
    if (resolved) {
      content = resolved;
    } else {
      console.log(
        `[Collect] Skipped in ${context}: Reference "${content[0]}" could not be resolved`
      );
      return { collect: null, nextIndex };
    }
  }

  const text = content.slice(0, -1).join(" ").trim();
  const endingLine = content[content.length - 1];
  const ending = expandEnding(endingLine);

  return {
    collect: {
      text,
      ending,
    },
    nextIndex,
  };
}

function parseEpistle(lines, i, context = "") {
  const { content, nextIndex } = parseSection("[Lectio]", lines, i);
  if (!content.length) {
    console.log(`[Epistle] Skipped in ${context}: No content found`);
    return { epistle: null, nextIndex };
  }

  let reference = null;
  let text = "";

  for (const line of content) {
    if (line.startsWith("!")) {
      reference = parseReference(line);
    } else if (line && !line.startsWith("!") && reference) {
      text += (text ? " " : "") + line;
    }
  }

  if (!reference || !text) {
    console.log(
      `[Epistle] Skipped in ${context}: Missing reference or text (ref: ${reference}, text: ${
        text ? "present" : "missing"
      })`
    );
    return { epistle: null, nextIndex };
  }

  return {
    epistle: {
      text: text.trim(),
      ...(reference ? { references: parseReferences(reference) } : {}),
    },
    nextIndex,
  };
}

function parseGradual(lines, i) {
  const { content, nextIndex } = parseSection("[Graduale]", lines, i);
  if (!content.length)
    return { gradual: null, alleluia: null, tract: null, nextIndex };

  // Parse gradual part (before alleluia)
  let gradualResponse = "";
  let gradualResponseRef = null;
  let gradualVerseText = "";
  let gradualVerseRef = null;

  // Parse alleluia part (after "Allelúja, allelúja.")
  let alleluiaText = "";
  let alleluiaVerseText = "";
  let alleluiaVerseRef = null;

  let tractVerses = [];
  let inTract = false;
  let foundAlleluiaMarker = false;
  let currentRef = null;

  for (let j = 0; j < content.length; j++) {
    const line = content[j];

    if (line === "_" || line === "!Tractus") {
      inTract = true;
      continue;
    }

    if (inTract) {
      if (line.startsWith("V.") || line.startsWith("v.")) {
        tractVerses.push(line.slice(2).trim());
      } else if (line && !line.startsWith("!")) {
        tractVerses.push(line);
      }
      continue;
    }

    // Check if this is the alleluia marker
    if (
      !foundAlleluiaMarker &&
      (line.toLowerCase().includes("allelúja, allelúja") ||
        line.toLowerCase() === "alleluia, alleluia." ||
        line.toLowerCase() === "allelúja, allelúja.")
    ) {
      foundAlleluiaMarker = true;
      alleluiaText = line;
      currentRef = null;
      continue;
    }

    if (line.startsWith("!")) {
      currentRef = parseReference(line);
      // If we've found the alleluia marker, this ref is for alleluia verse
      // Otherwise, check if the reference contains multiple parts (semicolon-separated)
      if (!foundAlleluiaMarker) {
        // Check if reference contains semicolons (multiple references in one line)
        if (currentRef && currentRef.includes(";")) {
          const parts = currentRef
            .split(";")
            .map((p) => p.trim())
            .filter((p) => p);
          if (parts.length >= 2) {
            // First part goes to antiphon, second part goes to verse
            if (!gradualResponseRef) {
              gradualResponseRef = parts[0];
            }
            if (!gradualVerseRef) {
              let versePart = parts[1];
              // Complete verse reference with book from antiphon if missing
              if (gradualResponseRef) {
                versePart = completeVerseReference(
                  versePart,
                  gradualResponseRef
                );
              }
              gradualVerseRef = versePart;
            }
            currentRef = null; // Already assigned both parts
          }
        } else {
          // Single reference - first ref line goes to response, second to verse
          if (!gradualResponseRef) {
            gradualResponseRef = currentRef;
          } else if (!gradualVerseRef) {
            // Complete verse reference with book from antiphon if missing
            let verseRef = currentRef;
            if (gradualResponseRef) {
              verseRef = completeVerseReference(verseRef, gradualResponseRef);
            }
            gradualVerseRef = verseRef;
          }
        }
      } else if (foundAlleluiaMarker && !alleluiaVerseRef) {
        alleluiaVerseRef = currentRef;
      }
    } else if (line.startsWith("V.") || line.startsWith("v.")) {
      const verseText = line.slice(2).trim();
      if (foundAlleluiaMarker) {
        alleluiaVerseText = verseText;
      } else {
        gradualVerseText = verseText;
      }
    } else if (line && !foundAlleluiaMarker) {
      // Before alleluia marker - gradual part
      if (!gradualResponse) {
        gradualResponse = line;
        // If we have a currentRef that hasn't been assigned yet, assign it to response
        if (currentRef && !gradualResponseRef) {
          gradualResponseRef = currentRef;
          currentRef = null;
        }
      } else if (!gradualVerseText) {
        gradualVerseText = line;
        // If we have a currentRef that hasn't been assigned yet, assign it to verse
        if (currentRef && !gradualVerseRef) {
          // Complete verse reference with book from antiphon if missing
          let verseRef = currentRef;
          if (gradualResponseRef) {
            verseRef = completeVerseReference(verseRef, gradualResponseRef);
          }
          gradualVerseRef = verseRef;
          currentRef = null;
        }
      }
    } else if (line && foundAlleluiaMarker) {
      // After alleluia marker - alleluia verse
      if (!alleluiaVerseText) {
        alleluiaVerseText = line;
      } else {
        // Append if there's more text
        alleluiaVerseText += " " + line;
      }
    }
  }

  const result = { gradual: null, alleluia: null, tract: null, nextIndex };

  if (inTract && tractVerses.length) {
    result.tract = { verses: tractVerses };
  } else {
    // Complete verse reference with book from antiphon if missing
    if (gradualVerseRef && gradualResponseRef) {
      gradualVerseRef = completeVerseReference(
        gradualVerseRef,
        gradualResponseRef
      );
    }

    // Include gradual if present
    if (gradualResponse) {
      result.gradual = {
        antiphon: {
          text: gradualResponse,
          ...(gradualResponseRef
            ? { references: parseReferences(gradualResponseRef) }
            : {}),
        },
        verse: {
          text: gradualVerseText || "",
          ...(gradualVerseRef
            ? { references: parseReferences(gradualVerseRef) }
            : {}),
        },
      };
    }

    // Include alleluia if present (can be present alongside gradual)
    if (foundAlleluiaMarker || alleluiaText || alleluiaVerseText) {
      const cleanedText = removeTrailingAlleluia(alleluiaVerseText || "");
      result.alleluia = {
        text: cleanedText,
        ...(alleluiaVerseRef
          ? { references: parseReferences(alleluiaVerseRef) }
          : {}),
      };
    }
  }

  return result;
}

function parseGospel(lines, i, context = "") {
  let { content, nextIndex } = parseSection("[Evangelium]", lines, i);
  if (!content.length) {
    console.log(`[Gospel] Skipped in ${context}: No content found`);
    return { gospel: null, nextIndex };
  }

  // Check if the content is a reference
  if (content.length === 1 && content[0].startsWith("@")) {
    const resolved = resolveReference(content[0], "Evangelium");
    if (resolved) {
      content = resolved;
    } else {
      console.log(
        `[Gospel] Skipped in ${context}: Reference "${content[0]}" could not be resolved`
      );
      return { gospel: null, nextIndex };
    }
  }

  let reference = null;
  let text = "";

  for (const line of content) {
    if (line.startsWith("!")) {
      reference = parseReference(line);
    } else if (line && !line.startsWith("!") && reference) {
      text += (text ? " " : "") + line;
    }
  }

  if (!reference || !text) {
    console.log(
      `[Gospel] Skipped in ${context}: Missing reference or text (ref: ${reference}, text: ${
        text ? "present" : "missing"
      })`
    );
    return { gospel: null, nextIndex };
  }

  return {
    gospel: {
      text: text.trim(),
      ...(reference ? { references: parseReferences(reference) } : {}),
    },
    nextIndex,
  };
}

function parseOffertory(lines, i, context = "") {
  let { content, nextIndex } = parseSection("[Offertorium]", lines, i);
  if (!content.length) {
    console.log(`[Offertory] Skipped in ${context}: No content found`);
    return { offertory: null, nextIndex };
  }

  // Check if the content is a reference
  if (content.length === 1 && content[0].startsWith("@")) {
    const resolved = resolveReference(content[0], "Offertorium");
    if (resolved) {
      content = resolved;
    } else {
      console.log(
        `[Offertory] Skipped in ${context}: Reference "${content[0]}" could not be resolved`
      );
      return { offertory: null, nextIndex };
    }
  }

  let ref = null;
  let text = "";

  for (const line of content) {
    if (line.startsWith("!")) {
      ref = parseReference(line);
    } else if (line && !line.startsWith("!")) {
      text = line.trim();
    }
  }

  if (!text) {
    console.log(`[Offertory] Skipped in ${context}: No text found`);
    return { offertory: null, nextIndex };
  }

  return {
    offertory: {
      text,
      ...(ref ? { references: parseReferences(ref) } : {}),
    },
    nextIndex,
  };
}

function parseSecret(lines, i, context = "") {
  let { content, nextIndex } = parseSection("[Secreta]", lines, i);
  if (!content.length) {
    console.log(`[Secret] Skipped in ${context}: No content found`);
    return { secret: null, nextIndex };
  }

  // Check if the content is a reference
  if (content.length === 1 && content[0].startsWith("@")) {
    const resolved = resolveReference(content[0], "Secreta");
    if (resolved) {
      content = resolved;
    } else {
      console.log(
        `[Secret] Skipped in ${context}: Reference "${content[0]}" could not be resolved`
      );
      return { secret: null, nextIndex };
    }
  }

  // Handle case where there's only one line (it's the ending)
  const text = content.length > 1 ? content.slice(0, -1).join(" ").trim() : "";
  const endingLine = content[content.length - 1];
  const ending = expandEnding(endingLine);

  // Only return secret if we have text
  if (!text) {
    console.log(
      `[Secret] Skipped in ${context}: No text found (content: ${JSON.stringify(
        content
      )})`
    );
    return { secret: null, nextIndex };
  }

  return {
    secret: {
      text,
      ending,
    },
    nextIndex,
  };
}

function parseCommunion(lines, i, context = "") {
  let { content, nextIndex } = parseSection("[Communio]", lines, i);
  if (!content.length) {
    console.log(`[Communion] Skipped in ${context}: No content found`);
    return { communion: null, nextIndex };
  }

  // Check if the content is a reference
  if (content.length === 1 && content[0].startsWith("@")) {
    const resolved = resolveReference(content[0], "Communio");
    if (resolved) {
      content = resolved;
    } else {
      console.log(
        `[Communion] Skipped in ${context}: Reference "${content[0]}" could not be resolved`
      );
      return { communion: null, nextIndex };
    }
  }

  let ref = null;
  let text = "";

  for (const line of content) {
    if (line.startsWith("!")) {
      ref = parseReference(line);
    } else if (line && !line.startsWith("!")) {
      text = line.trim();
    }
  }

  if (!text) {
    console.log(`[Communion] Skipped in ${context}: No text found`);
    return { communion: null, nextIndex };
  }

  return {
    communion: {
      text,
      ...(ref ? { references: parseReferences(ref) } : {}),
    },
    nextIndex,
  };
}

function parsePostcommunion(lines, i, context = "") {
  let { content, nextIndex } = parseSection("[Postcommunio]", lines, i);
  if (!content.length) {
    console.log(`[Postcommunion] Skipped in ${context}: No content found`);
    return { postcommunion: null, nextIndex };
  }

  // Check if the content is a reference
  if (content.length === 1 && content[0].startsWith("@")) {
    const resolved = resolveReference(content[0], "Postcommunio");
    if (resolved) {
      content = resolved;
    } else {
      console.log(
        `[Postcommunion] Skipped in ${context}: Reference "${content[0]}" could not be resolved`
      );
      return { postcommunion: null, nextIndex };
    }
  }

  const text = content.slice(0, -1).join(" ").trim();
  const endingLine = content[content.length - 1];
  const ending = expandEnding(endingLine);

  return {
    postcommunion: {
      text,
      ending,
    },
    nextIndex,
  };
}

function parseMassFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").map((l) => l.trim());
  const context = filePath.split(/[/\\]/).pop() || filePath; // Use filename as context

  const mass = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line === "[Introitus]") {
      const result = parseIntroit(lines, i, context);
      if (result.introit) mass.introit = result.introit;
      i = result.nextIndex;
    } else if (line === "[Oratio]") {
      const result = parseCollect(lines, i, context);
      if (result.collect) mass.collect = result.collect;
      i = result.nextIndex;
    } else if (line === "[Lectio]") {
      const result = parseEpistle(lines, i, context);
      if (result.epistle) mass.epistle = result.epistle;
      i = result.nextIndex;
    } else if (line === "[Graduale]" || line === "[GradualeP]") {
      const result = parseGradual(lines, i);
      if (result.gradual) mass.gradual = result.gradual;
      if (result.alleluia) mass.alleluia = result.alleluia;
      if (result.tract) mass.tract = result.tract;
      i = result.nextIndex;
    } else if (line === "[Tractus]") {
      const { content, nextIndex } = parseSection("[Tractus]", lines, i);
      const verses = content
        .filter((l) => l && (l.startsWith("V.") || l.startsWith("v.")))
        .map((l) => l.slice(2).trim());
      if (verses.length) mass.tract = { verses };
      i = nextIndex;
    } else if (line === "[Evangelium]") {
      const result = parseGospel(lines, i, context);
      if (result.gospel) mass.gospel = result.gospel;
      i = result.nextIndex;
    } else if (line === "[Offertorium]" || line === "[OffertoriumP]") {
      const result = parseOffertory(lines, i, context);
      if (result.offertory) mass.offertory = result.offertory;
      i = result.nextIndex;
    } else if (line === "[Secreta]") {
      const result = parseSecret(lines, i, context);
      if (result.secret) mass.secret = result.secret;
      i = result.nextIndex;
    } else if (line === "[Communio]") {
      const result = parseCommunion(lines, i, context);
      if (result.communion) mass.communion = result.communion;
      i = result.nextIndex;
    } else if (line === "[Postcommunio]") {
      const result = parsePostcommunion(lines, i, context);
      if (result.postcommunion) mass.postcommunion = result.postcommunion;
      i = result.nextIndex;
    } else {
      i++;
    }
  }

  return Object.keys(mass).length > 0 ? mass : null;
}

function getVideReference(filePath) {
  // Check if [Rank] contains "vide ###" reference
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "[Rank]") {
      const rankLine = lines[i + 1]?.trim();
      if (rankLine && rankLine.toLowerCase().startsWith("vide")) {
        // Extract the reference after "vide"
        const match = rankLine.match(/^vide\s+(.+)$/i);
        if (match) {
          return match[1].trim();
        }
      }
    }
  }

  return null;
}

function getTitleFromFile(filePath, fileName) {
  // Try to get title from [Officium] section
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "[Officium]") {
      const title = lines[i + 1]?.trim();
      if (title) return title;
    }
    if (lines[i].trim() === "[Rank]") {
      const rankLine = lines[i + 1]?.trim();
      if (rankLine) {
        // Skip if it's a "vide" reference
        if (rankLine.toLowerCase().startsWith("vide")) {
          continue;
        }
        const parts = rankLine.split(";;");
        if (parts[0]) return parts[0];
      }
    }
  }

  return null;
}

function getAllMassFiles(dir) {
  const files = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    if (statSync(fullPath).isDirectory()) {
      files.push(...getAllMassFiles(fullPath));
    } else if (item.endsWith(".txt")) {
      files.push({
        path: fullPath,
        name: item,
        dir: item.replace(/[^/]*$/, ""),
      });
    }
  }

  return files;
}

// Mass title renaming mapping
const MASS_RENAMES = {
  "In Circumcisione Domini": "In Octava Nativitatis Domini",
};

function renameMassTitle(title) {
  return MASS_RENAMES[title] || title;
}

// Main execution
const allFiles = getAllMassFiles(MISSAL_DIR);
// Filter to only process January 1st files (01-01 in Sancti directory)
const jan1Files = allFiles.filter(
  (file) => file.name.startsWith("01-01") && file.path.includes("Sancti")
);
// Filter for C10 files (Sanctæ Mariæ Sabbato) in COMMUNE_DIR
const communeFiles = getAllMassFiles(COMMUNE_DIR);
const c10Files = communeFiles.filter(
  (file) => file.name.startsWith("C10") || file.path.includes("C10")
);
const massPropers = {};

console.log(`Processing ${jan1Files.length} files (January 1st only)...`);

for (const file of jan1Files) {
  try {
    // Check if this file references another file via "vide"
    const videRef = getVideReference(file.path);
    let mass;

    if (videRef) {
      // Use the referenced file as base
      // Try to find the referenced file in MISSAL_DIR first
      let baseFilePath = join(MISSAL_DIR, videRef + ".txt");
      try {
        statSync(baseFilePath);
      } catch {
        // Try in COMMUNE_DIR if not found in MISSAL_DIR
        baseFilePath = join(COMMUNE_DIR, videRef + ".txt");
        try {
          statSync(baseFilePath);
        } catch {
          console.error(
            `[Jan1] Could not find base file "${videRef}" for ${file.name}`
          );
          continue;
        }
      }

      // Parse the base file and merge with current file
      const baseMass = parseMassFile(baseFilePath);
      const currentMass = parseMassFile(file.path);

      // Merge: current file overrides base file
      mass = { ...baseMass, ...currentMass };
    } else {
      // No vide reference, use file as-is
      mass = parseMassFile(file.path);
    }

    if (mass) {
      const title = getTitleFromFile(file.path, file.name);
      if (title) {
        const renamedTitle = renameMassTitle(title);
        if (!massPropers[renamedTitle]) {
          massPropers[renamedTitle] = [];
        }
        massPropers[renamedTitle].push(mass);
      }
    }
  } catch (error) {
    console.error(`Error processing ${file.path}:`, error.message);
  }
}

console.log(
  `Processing ${c10Files.length} files (C10 - Sanctæ Mariæ Sabbato)...`
);

for (const file of c10Files) {
  try {
    const title = getTitleFromFile(file.path, file.name);
    // Only process if title contains "Sanctæ Mariæ Sabbato" or similar
    // Check if this file references another file via "vide"
    const videRef = getVideReference(file.path);
    let mass;

    if (videRef) {
      // Use the referenced file as base
      // Try to find the referenced file in COMMUNE_DIR
      let baseFilePath = join(COMMUNE_DIR, videRef + ".txt");
      try {
        statSync(baseFilePath);
      } catch {
        // Try in MISSAL_DIR if not found in COMMUNE_DIR
        baseFilePath = join(MISSAL_DIR, videRef + ".txt");
        try {
          statSync(baseFilePath);
        } catch {
          console.error(
            `[C10] Could not find base file "${videRef}" for ${file.name}`
          );
          continue;
        }
      }

      // Parse the base file and merge with current file
      const baseMass = parseMassFile(baseFilePath);
      const currentMass = parseMassFile(file.path);

      // Merge: current file overrides base file
      mass = { ...baseMass, ...currentMass };
    } else {
      // No vide reference, use file as-is
      mass = parseMassFile(file.path);
    }

    if (mass) {
      const renamedTitle = renameMassTitle(title);
      // Create unique key for each file by combining title with filename
      // Remove .txt extension and use as part of the key
      const fileNameBase = file.name.replace(/\.txt$/, "");
      const uniqueKey = `${renamedTitle} (${fileNameBase})`;

      // Each file gets its own entry
      massPropers[uniqueKey] = mass;
    }
  } catch (error) {
    console.error(`Error processing ${file.path}:`, error.message);
  }
}

// Convert arrays with single items to single objects (for maybeArray compatibility)
const finalPropers = {};
for (const [title, masses] of Object.entries(massPropers)) {
  finalPropers[title] = masses.length === 1 ? masses[0] : masses;
}

const yaml = stringify(finalPropers, {
  lineWidth: 0,
  quotingType: '"',
  defaultStringType: "QUOTE_DOUBLE",
  defaultKeyType: "PLAIN",
});

writeFileSync(
  OUTPUT_FILE,
  `# Mass Propers Data
# Maps liturgical day titles to their mass proper parts
# Each proper part includes both references and full text
# Auto-generated from divinum-officium missa/Latin files

${yaml}`,
  "utf-8"
);

console.log(
  `Generated ${OUTPUT_FILE} with ${Object.keys(finalPropers).length} entries`
);
