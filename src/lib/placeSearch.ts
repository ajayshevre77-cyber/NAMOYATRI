/**
 * Place search without the network, shared by the Home and Explore search
 * boxes, the map's sample-site matches, and the server's one alternative
 * Nominatim spelling (`alternativeSearchQuery`, used by server/geo.ts).
 *
 * Deterministic, no fuzzy scoring. A place matches only when every word of
 * the query is found in it, after:
 * - case, accents and punctuation are ignored;
 * - common transliteration differences are folded: w/v, ee/i, oo/u, a final
 *   "a" (Kushavarta = Kushavart), Tryambak/Trimbak, Nasik/Nashik, and in
 *   Devanagari ळ/ल, न्द/ंद (half nasal = anusvara), nukta, long/short i and u;
 * - equivalent words count as one (TERM_EQUIVALENTS: Mandir = Temple, …);
 * - joined and split words both match (Ramkund = Ram Kund);
 * - a word of 3 or more letters may be the start of a longer word ("Kush"
 *   finds Kushavarta).
 * Hindi and Marathi names are always searched, whatever the app language.
 *
 * PLACE_ALIASES only adds spellings of places that already exist: never a
 * place, coordinates, hours or ratings.
 */
import type { Place, PlaceCategory } from '../types';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Words that mean the same thing in a place name. The first entry is the one
 * each group is stored as. Folding (above) already covers a final "a" and
 * ee/i, so "Tirtha" and "Teerth" need no entry of their own.
 */
export const TERM_EQUIVALENTS: readonly (readonly string[])[] = [
  ['mandir', 'temple', 'मंदिर', 'देवालय'],
  ['kund', 'कुंड'],
  ['ghat', 'घाट'],
  ['tirth', 'तीर्थ'],
  ['gufa', 'gupha', 'cave', 'गुफा'],
  ['nashik', 'नाशिक', 'नासिक'],
  ['trimbak', 'त्र्यंबक'],
  ['panchavati', 'panchvati', 'पंचवटी'],
  ['jyotirling', 'ज्योतिर्लिंग'],
];

/** One important local place and the ways people write it. */
export interface PlaceAlias {
  /** How the place is usually written in English. */
  name: string;
  /** Other spellings people type, in English, Hindi and Marathi. */
  spellings: readonly string[];
  /** Sample sites in `kumbhData.ts` that are this place. */
  samplePlaceIds: readonly string[];
  /**
   * The spelling Nominatim finds it under, checked against the live service
   * on 2026-10-20. null when OpenStreetMap has no such place, so a search
   * that finds nothing is not retried.
   */
  osmQuery: string | null;
}

export const PLACE_ALIASES: readonly PlaceAlias[] = [
  {
    name: 'Ramkund',
    spellings: ['Ram Kund', 'Ramkund Ghat', 'रामकुंड', 'राम कुंड'],
    samplePlaceIds: ['ramkund_panchavati'],
    osmQuery: 'Ram Kund',
  },
  {
    name: 'Kalaram Mandir',
    spellings: ['Kalaram', 'Kala Ram Mandir', 'काळाराम मंदिर', 'कालाराम मंदिर', 'काळाराम'],
    samplePlaceIds: ['kalaram_mandir'],
    osmQuery: 'Kalaram Mandir',
  },
  {
    // OpenStreetMap: "Kushawart Tirth" and "Old Kushawart Tirtha".
    name: 'Kushavarta Kund',
    spellings: ['Kushavarta', 'Kushawart', 'Kushavarta Tirth', 'Kusavarta', 'कुशावर्त', 'कुशावर्त कुंड', 'कुशावर्त तीर्थ'],
    samplePlaceIds: ['kushavarta_kund'],
    osmQuery: 'Kushawart',
  },
  {
    // OpenStreetMap: "Trimbakeshwar Temple" and "Shri Tryambakeshwar Jyotirling Mandir".
    name: 'Trimbakeshwar Temple',
    spellings: ['Trimbakeshwar Jyotirlinga', 'त्र्यंबकेश्वर मंदिर', 'त्र्यंबकेश्वर ज्योतिर्लिंग'],
    samplePlaceIds: ['trimbakeshwar_mandir'],
    osmQuery: 'Trimbakeshwar Temple',
  },
  {
    name: 'Tapovan',
    spellings: ['Tapoban', 'तपोवन'],
    samplePlaceIds: ['tapovan_sacred_groves'],
    osmQuery: 'Tapovan',
  },
  {
    name: 'Panchavati',
    spellings: ['पंचवटी'],
    samplePlaceIds: [],
    osmQuery: 'Panchavati',
  },
  {
    name: 'Sadhu Gram',
    spellings: ['Sadhugram', 'साधु ग्राम', 'साधुग्राम'],
    samplePlaceIds: ['sadhu_gram_tent_city'],
    osmQuery: null,
  },
  {
    name: 'Muktidham',
    spellings: ['Mukti Dham', 'मुक्तिधाम'],
    samplePlaceIds: ['muktidham_bhojanalaya'],
    osmQuery: null,
  },
];

