import { SONGS } from "../data/songs.js";
import { pickRandomInstrumental } from "../data/randomInstrumentals.js";

// Search-result cache: repeated announcements of the same (normalized) text
// skip re-scoring the whole catalog. Cleared implicitly by process restart —
// fine for a cache, not a source of truth.
const searchCache = new Map();

export function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip Latin diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip punctuation, keep Unicode letters (incl. Devanagari)
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Fuzzy similarity as a 0..1 score (1 = identical), tolerant of minor
// spelling variation ("tumhiho" vs "tum hi ho").
function similarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - dist / maxLen;
}

function candidateStringsFor(song) {
  return [song.title, song.hindiTitle, ...(song.alternateTitles || [])].map(normalize);
}

const FUZZY_THRESHOLD = 0.72;

/**
 * Local-index search (priority #1 in the spec's search strategy). Tries an
 * exact/substring match against title, Hindi title, and aliases first, then
 * falls back to fuzzy similarity so "tumhiho" or a slightly misheard
 * speech-to-text transcript still resolves.
 */
export function searchSongs(rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return null;

  if (searchCache.has(query)) return searchCache.get(query);

  let best = null;
  let bestScore = 0;

  for (const song of SONGS) {
    const candidates = candidateStringsFor(song);
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate === query || candidate.includes(query) || query.includes(candidate)) {
        searchCache.set(query, song);
        return song;
      }
      const score = similarity(query, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = song;
      }
    }
  }

  const result = bestScore >= FUZZY_THRESHOLD ? best : null;
  searchCache.set(query, result);
  return result;
}


export function getSongLetters(title) {
  const text = String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const letters = [...text.matchAll(/\p{L}/gu)].map((m) => m[0]);
  const startLetter = letters[0] ? letters[0].toUpperCase() : null;
  const endLetter = letters.at(-1) ? letters.at(-1).toUpperCase() : null;
  return { startLetter, endLetter };
}

export function getSongById(songId) {
  return SONGS.find((s) => s.id === songId) || null;
}

/**
 * Resolves what should actually play for a turn. Local DB priority 1 is
 * `searchSongs` above; this always returns *something* playable — falling
 * through to Random Jam — because the game must never stall on missing
 * audio (spec section 1 & 7).
 */
export function resolveTurnAudio(rawQuery) {
  const song = searchSongs(rawQuery);
  if (song && song.karaoke?.available) {
    return { mode: "karaoke", song, profile: song.karaoke.profile };
  }
  const instrumental = pickRandomInstrumental();
  return { mode: "random-jam", song: null, ...instrumental };
}

export function getRandomInstrumental() {
  return pickRandomInstrumental();
}
