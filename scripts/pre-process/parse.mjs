const PREAMBLE = "__preamble";
const STOPWORD_WEIGHTS = {
  sed: 1,
  vero: 1,
  atque: 2,
  attamen: 3,
  si: 0,
  deinde: 1,
};
const STOPWORDS_REGEX_STR = Object.keys(STOPWORD_WEIGHTS).join("|");
const SCOPE_REGEX_STR = [
  "(?:\\bloco\\s+(?:hu[ij]us\\s+versus|horum\\s+versuum)\\b)?",
  "\\s*",
  "(?:",
  "\\b",
  "(?:",
  "(?:dicitur|dicuntur)(?:s+semper)?",
  "|",
  "(?:hic\\s+versus\\s+)?omittitur",
  "|",
  "(?:hoc\\s+versus\\s+)?omittitur",
  "|",
  "(?:h[ae]c\\s+versus\\s+)?omittuntur",
  "|",
  "(?:hi\\s+versus\\s+)?omittuntur",
  ")",
  "\\b",
  ")?",
].join("");

/** Subject resolvers for 1962 rubrics. Pass as `subjects` in args when calling parseFile / vero. */
export const SUBJECTS_1962 = {
  rubrica: () => "1962",
  rubricis: () => "1962",
  tempore: () => "",
  missa: () => "",
  communi: () => "",
  feria: () => "",
  commune: () => "",
  votiva: () => "",
  officio: () => "",
  ad: () => "",
  mense: () => "",
  tonus: () => "",
  toni: () => "",
};

const predicates = {
  tridentina: (v) => /Trident/.test(String(v)),
  monastica: (v) => /Monastic/.test(String(v)),
};

/*
 * 1: Section key (e.g. "Commemoratio")
 */