/** What each sample category is called, so "hospital" finds the medical sites. */
const CATEGORY_WORDS: Record<PlaceCategory, readonly string[]> = {
  temple: ['temple', 'मंदिर'],
  ghat: ['ghat', 'snan', 'bathing', 'घाट', 'स्नान'],
  kumbh_zone: ['kumbh', 'कुंभ'],
  attraction: ['attraction', 'sightseeing', 'पर्यटन'],
  food: ['food', 'meal', 'bhojan', 'prasad', 'annachhatra', 'भोजन', 'प्रसाद', 'अन्नछत्र', 'जेवण'],
  accommodation: ['stay', 'hotel', 'lodge', 'dharamshala', 'धर्मशाला', 'धर्मशाळा', 'निवास'],
  parking: ['parking', 'पार्किंग', 'वाहनतळ'],
  medical: ['hospital', 'clinic', 'medical', 'doctor', 'first aid', 'अस्पताल', 'रुग्णालय', 'दवाखाना', 'चिकित्सा', 'वैद्यकीय'],
  toilets: ['toilet', 'washroom', 'restroom', 'शौचालय', 'स्वच्छतागृह'],
  drinking_water: ['drinking water', 'पानी', 'पाणी', 'पेयजल'],
  rest_area: ['rest area', 'विश्राम'],
};

/** Words that do not help find a place. */
const STOPWORD_LIST = ['the', 'a', 'an', 'of', 'near', 'in', 'at', 'to', 'and', 'for', 'shri', 'sri', 'ji', 'श्री', 'के', 'की', 'का', 'में', 'पास', 'जवळ'];

/** Endings that are often written joined to the name: Ramkund, Sadhugram, Muktidham. */
const SUFFIX_LIST = ['kund', 'gram', 'dham', 'ghat', 'mandir', 'tirth', 'कुंड', 'ग्राम', 'धाम', 'घाट', 'मंदिर', 'तीर्थ'];

/** Shortest query word that may match the start of a longer word. */
const MIN_PREFIX_LENGTH = 3;

const WEIGHT = { name: 4, area: 2, category: 2, facility: 1, description: 1 } as const;

// ---------------------------------------------------------------------------
// Normalising words
// ---------------------------------------------------------------------------

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN_WORD = /^[a-z0-9]+$/;

/** Each word of `text` as typed, and its lower-case form without Latin accents. */
function splitWords(text: string): { typed: string; plain: string }[] {
  return text
    .normalize('NFC')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .map(typed => ({ typed, plain: typed.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }))
    .filter(word => word.plain !== '');
}

/**
 * One spelling for the usual transliteration differences. `trimEnd` also
 * drops a plural "s" and a final "a"; it is off when the word is matched as
 * the start of a longer word, so "Sita" does not find "situated".
 */
