/**
 * Tiny Swedish-vs-English guesser for short product texts. No dependencies, no network.
 * Used when a store page does not say which language its text is in, and to notice when a
 * translation came back in the wrong language. Returns null when the text has no clear signal
 * (brand names, numbers, a word or two), so callers can fall back to a declared language.
 */
import type { Locale } from "./i18n";

// Function words that almost never occur in the other language. "i", "en", "den", "man", "under",
// "hand", "barn" and the like are left out because they are words in both languages.
const SV_WORDS = new Set([
  "och", "att", "är", "för", "med", "på", "det", "som", "av", "till", "inte", "ett", "har", "kan",
  "från", "eller", "också", "när", "vår", "våra", "din", "ditt", "dina", "er", "era", "här", "där",
  "mjuk", "mjukt", "mjuka", "passar", "perfekt", "finns", "gjord", "gjort", "tillverkad", "tillverkat",
  "storlek", "färg", "färger", "material", "bomull", "ekologisk", "ekologiskt", "bebis", "bebisen",
  "barnet", "barnets", "månader", "år", "kr", "mycket", "lätt", "lätta", "både", "många", "alla",
  "denna", "detta", "dessa", "vilket", "vilken", "samt", "utan", "över", "efter", "hos", "sig",
]);

const EN_WORDS = new Set([
  "the", "and", "is", "are", "for", "with", "of", "to", "this", "that", "your", "it", "its", "be",
  "from", "or", "by", "at", "a", "an", "has", "have", "can", "will", "made", "soft", "fits", "perfect",
  "size", "colour", "color", "colours", "colors", "cotton", "organic", "baby", "babies", "months",
  "years", "very", "easy", "both", "many", "all", "these", "those", "which", "without", "over", "after",
  "our", "you", "we", "they", "their", "when", "while", "also", "not", "into", "than", "more", "most",
]);

const SV_LETTERS = /[åäö]/i;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** "sv" or "en" when the text is clearly one or the other; null when it could be either. */
export function guessTextLang(text: string | null | undefined): Locale | null {
  if (!text) return null;
  const ws = words(text);
  if (ws.length === 0) return null;
  let sv = 0;
  let en = 0;
  for (const w of ws) {
    if (SV_WORDS.has(w)) sv += 1;
    if (EN_WORDS.has(w)) en += 1;
    // å/ä/ö are a strong Swedish signal, but one in a brand name ("Björn") is not enough on its own.
    if (SV_LETTERS.test(w)) sv += 1;
  }
  if (sv === en) return null;
  const winner = sv > en ? sv : en;
  const loser = sv > en ? en : sv;
  // Need at least two hits, and a clear margin: both languages share loanwords and brand names.
  if (winner < 2 || winner < loser * 2) return null;
  return sv > en ? "sv" : "en";
}
