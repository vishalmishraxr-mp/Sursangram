# Sursangram

Sursangram is an AI Antakshri — a voice-first multiplayer song-chain game with an AI opponent, live rooms, Apple song previews, and a playful Roast Host.

Sing It. Beat It. Own The Battle.

## Status: Phase 6 of 6 — AI Roast Host + Chaos/Dare + results + game audio cues

Phase 3 gave you a playable turn engine with a manual "did they sing?" vote. Phase 4 adds the actual **song layer**:

- Speech-to-text song announcement via the browser's Web Speech API (Hindi locale by default), with a manual text-input fallback always shown alongside it — required for browsers without speech recognition support (e.g. Firefox), and as a safety net if the mic doesn't cooperate.
- A real turn sub-state machine matching the spec's STATE 1–4: **declaring** (player announces a song) → search/match → **active** (something is now playing, singing timer starts) → **awaiting-validation** → **finalized**. If a player takes more than 20 seconds to announce anything, the server automatically falls back to Random Jam Mode rather than leaving the game stuck on a loading state.
- A local indexed song catalog (15 well-known titles) with title/Hindi title/alternate-spelling aliases, searched via exact/substring match first, then a hand-rolled Levenshtein fuzzy match (threshold-tuned) so things like `"tumhiho"` or a slightly-off speech transcript still resolve — verified in a standalone test against real query variations.
- Random Jam fallback: any unmatched song (or a manual "Surprise Me" tap) picks from 9 categories from the spec (romantic piano, dhol, tabla, classical, lo-fi, comedy, party, dramatic villain, etc.) — the game is never left without something to play.
- Classic Mode's letter-chain bonus: the last finalized song's ending sound becomes the required starting sound for the next turn, and a correct match adds the configured `correctLetter` bonus on top of the base score — confirmed end-to-end in a test run (two chained songs → the second correctly scored base + bonus).
- Real, audible playback: a small Web Audio synthesizer generates an original Antakshari instrumental BGM, starting exactly when a turn goes active and stopping exactly when it ends. The identified song itself is not played.
- A live waveform visualization driven by the *actual* microphone input (Web Audio `AnalyserNode`) while the active player is singing, falling back to a gentle idle animation if mic permission is denied.

**Audio behaviour:** the game identifies songs through a cache-first pipeline that can understand either the song title or a lyric fragment. For lyric fragments, the backend uses full-text lyric matching, then resolves the identified song through Apple's iTunes Search API so playback still uses the same Apple preview URL. Random Jam remains on the original locally generated instrumental BGM.

**Phase 5 status:** AI Roast Host, Chaos/Dare challenges, lightweight confetti, comeback summary, and result sharing are implemented.

**Phase 6 status:** event-driven sound cues are now wired to the generic `game:event` socket stream. Successful turns, failed/denied turns, timeouts, repeated failures, and comeback events can play short synthesized cues without interrupting the turn instrumental. Audio remains a presentation layer: blocked autoplay or unsupported Web Audio never breaks gameplay.

The current product choice is intentional: normal song turns use the short Apple preview selected for the announced song, while Random Jam uses the generated Web Audio BGM.

## Running it locally

### Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```
Runs on `http://localhost:5001`. Health check: `GET /api/v1/health`.

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Runs on `http://localhost:5173`.

Open two browser windows (or a normal + incognito window) to simulate two players: create a room in one, then join with the room code in the other.

## Roadmap

1. **Foundation** — scaffold, Landing/Create/Join, Room REST API.
2. **Real-time layer** — Socket.IO, live Team Lobby with team assignment and ready-checks, host controls, reconnection over sockets.
3. **Turn engine** — server-authoritative turn order, deadline-based timer, scoring engine, opposing-team validation in place of real singing detection.
4. **Song search + karaoke/Random Jam engine** *(this phase)* — speech-to-text song announcement, indexed song metadata, fuzzy matching, synthesized karaoke/instrumental playback, automatic Random Jam fallback, Classic Mode letter-chain bonus.
5. **AI Roast Host** — predefined low-latency commentary by intensity/personality, optional LLM hook with strict timeout.
6. **Chaos/Dare Mode + results extras** — challenge completion tracking, shareable results, comeback summary, confetti.
7. **Deployment / production hardening** — Vercel/Render/Atlas configuration, real music metadata provider, and crash-recovery persistence.

## Project structure

```
antakshari-ai/
  backend/
    config/db.js
    data/{songs,randomInstrumentals}.js  # seed catalog (Phase 4)
    models/Room.js
    repositories/roomRepository.js       # Mongo-or-memory abstraction
    routes/{rooms,songs}.js
    services/{gameEngine,songSearch}.js  # turn lifecycle + song matching
    sockets/index.js
    utils/{roomCode,memoryStore,apiResponse,teamNames,turnOrder}.js
    validation/roomSchemas.js
    middleware/errorHandler.js
    server.js
  frontend/
    src/
      pages/{LandingPage,CreateRoomPage,JoinRoomPage,RoomLobbyPage,GamePage}.jsx
      components/{Button,GlassCard,ErrorText,MicWaveform}.jsx
      hooks/useSpeechRecognition.js
      services/{api,socket,audioSynth}.js
      context/SessionContext.jsx
```

