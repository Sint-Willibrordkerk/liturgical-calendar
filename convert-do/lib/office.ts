/**
 * The proper texts of the Office, structured by what they are: antiphons, the
 * psalmody of an Hour, hymns, chapters, responsories and versicles.
 *
 * Each reader takes a section's lines as step 4 assembled them and returns the
 * text's shape, or `undefined` where the lines do not fit it — a mark missing,
 * the lines in another order, a reference step 4 could not resolve. Such a
 * section keeps its lines, and is filed whole when it is published.
 */
import { canonicalizeRef } from "./references.js";

export type OfficeKind =
  | "antiphon"
  | "psalmody"
  | "hymn"
  | "chapter"
  | "responsory"
  | "versicle";

const KINDS: Record<string, OfficeKind> = {
  invit: "antiphon",
  "ant-1": "antiphon",
  "ant-2": "antiphon",
  "ant-3": "antiphon",
  "ant-matutinum": "psalmody",
  "ant-laudes": "psalmody",
  "ant-vespera": "psalmody",
  "ant-vespera-3": "psalmody",
  "hymnus-matutinum": "hymn",
  "hymnus-laudes": "hymn",
  "hymnus-vespera": "hymn",
  "hymnus-vespera-3": "hymn",
  "capitulum-laudes": "chapter",
  "capitulum-tertia": "chapter",
  "capitulum-sexta": "chapter",
  "capitulum-nona": "chapter",
  "capitulum-vespera": "chapter",
  "lectio-prima": "chapter",
  "responsory-breve-tertia": "responsory",
  "responsory-breve-sexta": "responsory",
  "responsory-breve-nona": "responsory",
  "versum-1": "versicle",
  "versum-2": "versicle",
  "versum-3": "versicle",
  "versum-tertia": "versicle",
  "versum-sexta": "versicle",
  "versum-nona": "versicle",
  "nocturn-1-versum": "versicle",
  "nocturn-2-versum": "versicle",
  "nocturn-3-versum": "versicle",
};
for (let n = 1; n <= 8; n++) KINDS[`responsory${n}`] = "responsory";

/** The kind of Office text a section holds, or undefined where it is none of them. */
export function officeKindOf(key: string): OfficeKind | undefined {
  return KINDS[key];
}

/** A line carrying a mark no reader here takes: a reference, a direction, a rubric. */
const FOREIGN = /^\s*[@!$&#~[(]/;

const VERSUS = /^V\.\s*/;
const RESPONSUM = /^R\.\s*/;

/** The lines that say something: no blank ones. */
function sayingLines(lines: unknown): string[] | undefined {
  if (!Array.isArray(lines) || !lines.every((line) => typeof line === "string")) {
    return undefined;
  }
  return (lines as string[]).filter((line) => line.trim() !== "");
}

function antiphon(lines: string[]): { text: string } | undefined {
  if (lines.length !== 1 || FOREIGN.test(lines[0]!)) return undefined;
  const text = lines[0]!.replace(/;;.*$/, "").trim();
  return text === "" ? undefined : { text };
}

type Versicle = { versus: string; responsum: string };

function versicle(lines: string[]): Versicle | undefined {
  if (lines.length !== 2) return undefined;
  const [v, r] = lines as [string, string];
  if (!VERSUS.test(v) || !RESPONSUM.test(r)) return undefined;
  return { versus: v.replace(VERSUS, "").trim(), responsum: r.replace(RESPONSUM, "").trim() };
}

type PsalmodyEntry = { text?: string; psalmus?: string } | Versicle;

function psalmody(lines: string[]): { antiphonae: PsalmodyEntry[] } | undefined {
  const antiphonae: PsalmodyEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (VERSUS.test(line)) {
      const pair = versicle(lines.slice(i, i + 2));
      if (pair === undefined) return undefined;
      antiphonae.push(pair);
      i++;
      continue;
    }
    if (FOREIGN.test(line) || RESPONSUM.test(line) || line.trim() === "_") return undefined;
    const at = line.indexOf(";;");
    const text = (at === -1 ? line : line.slice(0, at)).trim();
    const psalmus = at === -1 ? "" : line.slice(at + 2).trim();
    if (text === "" && psalmus === "") return undefined;
    const entry: { text?: string; psalmus?: string } = {};
    if (text !== "") entry.text = text;
    if (psalmus !== "") entry.psalmus = psalmus;
    antiphonae.push(entry);
  }
  return antiphonae.length > 0 ? { antiphonae } : undefined;
}

