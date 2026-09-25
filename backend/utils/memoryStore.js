// Simple in-memory room store used when MongoDB isn't connected.
// Same shape as the Mongoose Room documents so routes don't need to branch much.

const rooms = new Map(); // roomCode -> room object

/**
 * BUGFIX (Phase 1-4 issue #6): MongoDB rooms expire via the `expiresAt` TTL
 * index on the Room schema, but the in-memory store had no equivalent —
 * rooms just accumulated in the Map forever. Every read now lazily checks
 * `expiresAt`, and a periodic sweep (see `memSweepExpired`, invoked from
 * server.js) proactively clears rooms nobody ever reads again, so memory
 * doesn't grow unbounded on a long-running instance without a database.
 */
function isExpired(room) {
  return room?.expiresAt && new Date(room.expiresAt).getTime() <= Date.now();
}

export function memCreateRoom(room) {
  rooms.set(room.roomCode, room);
  return room;
}

export function memGetRoom(roomCode) {
  const room = rooms.get(roomCode) || null;
  if (isExpired(room)) {
    rooms.delete(roomCode);
    return null;
  }
  return room;
}

export function memUpdateRoom(roomCode, updater) {
  const room = memGetRoom(roomCode); // expiry-checked read
  if (!room) return null;
  updater(room);
  rooms.set(roomCode, room);
  return room;
}

export function memDeleteRoom(roomCode) {
  return rooms.delete(roomCode);
}

export function memRoomCodeExists(roomCode) {
  return !!memGetRoom(roomCode);
}

/**
 * Proactive TTL sweep — removes every expired room regardless of whether
 * anyone reads it again. Call on an interval (see server.js). Returns the
 * number of rooms removed, mainly for logging.
 */
export function memSweepExpired() {
  let removed = 0;
  for (const [roomCode, room] of rooms) {
    if (isExpired(room)) {
      rooms.delete(roomCode);
      removed++;
    }
  }
  return removed;
}

export function memRoomCount() {
  return rooms.size;
}