## Trying Phase 4

1. Get a game started (Phase 3 steps). On the active player's turn, tap the mic and say a song title out loud — try "Tum Hi Ho" or "Kajra Re" — or just type it and hit "Sing This."
2. Watch it resolve: a matched title shows "🎶 Matched: ..." and plays a piano-style loop; an unrecognized title (or "Surprise Me") shows "🎲 Jam Mode Activated!" with a different-sounding category.
3. In Classic Mode, after the first successful turn you'll see "Your song must start with: <letter>" on the next turn — match it with a song from the catalog (see `backend/data/songs.js` for the list and their chain letters) to see the bonus land.
4. Try it in Firefox (no Web Speech API) to see the manual text-only fallback kick in automatically.

## Phase 6 — Song Intelligence Pipeline

Song announcements now use a real metadata lookup pipeline instead of only the small bundled catalog:

```text
Speech-to-text / Manual Song Name
              ↓
      Local curated catalog
              ↓
        MongoDB Song Cache
              ↓
       External Metadata API
              ↓
       Normalize + Validate
              ↓
        Save to MongoDB
              ↓
      Return song metadata
              ↓
  startSound / lastSound + profile
              ↓
         Antakshari turn
```

### Cache-first behavior

1. A song search first checks the MongoDB cache for previously resolved iTunes metadata.
2. If it is not cached, the backend searches Apple's iTunes Search API.
3. If the user input looks like a lyric fragment, the backend also searches the lyrics content index and resolves the matched title/artist through iTunes.
4. The result is normalized into the Antakshari song format, including the starting and ending letters.
5. The normalized metadata (and Apple preview metadata when available) is cached in MongoDB for later games.
6. During an active normal song turn, the frontend plays the matched iTunes preview; Random Jam keeps the original `antakshari-bgm` Web Audio loop.
7. Random Jam can still use its own generated instrumental profiles when that game feature is activated.

### External provider configuration

The default provider is Apple's public iTunes Search API and requires no API key. The backend supports replacing it with another metadata provider through:

```env
MUSIC_API_COUNTRY=IN
MUSIC_API_TIMEOUT_MS=3500
LYRICS_SEARCH_BASE_URL=https://unison.boidu.dev
LYRICS_SEARCH_TIMEOUT_MS=4500
# MUSIC_API_URL=https://your-provider.example.com/search
# MUSIC_API_KEY=
```

The external lookup is bounded by a short timeout so a slow provider cannot block the turn indefinitely.

The lyrics-content fallback uses Unison's `/lyrics/search?q=...` endpoint. Its search supports full-text lyric matching, so players can speak a line from the middle of a song; the app only uses that service for identification and still gets the playable preview from iTunes.


## Phase 6 — Two Ways To Play

The game now supports two first-class play flows:

1. **Play Together** — one device, everyone sits together, create Team A and Team B manually, add members, then start the battle. No room code or second device is required.
2. **Online Room** — create or join a Socket.IO room, assign players to teams, and play across devices/browsers.

The local flow uses the same song-search backend pipeline (MongoDB iTunes metadata cache → Apple iTunes Search API → normalized result), while the browser plays the same generated Antakshari BGM during active turns.

## Recent gameplay updates

- Play with AI mode for single-player matches on the same device.
- AI opponent follows the current Classic letter chain and selects fresh song titles through the iTunes-backed song pipeline.
- Human and AI turns prevent duplicate songs within the same match.
- The selected song's direct iTunes song preview is used for active turns; Random Jam keeps the original local instrumental BGM.
- The current and next required letters are shown prominently during Classic Mode.
- Roast Host now supports a dedicated post-song roast when the Apple song preview finishes.

## Lyrics identification attribution

Lyric-fragment identification uses Unison. See https://unison.boidu.dev for the service and attribution requirements.

## Audio and lyric-sync note

Sursangram uses the Apple/iTunes song preview URL for normal song turns. Every active turn is capped at 30 seconds and the preview is never looped. Lyric-fragment identification uses lyric search plus synced lyrics metadata where available.

When synced lyrics are available, the backend chooses the submitted lyric line for lyric-fragment searches and a random preview-safe lyric line for normal title searches. The browser then seeks inside the available Apple preview when that timestamp is inside the preview window. This is a best-effort sync: Apple's public preview URL does not expose the original full-track preview offset, so an exact full-song arbitrary-lyric jump cannot be guaranteed from iTunes previews alone. LRCLIB provides the line-level timestamps used by this feature. A future authorized full-track playback provider (for example, a MusicKit-based flow for authenticated listeners) can use the same `lyricMatch.startSeconds` value for exact seeking.