/** A `{:…:}` label a hymn's line may open with, naming its melody. */
const LABEL = /^\{:[^}]*:\}/;

/** A direction to the reader, between `/:` and `:/`. */
const DIRECTION = /\/:[\s\S]*?:\//g;

function hymn(lines: string[]): { strophae: string[][]; doxologia?: string[] } | undefined {
  const stanzas: string[][] = [[]];
  for (const raw of lines) {
    const line = raw.replace(LABEL, "").replace(DIRECTION, "").trim();
    // A direction — the stanza that follows is said kneeling — is not sung.
    if (line === "" || line.startsWith("!")) continue;
    if (line === "_") {
      stanzas.push([]);
      continue;
    }
    if (FOREIGN.test(line)) return undefined;
    stanzas[stanzas.length - 1]!.push(line);
  }
  const kept = stanzas.filter((stanza) => stanza.length > 0);
  if (kept.length === 0) return undefined;
  kept[0]![0] = kept[0]![0]!.replace(/^v\.\s*/i, "");

  const strophae: string[][] = [];
  let doxologia: string[] | undefined;
  for (const stanza of kept) {
    if (stanza[0]!.startsWith("*")) {
      if (doxologia !== undefined) return undefined;
      doxologia = [stanza[0]!.replace(/^\*\s*/, ""), ...stanza.slice(1)];
    } else if (doxologia !== undefined) {
      // A stanza after the doxology is no part of this hymn.
      return undefined;
    } else {
      strophae.push(stanza);
    }
  }
  if (strophae.length === 0) return undefined;
  return doxologia === undefined ? { strophae } : { strophae, doxologia };
}

function chapter(lines: string[]): { ref?: string; text: string } | undefined {
  let ref: string | undefined;
  const body: string[] = [];
  for (const line of lines) {
    if (line.startsWith("!")) {
      if (ref !== undefined || body.length > 0) return undefined;
      ref = canonicalizeRef(line.slice(1).trim());
    } else if (line.startsWith("$")) {
      continue;
    } else if (FOREIGN.test(line)) {
      return undefined;
    } else {
      body.push(line);
    }
  }
  if (body.length === 0) return undefined;
  body[0] = body[0]!.replace(/^v\.\s*/i, "");
  const text = body.join("\n").trim();
  return ref === undefined || ref === "" ? { text } : { ref, text };
}

type Responsory = { responsum: string; versus: string; repetitio?: string; gloria?: string };

const RESPONSUM_BREVE = /^R\.br\.\s*/;
const GLORIA = /^&Gloria\.?$/;

function responsory(lines: string[]): Responsory | undefined {
  let i = 0;
  const next = () => lines[i];
  const first = next();
  if (first === undefined) return undefined;
  const breve = RESPONSUM_BREVE.test(first);
  if (!breve && !RESPONSUM.test(first)) return undefined;
  let responsum = first.replace(breve ? RESPONSUM_BREVE : RESPONSUM, "").trim();
  i++;
  if (next()?.startsWith("*")) {
    responsum = `${responsum} ${next()!.trim()}`;
    i++;
  }
  // The choir repeats a short responsory's response before the versicle.
  if (breve && next() !== undefined && RESPONSUM.test(next()!)) i++;

  if (next() === undefined || !VERSUS.test(next()!)) return undefined;
  const versus = next()!.replace(VERSUS, "").trim();
  i++;

  const out: Responsory = { responsum, versus };
  if (next() !== undefined && RESPONSUM.test(next()!)) {
    out.repetitio = next()!.replace(RESPONSUM, "").trim();
    i++;
  }
  if (next() !== undefined && GLORIA.test(next()!.trim())) {
    i++;
    if (next() === undefined || !RESPONSUM.test(next()!)) return undefined;
    out.gloria = next()!.replace(RESPONSUM, "").trim();
    i++;
  }
  return i === lines.length ? out : undefined;
}

const READERS: Record<OfficeKind, (lines: string[]) => unknown> = {
  antiphon,
  psalmody,
  hymn,
  chapter,
  responsory,
  versicle,
};

/**
 * A section's lines as the text of its kind, or undefined where they do not
 * fit it and are to be kept as they are.
 */
export function structureOffice(kind: OfficeKind, value: unknown): unknown | undefined {
  const lines = sayingLines(value);
  if (lines === undefined || lines.length === 0) return undefined;
  return READERS[kind](lines);
}
