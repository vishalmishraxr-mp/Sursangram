import { Router } from "express";
import { nanoid } from "nanoid";
import {
  createRoomSchema,
  joinRoomSchema,
  roomCodeParamSchema,
} from "../validation/roomSchemas.js";
import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  updateRoomSettings,
  reassignHostIfNeeded,
} from "../repositories/roomRepository.js";
import { ok, fail } from "../utils/apiResponse.js";

const router = Router();
const TTL_HOURS = Number(process.env.ROOM_TTL_HOURS || 6);

// Strip internal fields not meant for the client (nothing sensitive yet in
// Phase 1, but this is where we'd redact things like host tokens later).
function toPublicRoom(room) {
  return room;
}

// POST /api/v1/rooms — create a room, caller becomes host
router.post("/", async (req, res, next) => {
  try {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, parsed.error.issues[0]?.message || "Invalid input", 422);
    }
    const { hostDisplayName, settings } = parsed.data;
    const hostPlayerId = nanoid(12);

    const room = await createRoom({
      hostPlayerId,
      hostDisplayName,
      settings: settings || {},
      ttlHours: TTL_HOURS,
    });

    return ok(
      res,
      { room: toPublicRoom(room), playerId: hostPlayerId },
      "Room created",
      201
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/rooms/:roomCode — public room info
router.get("/:roomCode", async (req, res, next) => {
  try {
    const parsed = roomCodeParamSchema.safeParse(req.params);
    if (!parsed.success) return fail(res, "Invalid room code", 422);

    const room = await getRoom(parsed.data.roomCode);
    if (!room) return fail(res, "Room not found", 404);

    return ok(res, { room: toPublicRoom(room) }, "Room found");
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/rooms/:roomCode/join
router.post("/:roomCode/join", async (req, res, next) => {
  try {
    const paramParsed = roomCodeParamSchema.safeParse(req.params);
    if (!paramParsed.success) return fail(res, "Invalid room code", 422);

    const bodyParsed = joinRoomSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return fail(res, bodyParsed.error.issues[0]?.message || "Invalid input", 422);
    }

    const { roomCode } = paramParsed.data;
    const { displayName, playerId: reconnectId } = bodyParsed.data;

    const room = await getRoom(roomCode);
    if (!room) return fail(res, "Room not found", 404);
    if (room.gameStatus !== "lobby") {
      return fail(res, "This room has already started a game", 409);
    }

    // Reconnect path: same playerId already in the room
    if (reconnectId && room.players.some((p) => p.playerId === reconnectId)) {
      return ok(
        res,
        { room: toPublicRoom(room), playerId: reconnectId, reconnected: true },
        "Reconnected to room"
      );
    }

    if (room.players.length >= room.maxPlayers) {
      return fail(res, "Room is full", 409);
    }
    if (
      room.players.some(
        (p) => p.displayName.toLowerCase() === displayName.toLowerCase()
      )
    ) {
      return fail(res, "That name is already taken in this room", 409);
    }

    const playerId = nanoid(12);
    const updatedRoom = await addPlayerToRoom(roomCode, {
      playerId,
      displayName,
      teamId: null,
      individualScore: 0,
      isHost: false,
      isReady: false,
      connectionStatus: "connected",
      joinedAt: new Date(),
    });

    return ok(
      res,
      { room: toPublicRoom(updatedRoom), playerId },
      "Joined room",
      201
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/rooms/:roomCode/leave
router.post("/:roomCode/leave", async (req, res, next) => {
  try {
    const paramParsed = roomCodeParamSchema.safeParse(req.params);
    if (!paramParsed.success) return fail(res, "Invalid room code", 422);

    const { playerId } = req.body || {};
    if (!playerId) return fail(res, "playerId is required", 422);

    const { roomCode } = paramParsed.data;
    const room = await getRoom(roomCode);
    if (!room) return fail(res, "Room not found", 404);

    await removePlayerFromRoom(roomCode, playerId);
    // BUGFIX (issue #3): reassign host if the player who just left was one.
    const updatedRoom = await reassignHostIfNeeded(roomCode);
    return ok(res, { room: toPublicRoom(updatedRoom) }, "Left room");
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/rooms/:roomCode/settings — host only
router.patch("/:roomCode/settings", async (req, res, next) => {
  try {
    const paramParsed = roomCodeParamSchema.safeParse(req.params);
    if (!paramParsed.success) return fail(res, "Invalid room code", 422);

    const { roomCode } = paramParsed.data;
    const { requesterId, settings } = req.body || {};
    if (!requesterId || !settings) {
      return fail(res, "requesterId and settings are required", 422);
    }

    const room = await getRoom(roomCode);
    if (!room) return fail(res, "Room not found", 404);
    if (room.hostPlayerId !== requesterId) {
      return fail(res, "Only the host can update room settings", 403);
    }
    if (room.gameStatus !== "lobby") {
      return fail(res, "Cannot change settings after the game has started", 409);
    }

    const mergedSettings = { ...room.settings, ...settings };
    const updatedRoom = await updateRoomSettings(roomCode, mergedSettings);
    return ok(res, { room: toPublicRoom(updatedRoom) }, "Settings updated");
  } catch (err) {
    next(err);
  }
});

export default router;
