import { EventEmitter } from "events";

/**
 * Phase 5 item #6 — a reusable game-event mechanism.
 *
 * gameEngine.js knows nothing about roasts, achievements, sound effects, or
 * stats — it just calls `emitGameEvent(io, roomCode, GAME_EVENTS.X, payload)`
 * at the moments those things happen. Anything else (aiRoastService today;
 * achievements/sound-effects/analytics later) subscribes to `gameEventBus`
 * without gameEngine.js ever importing it. This keeps the systems decoupled,
 * per the Phase 5 spec.
 *
 * `emitGameEvent` does two things:
 *   1. Broadcasts a generic `game:event` socket event to the room, so the
 *      frontend can react to events it doesn't have a dedicated listener
 *      for yet (or just log/animate on them).
 *   2. Emits on the internal Node EventEmitter bus for server-side
 *      subscribers (e.g. the Roast Host) that need full room context.
 */

export const GAME_EVENTS = Object.freeze({
  SONG_SUCCESS: "SONG_SUCCESS",
  SONG_FAILED: "SONG_FAILED",
  TIMEOUT: "TIMEOUT",
  INVALID_SONG: "INVALID_SONG",
  RANDOM_JAM: "RANDOM_JAM",
  VALIDATION_SUCCESS: "VALIDATION_SUCCESS",
  VALIDATION_FAILURE: "VALIDATION_FAILURE",
  COMEBACK: "COMEBACK",
  REPEATED_FAILURE: "REPEATED_FAILURE",
  FINAL_TURN: "FINAL_TURN",
  CHALLENGE_ISSUED: "CHALLENGE_ISSUED",
  SONG_FINISHED: "SONG_FINISHED",
});

export const gameEventBus = new EventEmitter();
// Many independent subscribers (roast host, and later achievements/sound
// effects/stats) may listen to the wildcard channel — raise the default cap
// so Node doesn't warn about a "possible memory leak" for normal usage.
gameEventBus.setMaxListeners(50);

/**
 * @param {import("socket.io").Server|null} io - pass null to emit on the bus
 *   only, without a socket broadcast (rarely needed).
 */
export function emitGameEvent(io, roomCode, type, payload = {}) {
  const event = { type, roomCode, payload, at: Date.now() };
  if (io) io.to(roomCode).emit("game:event", event);
  gameEventBus.emit(type, event);
  gameEventBus.emit("*", event);
  return event;
}