function foldWord(word: string, trimEnd = true): string {
  if (DEVANAGARI.test(word)) {
    return word
      .replace(/़/g, '') // nukta
      .replace(/ँ/g, 'ं') // chandrabindu → anusvara
      .replace(/[ङञणनम]्(?=[क-ह])/g, 'ं') // न्द → ंद, म्ब → ंब
      .replace(/ळ/g, 'ल') // ळ → ल
      .replace(/ी/g, 'ि') // ी → ि
      .replace(/ू/g, 'ु') // ू → ु
      .replace(/ई/g, 'इ') // ई → इ
      .replace(/ऊ/g, 'उ'); // ऊ → उ
  }
  if (!LATIN_WORD.test(word)) return word;
  let folded = word
    .replace(/w/g, 'v')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/a{2,}/g, 'a')
    .replace(/^(?:tryamb|trayamb|tramb|trymb)/, 'trimb')
    .replace(/^nasik/, 'nashik');
  if (trimEnd) {
    if (folded.length >= 5 && /[^aiuos]s$/.test(folded)) folded = folded.slice(0, -1);
    if (folded.length >= 4 && folded.endsWith('a')) folded = folded.slice(0, -1);
  }
  return folded;
}

const CANONICAL = new Map<string, string>();
for (const group of TERM_EQUIVALENTS) {
  const canonical = foldWord(group[0]);
  for (const term of group) CANONICAL.set(foldWord(term), canonical);
}
const canon = (folded: string) => CANONICAL.get(folded) ?? folded;

const STOPWORDS = new Set(STOPWORD_LIST.map(word => foldWord(word)));
const SUFFIXES = SUFFIX_LIST.map(word => foldWord(word));

