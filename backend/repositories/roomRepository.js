import Room from "../models/Room.js";
import { isDbConnected } from "../config/db.js";
import {
  memCreateRoom,
  memGetRoom,
  memUpdateRoom,
  memDeleteRoom,
  memRoomCodeExists,
} from "../utils/memoryStore.js";
import { generateRoomCode } from "../utils/roomCode.js";
import { mergeSettings } from "../config/defaultSettings.js";

/**
 * Every function here works identically whether MongoDB is connected or not.
 * Routes/services never touch Mongo or the memory store directly.
 */

async function uniqueRoomCode() {
  let code;
  let attempts = 0;
  do {
    code = generateRoomCode();
    attempts++;
    if (attempts > 10) throw new Error("Could not generate a unique room code");
  } while (await roomCodeExists(code));
  return code;
}

async function roomCodeExists(code) {
  if (isDbConnected()) {
    const found = await Room.exists({ roomCode: code });
    return !!found;
  }
  return memRoomCodeExists(code);
}

export async function createRoom({ hostPlayerId, hostDisplayName, settings, ttlHours }) {
  const roomCode = await uniqueRoomCode();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  const baseRoom = {
    roomCode,
    hostPlayerId,
    players: [
      {
        playerId: hostPlayerId,
        displayName: hostDisplayName,
        teamId: null,
        individualScore: 0,
        isHost: true,
        isReady: true,
        connectionStatus: "connected",
        joinedAt: new Date(),
      },
    ],
    teams: { A: { name: "Team A", score: 0 }, B: { name: "Team B", score: 0 } },
    // BUGFIX (issue #1): merge through the shared defaults so the memory
    // store gets a fully-populated settings object too, not just Mongo.
    settings: mergeSettings(settings),
    gameStatus: "lobby",
    gameState: {
      turnOrder: [],
      totalTurns: 0,
      currentTurnIndex: -1,
      currentTurn: {},
      expectedStartSound: null,
      currentChallenge: null,
      stats: { successfulSongs: 0, failedTurns: 0, timeouts: 0, invalidSongs: 0, randomJams: 0, perPlayer: {} },
      scoreHistory: [],
    },
    results: null,
    maxPlayers: 12,
    expiresAt,
  };

  if (isDbConnected()) {
    const doc = await Room.create(baseRoom);
    return doc.toObject();
  }
  return memCreateRoom(baseRoom);
}

export async function getRoom(roomCode) {
  if (isDbConnected()) {
    const doc = await Room.findOne({ roomCode });
    return doc ? doc.toObject() : null;
  }
  return memGetRoom(roomCode);
}

export async function addPlayerToRoom(roomCode, player) {
  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode },
      { $push: { players: player } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (room) => room.players.push(player));
}

export async function removePlayerFromRoom(roomCode, playerId) {
  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode },
      { $pull: { players: { playerId } } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (room) => {
    room.players = room.players.filter((p) => p.playerId !== playerId);
  });
}

/**
 * BUGFIX (Phase 1-4 issue #3): if the host leaves, `hostPlayerId` used to
 * keep pointing at a player who is no longer in `players`, so every
 * "host only" check (start game, rename team, end game early, ...) would
 * silently reject everyone forever.
 *
 * Call this right after removing a player. If that player was the host and
 * the room isn't empty, promotes the longest-connected remaining player
 * (preferring a currently-connected one) to host. Safe/no-op otherwise.
 */
export async function reassignHostIfNeeded(roomCode) {
  const room = await getRoom(roomCode);
  if (!room || room.players.length === 0) return room;
  if (room.players.some((p) => p.playerId === room.hostPlayerId)) return room; // host still present

  const candidates = [...room.players].sort((a, b) => {
    // Prefer someone actually connected right now; tie-break by seniority.
    if (a.connectionStatus !== b.connectionStatus) {
      return a.connectionStatus === "connected" ? -1 : 1;
    }
    return new Date(a.joinedAt) - new Date(b.joinedAt);
  });
  const newHost = candidates[0];

  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode },
      {
        $set: {
          hostPlayerId: newHost.playerId,
          "players.$[elem].isHost": true,
        },
      },
      { new: true, arrayFilters: [{ "elem.playerId": newHost.playerId }] }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (r) => {
    r.hostPlayerId = newHost.playerId;
    const p = r.players.find((pl) => pl.playerId === newHost.playerId);
    if (p) {
      p.isHost = true;
      p.isReady = true; // hosts are implicitly ready, matching room creation
    }
  });
}

export async function updateRoomSettings(roomCode, settings) {
  const merged = mergeSettings(settings);
  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode },
      { $set: { settings: merged } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (room) => {
    room.settings = merged;
  });
}

/**
 * Generic read-mutate-save for the game engine's nested gameState updates,
 * where writing a dedicated $set query per field would be unwieldy.
 * `mutator` receives a plain-object-like room and mutates it in place.
 */
export async function mutateRoom(roomCode, mutator) {
  if (isDbConnected()) {
    const doc = await Room.findOne({ roomCode });
    if (!doc) return null;
    mutator(doc);
    doc.markModified("gameState");
    doc.markModified("teams");
    doc.markModified("players");
    doc.markModified("results");
    await doc.save();
    return doc.toObject();
  }
  return memUpdateRoom(roomCode, mutator);
}

export async function assignPlayerTeam(roomCode, playerId, teamId) {
  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode, "players.playerId": playerId },
      { $set: { "players.$.teamId": teamId } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (room) => {
    const player = room.players.find((p) => p.playerId === playerId);
    if (player) player.teamId = teamId;
  });
}

export async function setPlayerReady(roomCode, playerId, isReady) {
  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode, "players.playerId": playerId },
      { $set: { "players.$.isReady": isReady } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (room) => {
    const player = room.players.find((p) => p.playerId === playerId);
    if (player) player.isReady = isReady;
  });
}

export async function setConnectionStatus(roomCode, playerId, status) {
  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode, "players.playerId": playerId },
      { $set: { "players.$.connectionStatus": status } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (room) => {
    const player = room.players.find((p) => p.playerId === playerId);
    if (player) player.connectionStatus = status;
  });
}

export async function renameTeam(roomCode, teamId, name) {
  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode },
      { $set: { [`teams.${teamId}.name`]: name } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (room) => {
    room.teams[teamId].name = name;
  });
}

export async function startGame(roomCode) {
  if (isDbConnected()) {
    const doc = await Room.findOneAndUpdate(
      { roomCode },
      { $set: { gameStatus: "in-progress" } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }
  return memUpdateRoom(roomCode, (room) => {
    room.gameStatus = "in-progress";
  });
}

export async function deleteRoom(roomCode) {
  if (isDbConnected()) {
    await Room.deleteOne({ roomCode });
    return true;
  }
  return memDeleteRoom(roomCode);
}
