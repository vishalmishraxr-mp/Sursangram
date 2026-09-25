/**
 * BUGFIX (Phase 1-4 issue #2): finalizeTurn() reads the room, decides an
 * outcome, then writes it back. Two triggers racing (e.g. a player pressing
 * "Valid" at the exact moment the validation timer fires) could both read
 * the turn as "awaiting-validation" before either write lands, and both
 * would then score the turn.
 *
 * Node is single-threaded, but `await`s inside an async function still let
 * another event (like a timer callback) run in between. This module gives
 * every room a serial queue: whoever calls `withRoomLock(roomCode, fn)`
 * waits for the previous call on that same room to fully finish before
 * `fn` starts. Combined with finalizeTurn() re-checking `turn.status`
 * immediately after acquiring the lock, this makes the
 * awaiting-validation -> finalized transition effectively atomic, without
 * needing a distributed lock or DB transaction.
 */

const chains = new Map(); // roomCode -> Promise (tail of the queue)

export function withRoomLock(roomCode, fn) {
  const previous = chains.get(roomCode) || Promise.resolve();
  const run = previous.then(fn, fn); // run fn regardless of prior success/failure
  // Keep the chain alive but never let a rejection propagate into the map's
  // stored promise (that would poison every future call for this room).
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  chains.set(roomCode, tail);
  return run;
}

export function clearRoomLock(roomCode) {
  chains.delete(roomCode);
}