/** The words of a name as matching sees them, e.g. "Shri Kalaram Temple" → "kalaram mandir". */
function phraseKey(text: string): string {
  return splitWords(text)
    .map(word => canon(foldWord(word.plain)))
    .filter(key => !STOPWORDS.has(key))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Matching sample places
// ---------------------------------------------------------------------------

/** Every searchable token of a place, with the weight of the best field it is in. */
interface PlaceIndex {
  tokens: Map<string, number>;
  /** Phrase keys of its names and aliases. */
  names: string[];
}

function addText(tokens: Map<string, number>, text: string | undefined, weight: number): void {
  if (!text) return;
  const add = (token: string) => {
    if ((tokens.get(token) ?? 0) < weight) tokens.set(token, weight);
  };
  const words = splitWords(text).map(word => word.plain);
  words.forEach((plain, i) => {
    const folded = foldWord(plain);
    add(folded);
    add(canon(folded));
    for (const suffix of SUFFIXES) {
      if (folded.length - suffix.length >= MIN_PREFIX_LENGTH && folded.endsWith(suffix)) {
        const head = foldWord(folded.slice(0, -suffix.length));
        add(head);
        add(canon(head));
        add(canon(suffix));
      }
    }
    // "Ram Kund" can be typed "Ramkund".
    if (i + 1 < words.length) add(foldWord(plain + words[i + 1]));
  });
}

function aliasesOf(place: Place): PlaceAlias[] {
  return PLACE_ALIASES.filter(alias => alias.samplePlaceIds.includes(place.id));
}

function indexPlace(place: Place): PlaceIndex {
  const tokens = new Map<string, number>();
  const nameTexts = [place.name?.en, place.name?.hi, place.name?.mr];
  for (const alias of aliasesOf(place)) nameTexts.push(alias.name, ...alias.spellings);

  for (const text of nameTexts) addText(tokens, text, WEIGHT.name);
  // Not the street address: "Near Muktidham Temple" would make a food hall a temple.
  addText(tokens, place.location?.area, WEIGHT.area);
  for (const word of CATEGORY_WORDS[place.category] ?? []) addText(tokens, word, WEIGHT.category);
  for (const facility of place.facilities ?? []) addText(tokens, facility, WEIGHT.facility);
  for (const text of [place.description?.en, place.description?.hi, place.description?.mr]) addText(tokens, text, WEIGHT.description);

  return { tokens, names: nameTexts.filter((t): t is string => !!t).map(phraseKey) };
}

interface QueryWord {
  /** Fully folded, for whole-word matches. */
  exact: string;
  /** Folded without trimming the end, for matching the start of a longer word. */
  prefix: string;
}

function toQueryWord(plain: string): QueryWord {
  return { exact: foldWord(plain), prefix: foldWord(plain, false) };
}

function queryWordsOf(query: string): QueryWord[] {
  return splitWords(query)
    .map(word => toQueryWord(word.plain))
    .filter(word => !STOPWORDS.has(word.exact));
}

/** How well one query word matches a place: the weight of the best field it is in, or 0. */
function wordWeight(tokens: Map<string, number>, word: QueryWord): number {
  let best = Math.max(tokens.get(word.exact) ?? 0, tokens.get(canon(word.exact)) ?? 0);
  if (word.prefix.length >= MIN_PREFIX_LENGTH) {
    for (const [token, weight] of tokens) {
      if (weight > best && token.startsWith(word.prefix)) best = weight;
    }
  }
  if (best > 0) return best;

  // One word typed for two: "Kushavartakund".
  for (const suffix of SUFFIXES) {
    if (word.exact.length - suffix.length >= MIN_PREFIX_LENGTH && word.exact.endsWith(suffix)) {
      const head = foldWord(word.exact.slice(0, -suffix.length));
      const headWeight = Math.max(tokens.get(head) ?? 0, tokens.get(canon(head)) ?? 0);
      const suffixWeight = Math.max(tokens.get(suffix) ?? 0, tokens.get(canon(suffix)) ?? 0);
      if (headWeight > 0 && suffixWeight > 0) return Math.min(headWeight, suffixWeight);
    }
  }
  return 0;
}

/**
 * Sample places matching every word of `query`, best first: name matches
 * before area and category matches, and a query that is a place's whole name
 * (or the start of it) before the rest. Places found only through a facility
 * or their description are listed only when nothing matches by name, area or
 * category, so "Ramkund" does not also bring up a parking hub whose
 * description mentions buses to Ramkund. An empty query, or one of only
 * filler words, matches nothing.
 */
export function searchSamplePlaces(places: readonly Place[], query: string): Place[] {
  const words = queryWordsOf(query);
  if (words.length === 0) return [];
  const key = words.map(word => canon(word.exact)).join(' ');

  const scored: { place: Place; score: number; order: number; strong: boolean }[] = [];
  places.forEach((place, order) => {
    const index = indexPlace(place);
    let score = 0;
    let weakest = Infinity;
    for (const word of words) {
      const weight = wordWeight(index.tokens, word);
      if (weight === 0) return;
      score += weight;
      weakest = Math.min(weakest, weight);
    }
    if (index.names.includes(key)) score += 3;
    else if (index.names.some(name => name.startsWith(key))) score += 1;
    scored.push({ place, score, order, strong: weakest >= WEIGHT.area });
  });

  const strong = scored.filter(entry => entry.strong);
  return (strong.length > 0 ? strong : scored)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.place);
}

// ---------------------------------------------------------------------------
// "Did you mean"
// ---------------------------------------------------------------------------

/** Optimal string alignment distance: insertions, deletions, substitutions and swapped neighbours. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Known words, folded → as written in the data, for spelling suggestions.
 * Alias spellings are left out: they include misspellings people type, which
 * should be understood but never suggested.
 */
function suggestionVocabulary(places: readonly Place[]): Map<string, string> {
  const vocabulary = new Map<string, string>();
  const addWords = (text: string | undefined) => {
    for (const { typed, plain } of splitWords(text ?? '')) {
      const folded = foldWord(plain);
      if (folded.length >= 4 && !/\d/.test(folded) && !STOPWORDS.has(folded) && !vocabulary.has(folded)) {
        vocabulary.set(folded, typed);
      }
    }
  };
  for (const place of places) [place.name?.en, place.name?.hi, place.name?.mr, place.location?.area].forEach(addWords);
  for (const alias of PLACE_ALIASES) addWords(alias.name);
  for (const words of Object.values(CATEGORY_WORDS)) words.forEach(addWords);
  return vocabulary;
}

