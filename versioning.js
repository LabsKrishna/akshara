// versioning.js — Intelligent Delta Engine for Database X

const { cosine } = require("./kernel");

// Tokenize text into meaningful terms (words, numbers, symbols)
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[\w$.,%]+/g) || [];
}

// Spelled-out numbers that indicate a value change (e.g. "fifty dollars" → "sixty dollars")
const WORD_NUMBERS = new Set([
  "zero","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen",
  "twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety",
  "hundred","thousand","million","billion","half","quarter",
]);

// Check if a term looks numeric/value-like (prices, dates, quantities, or spelled-out numbers)
function isNumericTerm(term) {
  return /[\d$%,.]/.test(term) || WORD_NUMBERS.has(term);
}

// Compute added and removed terms between old and new text
function diffTerms(oldText, newText) {
  const oldTokens = new Set(tokenize(oldText));
  const newTokens = new Set(tokenize(newText));

  const added   = [...newTokens].filter(t => !oldTokens.has(t));
  const removed = [...oldTokens].filter(t => !newTokens.has(t));

  return { added, removed };
}

// Classify the type of change based on semantic shift + term changes
function detectDeltaType(semanticShift, addedTerms, removedTerms) {
  const allChanged       = [...addedTerms, ...removedTerms];
  const hasNumericChange = allChanged.some(isNumericTerm);
  const hasConceptChange = allChanged.some(t => !isNumericTerm(t));

  if (semanticShift < 0.05) {
    if (hasNumericChange && !hasConceptChange) return "update";     // $200 → $210
    if (hasConceptChange)                      return "correction"; // fixed a fact
    return "patch";                                                 // tiny wording fix
  }

  if (semanticShift < 0.15) {
    if (hasNumericChange) return "update";   // value + some context changed
    return "addition";                       // new concepts introduced
  }

  return "drift"; // significant meaning shift
}

// Generate a human-readable summary
function buildSummary(type, addedTerms, removedTerms, semanticShift) {
  const shift = (semanticShift * 100).toFixed(1);

  switch (type) {
    case "update":
      if (removedTerms.length && addedTerms.length) {
        return `Value changed: [${removedTerms.slice(0, 3).join(", ")}] → [${addedTerms.slice(0, 3).join(", ")}]`;
      }
      return `Numeric or value update detected (${shift}% semantic shift)`;

    case "correction":
      return `Factual correction: ${removedTerms.slice(0, 2).join(", ")} replaced with ${addedTerms.slice(0, 2).join(", ")}`;

    case "addition":
      return `New information added: ${addedTerms.slice(0, 3).join(", ")} (${shift}% semantic shift)`;

    case "drift":
      return `Significant meaning change detected (${shift}% semantic shift)`;

    case "patch":
      return "Minor wording adjustment, meaning unchanged";

    default:
      return "Content updated";
  }
}

// Contradiction detector — flags updates where a numeric/value term was both
// removed and added (e.g. "$50" → "$60", "3pm" → "4pm"). Only meaningful for
// low-shift updates and corrections — large semantic drifts are classified separately.
function detectContradiction(type, addedTerms, removedTerms) {
  if (type !== "update" && type !== "correction") return false;
  const removedNumeric = removedTerms.some(isNumericTerm);
  const addedNumeric   = addedTerms.some(isNumericTerm);
  return removedNumeric && addedNumeric;
}

// Main — builds a full intelligent delta between two versions
function buildDelta(oldText, oldVector, newText, newVector) {
  const similarity    = cosine(oldVector, newVector);
  const semanticShift = Number((1 - similarity).toFixed(4));

  const { added, removed } = diffTerms(oldText, newText);
  const type        = detectDeltaType(semanticShift, added, removed);
  const summary     = buildSummary(type, added, removed, semanticShift);
  const contradicts = detectContradiction(type, added, removed);

  return {
    type,
    semanticShift,
    addedTerms:   added.slice(0, 20),
    removedTerms: removed.slice(0, 20),
    summary,
    contradicts,
  };
}

module.exports = { buildDelta };
