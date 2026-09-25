/**
 * Single source of truth for room settings defaults.
 *
 * BUGFIX (Phase 1-4 issue #1): Mongoose applies schema `default: ...` values
 * automatically when a document is created/read, but the in-memory store
 * (utils/memoryStore.js) just stores whatever plain object it's given — it
 * has no schema, so a partial `settings` object stayed partial forever.
 * That meant `room.settings.scoring` could be `undefined` in memory-store
 * mode, and `scoring.validSongCompleted` would throw.
 *
 * The fix: every code path that creates or updates settings (Mongo or
 * memory) now merges through `mergeSettings()` below, so both storage
 * backends end up with an identical, fully-populated settings object.
 * This must be kept in sync with the `SettingsSchema` defaults in
 * backend/models/Room.js.
 */

export const DEFAULT_SETTINGS = Object.freeze({
  gameMode: "classic",
  rounds: 10,
  turnDurationSeconds: 30,
  roastHost: Object.freeze({
    enabled: true,
    intensity: "mild",
  }),
  randomJamMode: true,
  specialChallenges: true,
  scoring: Object.freeze({
    validSongCompleted: 50,
    challengeCompleted: 50,
    correctLetter: 20,
    failedTurn: -30,
    timeout: -20,
    invalidSong: 0,
  }),
});

/**
 * Deep-merges a partial settings object (whatever the client sent, possibly
 * `{}` or `undefined`) on top of DEFAULT_SETTINGS. Never returns a partial
 * result — every field is guaranteed to be present afterwards, regardless
 * of which storage backend picks it up.
 */
export function mergeSettings(partial = {}) {
  const input = partial || {};
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    roastHost: {
      ...DEFAULT_SETTINGS.roastHost,
      ...(input.roastHost || {}),
    },
    scoring: {
      ...DEFAULT_SETTINGS.scoring,
      ...(input.scoring || {}),
    },
    turnDurationSeconds: Math.min(30, Math.max(10, Number(input.turnDurationSeconds) || DEFAULT_SETTINGS.turnDurationSeconds)),
  };
}
