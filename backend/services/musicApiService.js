import { normalize, searchSongs, getSongLetters } from "./songSearch.js";
import { AI_SONG_POOL } from "../data/aiSongPool.js";
import { isDbConnected } from "../config/db.js";
import Song from "../models/Song.js";

const memorySongCache = new Map();
const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_COUNTRY = process.env.MUSIC_API_COUNTRY || "IN";
const PROVIDER_TIMEOUT_MS = Number(process.env.MUSIC_API_TIMEOUT_MS || 3500);

// Lyrics-content search lets players announce a line from the middle of a
// song instead of having to know the exact song title. Unison exposes a
// full-text lyrics search endpoint and returns the matched song metadata; we
// then resolve that song through iTunes so playback still uses the same
// Apple preview URL as normal title searches.
const LYRICS_SEARCH_BASE_URL = (
  process.env.LYRICS_SEARCH_BASE_URL || "https://unison.boidu.dev"
).replace(/\/$/, "");
const LYRICS_SEARCH_TIMEOUT_MS = Number(
  process.env.LYRICS_SEARCH_TIMEOUT_MS || 4500
);
const SYNCED_LYRICS_BASE_URL = (
  process.env.SYNCED_LYRICS_BASE_URL || "https://lrclib.net"
).replace(/\/$/, "");
const SYNCED_LYRICS_TIMEOUT_MS = Number(
  process.env.SYNCED_LYRICS_TIMEOUT_MS || 3500
);

function firstLetter(value) {
  const text = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = text.match(/\p{L}/u);
  return match ? match[0].toUpperCase() : null;
}

function normalizeLetter(value) {
  return firstLetter(value);
}

function textSimilarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  const m = left.length;
  const n = right.length;
  const previous = new Array(n + 1);
  const current = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) previous[j] = j;
  for (let i = 1; i <= m; i += 1) {
    current[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= n; j += 1) previous[j] = current[j];
  }
  return 1 - previous[n] / Math.max(m, n);
}

function matchesRequiredLetter(song, requiredLetter) {
  if (!requiredLetter) return true;
  return normalizeLetter(song.startLetter || song.startSound || song.title) === normalizeLetter(requiredLetter);
}