/** Known words one typo away (two for long words), closest first. Short words get none. */
function closestWords(folded: string, vocabulary: Map<string, string>): string[] {
  const limit = folded.length >= 8 ? 2 : folded.length >= 5 ? 1 : 0;
  if (limit === 0) return [];
  return [...vocabulary]
    .filter(([key]) => Math.abs(key.length - folded.length) <= limit)
    .map(([key, display]) => ({ key, display, distance: editDistance(folded, key) }))
    .filter(candidate => candidate.distance <= limit)
    .sort((a, b) => a.distance - b.distance || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(candidate => candidate.display);
}

/**
 * Up to `max` corrected spellings of a query that matches nothing, each of
 * which matches at least one sample place: "Kushvarta" → "Kushavarta".
 * Empty when the query already matches, or when a word is not close to any
 * known word (so an unrelated query gets no suggestion).
 */
export function suggestSampleQueries(places: readonly Place[], query: string, max = 3): string[] {
  const typed = splitWords(query);
  if (typed.length === 0 || searchSamplePlaces(places, query).length > 0) return [];

  const indexes = places.map(indexPlace);
  const vocabulary = suggestionVocabulary(places);
  const options = typed.map(word => {
    const queryWord = toQueryWord(word.plain);
    if (STOPWORDS.has(queryWord.exact) || indexes.some(index => wordWeight(index.tokens, queryWord) > 0)) return null;
    return closestWords(queryWord.exact, vocabulary);
  });
  if (options.every(option => option === null) || options.some(option => option !== null && option.length === 0)) return [];

  const suggestions: string[] = [];
  for (let k = 0; k < max; k++) {
    const text = typed.map((word, i) => options[i]?.[Math.min(k, options[i]!.length - 1)] ?? word.typed).join(' ');
    if (!suggestions.includes(text) && searchSamplePlaces(places, text).length > 0) suggestions.push(text);
  }
  return suggestions;
}

// ---------------------------------------------------------------------------
// The server's one alternative spelling for Nominatim
// ---------------------------------------------------------------------------

function indexOfRun(haystack: string[], needle: string[]): number {
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, i) => haystack[start + i] === word)) return start;
  }
  return -1;
}

/**
 * The one other spelling worth sending to Nominatim when `query` found
 * nothing, or null when there is none:
 * 1. The longest PLACE_ALIASES spelling in the query is replaced by the
 *    spelling OpenStreetMap uses ("Kalaram Temple" → "Kalaram Mandir",
 *    "कुशावर्त" → "Kushawart"). A known place OpenStreetMap does not have, or
 *    a query already in its OpenStreetMap spelling, gets null.
 * 2. Otherwise "temple" and "mandir" are swapped, since names in this area are
 *    mapped either way.
 */
export function alternativeSearchQuery(query: string): string | null {
  const typed = splitWords(query);
  if (typed.length === 0) return null;
  const plain = typed.map(word => word.plain);
  const keys = plain.map(word => canon(foldWord(word)));

  let best: { start: number; length: number; alias: PlaceAlias } | null = null;
  for (const alias of PLACE_ALIASES) {
    for (const spelling of [alias.name, ...alias.spellings]) {
      const spellingKeys = splitWords(spelling).map(word => canon(foldWord(word.plain)));
      if (best && spellingKeys.length <= best.length) continue;
      const start = indexOfRun(keys, spellingKeys);
      if (start >= 0) best = { start, length: spellingKeys.length, alias };
    }
  }
  if (best) {
    if (!best.alias.osmQuery) return null;
    const candidate = [...plain.slice(0, best.start), best.alias.osmQuery, ...plain.slice(best.start + best.length)].join(' ');
    return candidate.toLowerCase() === plain.join(' ') ? null : candidate;
  }

  const swapAt = plain.findIndex(word => /^(?:temples?|mandira?)$/.test(word));
  if (swapAt < 0) return null;
  return plain.map((word, i) => (i !== swapAt ? word : word.startsWith('temple') ? 'mandir' : 'temple')).join(' ');
}