const sectionRegex = /\s*\[([\p{L}\p{N}_ #,:-]+)\]/iu;
/*
 * 1: Stopwords (e.g. "sed", "vero", "atque", "attamen")
 * 2: Condition (e.g. "rubrica tridentina")
 * 3: Scope (e.g. "versuum", "omittuntur")
 */
const conditionalRegex = new RegExp(
  `\\(\\s*(${STOPWORDS_REGEX_STR}\\b)*(.*?)(${SCOPE_REGEX_STR})?\\s*\\)`
);
/*
 * 1: Section key (e.g. "Commemoratio")
 * 2: Stopwords (e.g. "sed", "vero", "atque", "attamen")
 * 3: Condition (e.g. "rubrica tridentina")
 * 4: Scope (e.g. "versuum", "omittuntur")
 */
const sectionLineRegex = new RegExp(
  `(?:^|\\r?\\n)\\s*(\\[[\\p{L}\\p{N}_ #,:-]+\\](?:\\s*\\(\\s*(?:${STOPWORDS_REGEX_STR}\\b)*.*?(?:${SCOPE_REGEX_STR})?\\s*\\))?)`,
  "iu"
);

const sectionLineRegex2 = /\[(.*?)\](?:\s*\((.*?)\))?/iu;

export function parseContent(content, acceptableRubrics) {
  const sections = content
    .split(sectionLineRegex)
    .map((line) => line.trim())
    .filter((line) => line.length);

  let i = 0;
  const result = {};
  if (sections.length % 2 === 1) {
    i++;
    result[PREAMBLE] = sections[0];
  }
  for (; i < sections.length; i += 2) {
    const [, key, condition] = sections[i].match(sectionLineRegex2);

    if (!condition || vero(condition, acceptableRubrics))
      result[key] = sections[i + 1];
  }

  for (const key in result) {
    result[key] = result[key]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length);
    // processConditionalLines(sections[key], acceptableRubrics).join("\n");
  }
  return result;
}

function processConditionalLines(lines, acceptableRubrics) {
  const output = [];
  const COND_NOT_YET_AFFIRMATIVE = 0;
  const COND_AFFIRMATIVE = 1;
  const COND_DUMMY_FRAME = 2;
  const conditionalStack = [[COND_AFFIRMATIVE, SCOPE_NEST]];
  const conditionalOffsets = [-1];
  const blanklineRegex = new RegExp("^\\s*_?\\s*$");

  for (const line of lines) {
    const match = line.match(
      new RegExp(`^\\s*${conditionalRegex.source}\\s*(.*)$`, "o")
    );
    if (match) {
      const { strength, result, backscope, forwardscope } = parseConditional(
        match[1] || "",
        match[2],
        match[3],
        acceptableRubrics
      );

      line = match[4];

      // If the parent conditional is not affirmative, then the new one
      // must break out of the nest, as it were.
      if (
        conditionalStack[-1][0] === COND_AFFIRMATIVE ||
        strength >= conditionalOffsets.length
      ) {
        if (strength >= conditionalOffsets.length) {
          conditionalStack = [];
        } else if (
          strength >=
          conditionalOffsets.length - conditionalStack.length
        ) {
          conditionalStack = conditionalStack.slice(
            0,
            conditionalOffsets.length - strength - 1
          );
        }

        if (result) {
          // Find the nearest insurmountable fence.
          const fence =
            conditionalOffsets.length >= strength
              ? conditionalOffsets[strength]
              : -1;

          // Handle the backward scope.
          if (backscope === SCOPE_LINE) {
            // Remove preceding line.
            if (output.length > fence) output.pop();
          } else if (backscope === SCOPE_CHUNK) {
            // Remove preceding consecutive non-whitespace lines.
            while (
              output.length > fence &&
              !output.at(-1).match(blanklineRegex)
            )
              output.pop();

            // Remove any whitespace lines.
            while (output.length > fence && output.at(-1).match(blanklineRegex))
              output.pop();
          } else if (backscope === SCOPE_NEST) {
            // Truncate output at the point to which we have to backtrack.
            output = output.slice(0, fence);
          }
        }

        // Having backtracked, null forward scope now behaves like a
        // satisfied conditional with nesting forward scope.
        if (forwardscope === SCOPE_NULL) {
          forwardscope = SCOPE_NEST;
          result = 1;
        }

        if (result) {
          // Remember where we encountered this conditional.
          Array.from(
            { length: strength },
            (_, i) => (conditionalOffsets[i] = output.length)
          );
        }

        // Push dummy frame(s) onto the conditional stack to bring it
        // into sync with the strength.
        while (
          strength <
          conditionalOffsets.length - conditionalStack.length - 1
        )
          conditionalStack.push([COND_DUMMY_FRAME, forwardscope]);

        // Push the new conditional frame onto the stack.
        conditionalStack.push([
          result ? COND_AFFIRMATIVE : COND_NOT_YET_AFFIRMATIVE,
          forwardscope,
        ]);
      }

      // Parse anything left over.
      if (!line) continue;
    }

    // Handle escaped lines.
    line = line.replace(/^~/, "");

    // Add line to output array if it's not in a failed conditional block.
    if (conditionalStack.at(-1)[0] === COND_AFFIRMATIVE) output.push(line);

    // Check to see whether we'll fall off the end of the current scope
    // after this line.
    while (
      conditionalStack.at(-1)[1] === SCOPE_LINE ||
      (conditionalStack.at(-1)[1] === SCOPE_CHUNK && line.match(blanklineRegex))
    ) {
      do {
        conditionalStack.pop();
      } while (
        conditionalStack.length &&
        conditionalStack.at(-1)[0] === COND_DUMMY_FRAME
      );

      // If we've emptied the conditional stack, push an always-true,
      // unbounded frame to allow uniformity in testing.
      if (conditionalStack.length === 0) {
        conditionalStack.push([COND_AFFIRMATIVE, SCOPE_NEST]);
      }
    }
  }
  return output;
}

function parseConditional(stopwords, condition, scope, acceptableRubrics) {
  let strength, result, backscope, forwardscope;
  strength = 0;
  for (const word of stopwords.split(/\s+/)) strength += STOPWORD_WEIGHTS[word];
  result = vero(condition, acceptableRubrics);

  // The regexes we use to test here are considerably more general
  // than is allowed by the specification, but we're working on the
  // assumption that the input was first matched against the regex
  // returned by &conditional_regex, which is rather stricter.
  // Do we have a stopword that gives us implicit backscope?
  let implicit_backscope = 0;
  for (const word of stopwords.split(/\s+/)) {
    if (BACKSCOPED_STOPWORDS.includes(word)) {
      implicit_backscope = 1;
      break;
    }
  }

  backscope = scope.match(/versuum|omittuntur/i)
    ? SCOPE_NEST
    : scope.match(/versus|omittitur/i)
    ? SCOPE_CHUNK
    : !scope.match(/semper/i) && implicit_backscope === 1
    ? SCOPE_LINE
    : SCOPE_NULL;
  forwardscope = scope.match(/omittitur|omittuntur/i)
    ? SCOPE_NULL
    : scope.match(/dicuntur/i)
    ? backscope == SCOPE_CHUNK
      ? SCOPE_CHUNK
      : SCOPE_NEST
    : backscope == SCOPE_CHUNK || backscope == SCOPE_NEST
    ? SCOPE_CHUNK
    : SCOPE_LINE;
  return { strength, result, backscope, forwardscope };
}

export function vero(condition, acceptableRubrics) {
  condition = condition.trim();
  if (!condition) return true;

  AUTEM: for (const autPart of condition.split(/\baut\b/)) {
    let negation = false;

    for (let etPart of autPart.split(/\b(et|nisi)\b/)) {
      if (etPart === "nisi") negation = true;
      if (etPart.match(/et|nisi/)) continue;

      etPart = etPart.trim().replace(/\s+/g, " "); // Normalise whitespace.
      const result = new RegExp(acceptableRubrics, "i").test(etPart);

      if (result !== negation) continue AUTEM;
    }

    return true;
  }
  return false;
}