async function itunesSearch(rawQuery) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const url = new URL(ITUNES_SEARCH_URL);
    url.searchParams.set("term", rawQuery);
    url.searchParams.set("country", ITUNES_COUNTRY);
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", "song");
    url.searchParams.set("limit", "15");
    url.searchParams.set("explicit", "No");

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.warn(`[musicApiService] iTunes Search API returned HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch (err) {
    console.warn(
      "[musicApiService] iTunes search failed:",
      err.name === "AbortError" ? "timeout" : err.message
    );
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function hasUsableCachedAudio(song) {
  const url = String(song?.audioUrl || song?.streamUrl || song?.previewUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return false;

  // The old project used SoundHelix as placeholder audio. Never treat that
  // placeholder as a real cached song after switching to iTunes previews.
  if (/soundhelix\.com|example\.com/i.test(url)) return false;
  return true;
}

function tokenizeForMatch(value) {
  return normalize(value)
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

function lyricOverlapScore(query, lyrics) {
  const queryTokens = tokenizeForMatch(query);
  const lyricTokens = tokenizeForMatch(lyrics);
  if (!queryTokens.length || !lyricTokens.length) return 0;

  const lyricSet = new Set(lyricTokens);
  let hits = 0;
  for (const token of queryTokens) {
    if (lyricSet.has(token)) hits += 1;
  }

  // Exact phrase containment is much stronger than token overlap.
  const normalizedQuery = normalize(query);
  const normalizedLyrics = normalize(lyrics);
  const phraseBonus = normalizedQuery && normalizedLyrics.includes(normalizedQuery) ? 0.55 : 0;
  return Math.min(1, hits / queryTokens.length + phraseBonus);
}

function extractLyricsSearchResults(payload) {
  const candidates = [
    payload?.data,
    payload?.results,
    payload?.data?.results,
    payload?.data?.items,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function extractSyncedLyrics(row) {
  return String(
    row?.syncedLyrics ||
      row?.synchronizedLyrics ||
      row?.syncLyrics ||
      row?.lrc ||
      row?.data?.syncedLyrics ||
      ""
  ).trim();
}

function parseLrcLines(lrc) {
  return String(lrc || "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = Number(`0.${String(match[3] || "0").padEnd(3, "0")}`);
      const text = String(match[4] || "").trim();
      if (!text) return null;
      return { timeSeconds: minutes * 60 + seconds + fraction, text };
    })
    .filter(Boolean);
}

function findMatchedLyricLine(query, lrc) {
  const lines = parseLrcLines(lrc);
  if (!lines.length) return null;

  const queryTokens = tokenizeForMatch(query);
  if (!queryTokens.length) return null;
  const normalizedQuery = normalize(query);

  const ranked = lines
    .map((line) => {
      const normalizedLine = normalize(line.text);
      const lineTokens = new Set(tokenizeForMatch(line.text));
      const hits = queryTokens.reduce((count, token) => count + (lineTokens.has(token) ? 1 : 0), 0);
      const tokenScore = hits / queryTokens.length;
      const phraseScore = normalizedLine.includes(normalizedQuery) ? 1 : 0;
      const fuzzyScore = textSimilarity(query, line.text);
      const score = phraseScore * 2 + tokenScore * 1.5 + fuzzyScore;
      return { ...line, score, tokenScore, phraseScore };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;

  const minimum = queryTokens.length <= 3 ? 0.65 : 0.42;
  if (best.tokenScore < minimum && best.phraseScore !== 1) return null;

  return {
    line: best.text,
    startSeconds: best.timeSeconds,
    confidence: Math.min(1, best.tokenScore + (best.phraseScore ? 0.35 : 0)),
  };
}


function pickRandomPreviewLyricLine(lrc, maxPreviewSeconds = 28.5) {
  const lines = parseLrcLines(lrc)
    .filter((line) => line.timeSeconds >= 0 && line.timeSeconds <= maxPreviewSeconds && line.text);
  if (!lines.length) return null;

  // Prefer lines that are not the metadata/opening-type fragments.
  const usable = lines.filter((line) => tokenizeForMatch(line.text).length >= 2);
  const pool = usable.length ? usable : lines;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  if (!picked) return null;

  return {
    line: picked.text,
    startSeconds: picked.timeSeconds,
    confidence: 1,
    mode: "random-lyric",
  };
}

async function fetchSyncedLyrics(title, artist, album = null, durationSeconds = null) {
  if (!title || !artist) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNCED_LYRICS_TIMEOUT_MS);

  try {
    const url = new URL(`${SYNCED_LYRICS_BASE_URL}/api/get`);
    url.searchParams.set("track_name", title);
    url.searchParams.set("artist_name", artist);
    if (album) url.searchParams.set("album_name", album);
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      url.searchParams.set("duration", String(durationSeconds));
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const syncedLyrics = String(payload?.syncedLyrics || "").trim();
    return syncedLyrics || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveLyricPlaybackHint(rawQuery, lyricsMatch, itunesSong, { preferMatched = false } = {}) {
  const directSynced = extractSyncedLyrics(lyricsMatch?.row || lyricsMatch || {});
  let syncedLyrics = directSynced;

  if (!syncedLyrics && itunesSong?.title && itunesSong?.artist) {
    syncedLyrics = await fetchSyncedLyrics(
      itunesSong.title,
      itunesSong.artist,
      itunesSong.album,
      Number(itunesSong.metadata?.trackTimeMillis || 0) / 1000
    );
  }

  if (!syncedLyrics) return null;

  // When the player supplied an actual lyric fragment, start from that exact
  // matched line whenever we have synced lyrics for it.
  if (preferMatched && rawQuery) {
    const matched = findMatchedLyricLine(rawQuery, syncedLyrics);
    if (matched) return { ...matched, mode: "matched-lyric" };
  }

  // For title searches, use a random line from the first preview-sized window.
  // This is intentionally limited to the part that can be safely sought inside
  // Apple's short preview clip. A full-song timestamp is not exposed by the
  // iTunes Search response, so we never pretend a later full-song timestamp is
  // synchronized with the preview.
  return pickRandomPreviewLyricLine(syncedLyrics);
}

async function hydratePlaybackRuntime(song, rawQuery, { preferMatched = false, lyricsMatch = null } = {}) {
  if (!song?.title || !song?.artist) return song;

  const lyricPlayback = await resolveLyricPlaybackHint(rawQuery, lyricsMatch, song, { preferMatched });
  if (!lyricPlayback) return { ...song, playbackSeekable: false, runtime: { lyricMatch: null } };

  return {
    ...song,
    // We only mark it seekable when the chosen line is inside the preview-safe
    // window. The frontend still verifies the actual media duration before seeking.
    playbackSeekable: lyricPlayback.startSeconds > 0 && lyricPlayback.startSeconds < 29.5,
    runtime: {
      lyricMatch: {
        line: lyricPlayback.line,
        startSeconds: lyricPlayback.startSeconds,
        confidence: lyricPlayback.confidence,
        mode: lyricPlayback.mode,
        source: lyricsMatch?.syncedLyrics ? "lyrics-search" : "lrclib",
      },
    },
    metadata: {
      ...(song.metadata || {}),
      randomLyricStart: lyricPlayback.mode === "random-lyric",
      matchedLyric: lyricPlayback.line,
      matchedLyricStartSeconds: lyricPlayback.startSeconds,
    },
  };
}

async function searchLyricsContent(rawQuery) {
  const query = String(rawQuery || "").trim();
  if (!query) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LYRICS_SEARCH_TIMEOUT_MS);

  try {
    const url = new URL(`${LYRICS_SEARCH_BASE_URL}/lyrics/search`);
    url.searchParams.set("q", query);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Sursangram/1.0 (college project; lyrics identification)",
      },
    });

    if (!response.ok) {
      console.warn(`[musicApiService] lyrics search returned HTTP ${response.status}`);
      return null;
    }

    const payload = await response.json();
    const rows = extractLyricsSearchResults(payload);
    if (!rows.length) return null;

    const ranked = rows
      .map((row) => {
        const title = String(row?.song || row?.title || row?.trackName || "").trim();
        const artist = String(row?.artist || row?.artistName || "").trim();
        const album = String(row?.album || row?.albumName || row?.collectionName || "").trim();
        const lyrics = String(row?.lyrics || row?.plainLyrics || row?.text || "").trim();
        const syncedLyrics = extractSyncedLyrics(row);
        const sourceScore = Number(row?.effectiveScore ?? row?.score ?? 0) || 0;
        const overlap = lyricOverlapScore(query, lyrics);
        const titleMatch = textSimilarity(query, title);

        // For lyric fragments, lyrics overlap is the important signal.
        // Metadata score is kept as a tie-breaker rather than the main signal.
        const score = overlap * 1000 + sourceScore * 8 + titleMatch * 40;

        return { row: { ...row, syncedLyrics }, title, artist, album, lyrics, score, overlap, syncedLyrics };
      })
      .filter((item) => item.title)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best) return null;

    // Require at least a meaningful lyric overlap. This prevents a normal
    // title search result from being mistaken for a lyric match.
    const queryTokenCount = tokenizeForMatch(query).length;
    const minOverlap = queryTokenCount <= 3 ? 0.5 : 0.34;
    if (best.overlap < minOverlap) return null;

    return {
      title: best.title,
      artist: best.artist,
      album: best.album,
      lyrics: best.lyrics,
      syncedLyrics: best.syncedLyrics || null,
      confidence: Math.min(1, best.overlap),
      providerId: best.row?.id ?? best.row?.videoId ?? null,
    };
  } catch (err) {
    console.warn(
      "[musicApiService] lyrics content search failed:",
      err.name === "AbortError" ? "timeout" : err.message
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveLyricsMatchToItunes(lyricsMatch, rawQuery, requiredLetter = null) {
  if (!lyricsMatch?.title) return null;

  const searchText = [lyricsMatch.title, lyricsMatch.artist].filter(Boolean).join(" ");
  const attachRuntime = async (song) => {
    if (!song) return null;

    const enriched = await hydratePlaybackRuntime(song, rawQuery, {
      preferMatched: true,
      lyricsMatch,
    });
    return {
      ...enriched,
      metadata: {
        ...(enriched.metadata || {}),
        identifiedFrom: "lyrics",
        lyricsProvider: "unison",
        lyricsConfidence: lyricsMatch.confidence,
        lyricsProviderId: lyricsMatch.providerId,
      },
    };
  };

  const direct = await searchItunes(searchText, requiredLetter);
  if (direct) return attachRuntime(direct);

  const titleOnly = await searchItunes(lyricsMatch.title, requiredLetter);
  if (titleOnly) return attachRuntime(titleOnly);

  return null;
}

async function findInMongoCache(rawQuery) {
  if (!isDbConnected()) return null;
  const normalizedQuery = normalize(rawQuery);
  if (!normalizedQuery) return null;

  // Prefer an iTunes cache entry so stale records from the previous Music API
  // cannot keep returning dead/non-song audio for the same title.
  const itunesExact = await Song.findOne({
    normalizedTitle: normalizedQuery,
    source: "external",
    provider: "itunes",
  }).lean();
  if (itunesExact && hasUsableCachedAudio(itunesExact)) return itunesExact;

  const candidates = await Song.find({
    $or: [
      { normalizedTitle: { $regex: normalizedQuery, $options: "i" } },
      { alternateTitles: { $regex: normalizedQuery, $options: "i" } },
    ],
  }).limit(20).lean();

  // Manual/local records remain supported only when they point at real media.
  // Old Music API records are deliberately ignored here so a fresh iTunes
  // lookup can replace them.
  return candidates.find((song) => {
    if (song.source === "external") return song.provider === "itunes";
    return hasUsableCachedAudio(song) && (song.source === "manual" || song.source === "local");
  }) || null;
}

async function saveToCache(songMeta) {
  const key = songMeta.normalizedTitle;
  const runtime = songMeta.runtime || null;
  const persistable = { ...songMeta };
  delete persistable.runtime;

  memorySongCache.set(key, persistable);

  if (!isDbConnected()) {
    return runtime ? { ...persistable, runtime } : persistable;
  }

  try {
    const doc = await Song.findOneAndUpdate(
      { normalizedTitle: persistable.normalizedTitle, source: "external" },
      { $set: persistable },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const cached = doc.toObject();
    return runtime ? { ...cached, runtime } : cached;
  } catch (err) {
    console.warn("[musicApiService] cache write skipped:", err.message);
    return runtime ? { ...persistable, runtime } : persistable;
  }
}

function scoreItunesResult(result, rawQuery) {
  const query = normalize(rawQuery);
  const title = normalize(result?.trackName);
  const artist = normalize(result?.artistName);
  const album = normalize(result?.collectionName);

  if (!title) return -Infinity;

  let score = 0;
  if (title === query) score += 300;
  else if (title.startsWith(query)) score += 180;
  else if (title.includes(query)) score += 120;
  else if (query.includes(title)) score += 100;

  if (artist === query) score += 70;
  if (album === query) score += 40;
  if (artist.includes(query) || query.includes(artist)) score += 20;
  if (album.includes(query) || query.includes(album)) score += 10;

  score += Math.max(0, 40 - Math.abs(title.length - query.length));
  return score;
}

function normalizeItunesResult(result, rawQuery) {
  const title = String(result?.trackName || "").trim();
  const previewUrl = String(result?.previewUrl || "").trim();
  if (!title) return null;

  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return null;

  const letters = getSongLetters(title);
  const externalId = result?.trackId != null ? String(result.trackId) : null;
  const artworkUrl = result?.artworkUrl600 || result?.artworkUrl100 || result?.artworkUrl60 || null;
  const appleStoreUrl = result?.trackViewUrl || result?.collectionViewUrl || null;

  return {
    title,
    normalizedTitle,
    alternateTitles: [rawQuery, result?.trackCensoredName, result?.collectionName]
      .filter(Boolean)
      .map(normalize)
      .filter(Boolean),
    artist: String(result?.artistName || "").trim() || null,
    album: String(result?.collectionName || "").trim() || null,
    movie: null,
    startSound: letters.startLetter,
    lastSound: letters.endLetter,
    startLetter: letters.startLetter,
    endLetter: letters.endLetter,
    source: "external",
    externalId,
    id: externalId,
    songId: externalId,
    provider: "itunes",
    streamUrl: previewUrl || null,
    audioUrl: previewUrl || null,
    previewUrl: previewUrl || null,
    playbackSeekable: true,
    artworkUrl,
    karaoke: {
      available: Boolean(previewUrl),
      profile: "itunes-preview",
    },
    metadata: {
      provider: "itunes",
      country: ITUNES_COUNTRY,
      rawQuery,
      preview: Boolean(previewUrl),
      previewDurationSeconds: 30,
      appleStoreUrl,
      trackTimeMillis: result?.trackTimeMillis || null,
      genre: result?.primaryGenreName || null,
    },
  };
}

async function searchItunes(rawQuery, requiredLetter = null) {
  const results = await itunesSearch(rawQuery);
  const normalizedRequired = normalizeLetter(requiredLetter);

  const candidates = results
    .filter((result) => result?.kind === "song" || result?.wrapperType === "track")
    .map((result) => ({ result, score: scoreItunesResult(result, rawQuery) }))
    .filter(({ result, score }) => {
      if (score === -Infinity) return false;
      if (!normalizedRequired) return true;
      const start = normalizeLetter(result.trackName);
      return start === normalizedRequired;
    })
    .sort((a, b) => b.score - a.score);

  for (const { result } of candidates) {
    const song = normalizeItunesResult(result, rawQuery);
    if (song) return song;
  }

  return null;
}

function queryWordCountForRuntime(value) {
  return tokenizeForMatch(value).length;
}

export async function identifySong(rawQuery, requiredLetter = null) {
  const query = String(rawQuery || "").trim();
  if (!query) return null;

  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  // 1) MongoDB cache first. A cached iTunes preview is reused across games.
  const mongoMatch = await findInMongoCache(query);
  if (mongoMatch) {
    memorySongCache.set(mongoMatch.normalizedTitle, mongoMatch);
    const hydrated = await hydratePlaybackRuntime(mongoMatch, query, {
      preferMatched: queryWordCountForRuntime(query) >= 4,
    });
    if (!matchesRequiredLetter(hydrated, requiredLetter)) {
      return { ...hydrated, letterMismatch: true };
    }
    return hydrated;
  }

  // 2) Process cache for repeated searches during the same server session.
  const memoryMatch = memorySongCache.get(normalizedQuery);
  if (memoryMatch && hasUsableCachedAudio(memoryMatch)) {
    const hydrated = await hydratePlaybackRuntime(memoryMatch, query, {
      preferMatched: queryWordCountForRuntime(query) >= 4,
    });
    if (!matchesRequiredLetter(hydrated, requiredLetter)) {
      return { ...hydrated, letterMismatch: true };
    }
    return hydrated;
  }

  // 3) Lyrics-first identification for sentence-like input. This is what
  // allows a player to speak a line from the middle of a song instead of
  // knowing the title. Short title-like input goes to iTunes first to keep
  // normal searches fast; lyrics remain the fallback in that case.
  const queryWordCount = tokenizeForMatch(query).length;
  if (queryWordCount >= 4) {
    const lyricsMatch = await searchLyricsContent(query);
    if (lyricsMatch) {
      const lyricsSong = await resolveLyricsMatchToItunes(lyricsMatch, query, requiredLetter);
      if (lyricsSong) return saveToCache(lyricsSong);
    }
  }

  // 4) Fresh search against Apple's public iTunes Search API for normal title
  // input. Existing title search behaviour stays intact.
  const external = await searchItunes(query, requiredLetter);
  if (external) {
    const hydrated = await hydratePlaybackRuntime(external, query, {
      preferMatched: queryWordCount >= 4,
    });
    return saveToCache(hydrated);
  }

  // If a short title-like input did not resolve through iTunes, try it as a
  // lyric fragment before falling back to the curated local catalog.
  if (queryWordCount < 4) {
    const lyricsMatch = await searchLyricsContent(query);
    if (lyricsMatch) {
      const lyricsSong = await resolveLyricsMatchToItunes(lyricsMatch, query, requiredLetter);
      if (lyricsSong) return saveToCache(lyricsSong);
    }
  }

  // 5) Keep the curated catalog as an identification fallback.
  const localMatch = searchSongs(query);
  if (localMatch) {
    const letters = getSongLetters(localMatch.title);
    const song = {
      ...localMatch,
      ...letters,
      startSound: letters.startLetter,
      lastSound: letters.endLetter,
      source: "local",
    };
    if (!matchesRequiredLetter(song, requiredLetter)) return { ...song, letterMismatch: true };
    return song;
  }

  // 6) A stale cached identification result is still useful because the
  // current turn uses BGM rather than the searched song recording.
  if (mongoMatch) {
    if (!matchesRequiredLetter(mongoMatch, requiredLetter)) {
      return { ...mongoMatch, letterMismatch: true };
    }
    return mongoMatch;
  }

  return null;
}

// Kept for backwards compatibility with the existing /songs/stream route.
// iTunes songs already carry a direct previewUrl, so the frontend normally
// plays that URL directly and never needs this endpoint.
export async function getPlayableAudioUrl(externalId) {
  if (!externalId) return null;
  if (!isDbConnected()) return null;

  const song = await Song.findOne({ externalId: String(externalId), source: "external" }).lean();
  return song?.audioUrl || song?.streamUrl || song?.previewUrl || null;
}

export async function searchSongWithSource(rawQuery, requiredLetter = null) {
  const song = await identifySong(rawQuery, requiredLetter);
  if (!song) return { song: null, source: null, fallback: "random-jam", letterMismatch: false };
  if (song.letterMismatch) {
    return { song, source: song.source || "external", fallback: null, letterMismatch: true };
  }
  return { song, source: song.source || "external", fallback: null, letterMismatch: false };
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function songKey(song) {
  return String(song?.externalId || song?.songId || song?.id || song?.normalizedTitle || "").trim().toLowerCase();
}

function canPlay(song) {
  const url = String(song?.audioUrl || song?.streamUrl || song?.previewUrl || "").trim();
  return /^https?:\/\//i.test(url) && !/soundhelix\.com|example\.com/i.test(url);
}

/**
 * Picks a real song for the local AI opponent. Selection is intentionally
 * lightweight and deterministic enough for a college-project prototype:
 * choose from a broad title pool, respect the current chain letter, avoid
 * already-used songs, then resolve the chosen title through the same iTunes
 * search/cache pipeline used by human players.
 */
export async function pickAiSong(requiredLetter = null, usedSongKeys = []) {
  const used = new Set((usedSongKeys || []).map((value) => String(value).trim().toLowerCase()).filter(Boolean));
  const wanted = normalizeLetter(requiredLetter);

  const availableStarts = new Set(AI_SONG_POOL.map((title) => normalizeLetter(title)).filter(Boolean));
  const candidates = shuffle(AI_SONG_POOL)
    .filter((title) => {
      const start = normalizeLetter(title);
      return (!wanted || start === wanted);
    })
    .sort((a, b) => {
      const aEnd = normalizeLetter(getSongLetters(a).endLetter);
      const bEnd = normalizeLetter(getSongLetters(b).endLetter);
      const aHasFollowUp = aEnd && availableStarts.has(aEnd) ? 1 : 0;
      const bHasFollowUp = bEnd && availableStarts.has(bEnd) ? 1 : 0;
      return bHasFollowUp - aHasFollowUp;
    });

  // Avoid burning many provider requests if the current chain letter has few
  // candidates. Eight attempts are enough for normal local gameplay.
  for (const title of candidates.slice(0, 8)) {
    try {
      const song = await identifySong(title, requiredLetter);
      if (!song || song.letterMismatch || !canPlay(song)) continue;
      if (used.has(songKey(song))) continue;
      return song;
    } catch {
      // Try another title; AI should never break the match because one lookup
      // failed or timed out.
    }
  }

  return null;
}
