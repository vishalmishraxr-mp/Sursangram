import { Server } from "socket.io";
import {
  getRoom,
  assignPlayerTeam,
  setPlayerReady,
  setConnectionStatus,
  renameTeam,
  startGame,
  removePlayerFromRoom,
  reassignHostIfNeeded,
} from "../repositories/roomRepository.js";
import { generateTwoTeamNames } from "../utils/teamNames.js";
import {
  beginGame,
  announceSong,
  handlePlayerDone,
  handleAudioFinished,
  handleChallengeComplete,
  handleValidation,
  endGame,
  cleanupRoomTimers,
} from "../services/gameEngine.js";
import { initRoastHost } from "../services/aiRoastService.js";

// socket.id -> { roomCode, playerId }
// Lets us resolve "who is this socket" on every event and on disconnect,
// without trusting whatever the client claims in later payloads.
const socketMeta = new Map();

// Very small per-socket rate limiter: at most N events per window.
// This is a placeholder for the fuller per-event limits called for in the
// spec (section 15) — enough to blunt an accidental event storm from a
// buggy client, not a substitute for server-side auth (which is separate).
const RATE_LIMIT_WINDOW_MS = 2000;
const RATE_LIMIT_MAX_EVENTS = 20;
const rateBuckets = new Map(); // socket.id -> { count, windowStart }

function isRateLimited(socketId) {
  const now = Date.now();
  const bucket = rateBuckets.get(socketId) || { count: 0, windowStart: now };
  if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += 1;
  rateBuckets.set(socketId, bucket);
  return bucket.count > RATE_LIMIT_MAX_EVENTS;
}

export function initSockets(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  // Phase 5 — Roast Host subscribes to the generic game-event bus. It has
  // no other coupling to the socket layer or gameEngine.js beyond this line.
  initRoastHost(io);

  io.on("connection", (socket) => {
    function fail(ack, message) {
      socket.emit("error", { message });
      ack?.({ success: false, message });
    }

    async function broadcastRoomState(roomCode) {
      const room = await getRoom(roomCode);
      if (room) io.to(roomCode).emit("room:state", { room });
      return room;
    }

    // Resolves the calling player from the socket's own tracked membership
    // instead of trusting a roomCode/playerId passed in the payload.
    function requireMembership() {
      return socketMeta.get(socket.id) || null;
    }

    socket.onAny(() => {
      if (isRateLimited(socket.id)) {
        socket.emit("error", { message: "Too many actions — slow down." });
      }
    });

    // --- room:join ---
    // The player already exists server-side from the REST create/join call;
    // this just attaches the live socket to that membership.
    socket.on("room:join", async ({ roomCode, playerId }, ack) => {
      try {
        if (!roomCode || !playerId) return fail(ack, "roomCode and playerId are required");
        const room = await getRoom(roomCode);
        if (!room) return fail(ack, "Room not found");
        if (!room.players.some((p) => p.playerId === playerId)) {
          return fail(ack, "You are not a member of this room");
        }

        socket.join(roomCode);
        socketMeta.set(socket.id, { roomCode, playerId });
        await setConnectionStatus(roomCode, playerId, "connected");

        const updated = await broadcastRoomState(roomCode);
        socket.to(roomCode).emit("room:player-joined", { playerId });
        ack?.({ success: true, room: updated });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- room:ready ---
    socket.on("room:ready", async ({ isReady }, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        await setPlayerReady(meta.roomCode, meta.playerId, !!isReady);
        const room = await broadcastRoomState(meta.roomCode);
        ack?.({ success: true, room });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- team:request-join --- (a player picks their own team)
    socket.on("team:request-join", async ({ teamId }, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      if (!["A", "B"].includes(teamId)) return fail(ack, "Invalid team");
      try {
        await assignPlayerTeam(meta.roomCode, meta.playerId, teamId);
        const room = await broadcastRoomState(meta.roomCode);
        ack?.({ success: true, room });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- team:assign --- (host moves another player between teams)
    socket.on("team:assign", async ({ targetPlayerId, teamId }, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      if (!["A", "B", null].includes(teamId)) return fail(ack, "Invalid team");
      try {
        const room = await getRoom(meta.roomCode);
        if (!room) return fail(ack, "Room not found");
        if (room.hostPlayerId !== meta.playerId) {
          return fail(ack, "Only the host can move players between teams");
        }
        if (!room.players.some((p) => p.playerId === targetPlayerId)) {
          return fail(ack, "That player is not in this room");
        }
        await assignPlayerTeam(meta.roomCode, targetPlayerId, teamId);
        const updated = await broadcastRoomState(meta.roomCode);
        ack?.({ success: true, room: updated });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- team:rename --- (host only)
    socket.on("team:rename", async ({ teamId, name }, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      if (!["A", "B"].includes(teamId)) return fail(ack, "Invalid team");
      const trimmed = (name || "").trim().slice(0, 24);
      if (!trimmed) return fail(ack, "Team name cannot be empty");
      try {
        const room = await getRoom(meta.roomCode);
        if (!room) return fail(ack, "Room not found");
        if (room.hostPlayerId !== meta.playerId) {
          return fail(ack, "Only the host can rename teams");
        }
        await renameTeam(meta.roomCode, teamId, trimmed);
        const updated = await broadcastRoomState(meta.roomCode);
        ack?.({ success: true, room: updated });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- team:generate-names --- (host only, randomizes both team names)
    socket.on("team:generate-names", async (_payload, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        const room = await getRoom(meta.roomCode);
        if (!room) return fail(ack, "Room not found");
        if (room.hostPlayerId !== meta.playerId) {
          return fail(ack, "Only the host can generate team names");
        }
        const [nameA, nameB] = generateTwoTeamNames();
        await renameTeam(meta.roomCode, "A", nameA);
        await renameTeam(meta.roomCode, "B", nameB);
        const updated = await broadcastRoomState(meta.roomCode);
        ack?.({ success: true, room: updated });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- game:start --- (host only, validates lobby is actually ready)
    socket.on("game:start", async (_payload, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        const room = await getRoom(meta.roomCode);
        if (!room) return fail(ack, "Room not found");
        if (room.hostPlayerId !== meta.playerId) {
          return fail(ack, "Only the host can start the game");
        }
        if (room.gameStatus !== "lobby") {
          return fail(ack, "Game has already started");
        }
        const teamACount = room.players.filter((p) => p.teamId === "A").length;
        const teamBCount = room.players.filter((p) => p.teamId === "B").length;
        if (teamACount < 1 || teamBCount < 1) {
          return fail(ack, "Both teams need at least one player");
        }
        const notReady = room.players.filter((p) => !p.isHost && !p.isReady);
        if (notReady.length > 0) {
          return fail(ack, "All players must be ready before starting");
        }

        await startGame(meta.roomCode);
        await beginGame(io, meta.roomCode); // computes turn order and starts turn #1
        ack?.({ success: true });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- turn:announce-song --- (player announces a song title, from speech
    // or manual text; server searches/matches or falls back to Random Jam)
    socket.on("turn:announce-song", async ({ songText }, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        await announceSong(io, meta.roomCode, meta.playerId, songText || "");
        ack?.({ success: true });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- turn:audio-finished --- (client presentation event; does not score)
    socket.on("turn:audio-finished", async (_payload, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        await handleAudioFinished(io, meta.roomCode, meta.playerId);
        ack?.({ success: true });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- turn:confirm-success --- (the singing player declares they're done)
    socket.on("turn:confirm-success", async (_payload, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        await handlePlayerDone(io, meta.roomCode, meta.playerId);
        ack?.({ success: true });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- turn:challenge-complete --- (active player self-confirms the special challenge)
    socket.on("turn:challenge-complete", async (_payload, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        await handleChallengeComplete(io, meta.roomCode, meta.playerId);
        ack?.({ success: true });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- turn:validate --- (opposing team or host confirms/rejects a turn)
    socket.on("turn:validate", async ({ approve }, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        await handleValidation(io, meta.roomCode, meta.playerId, !!approve);
        ack?.({ success: true });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- game:end --- (host ends the match early)
    socket.on("game:end", async (_payload, ack) => {
      const meta = requireMembership();
      if (!meta) return fail(ack, "Join the room first");
      try {
        const room = await getRoom(meta.roomCode);
        if (!room) return fail(ack, "Room not found");
        if (room.hostPlayerId !== meta.playerId) {
          return fail(ack, "Only the host can end the game");
        }
        await endGame(io, meta.roomCode, { endedEarly: true });
        ack?.({ success: true });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- room:leave ---
    socket.on("room:leave", async (_payload, ack) => {
      const meta = requireMembership();
      if (!meta) return ack?.({ success: true });
      try {
        await removePlayerFromRoom(meta.roomCode, meta.playerId);
        // BUGFIX (issue #3): if the host just left, promote someone else
        // before broadcasting, so the lobby/game UI never shows a "host"
        // who's no longer in the room.
        await reassignHostIfNeeded(meta.roomCode);
        const room = await broadcastRoomState(meta.roomCode);
        socket.to(meta.roomCode).emit("room:player-left", { playerId: meta.playerId });
        socket.leave(meta.roomCode);
        socketMeta.delete(socket.id);
        ack?.({ success: true, room });
      } catch (err) {
        fail(ack, err.message);
      }
    });

    // --- disconnect --- (network drop, tab close, etc. — do NOT remove the
    // player, just mark them disconnected so a refresh/reconnect resumes)
    socket.on("disconnect", async () => {
      const meta = socketMeta.get(socket.id);
      rateBuckets.delete(socket.id);
      if (!meta) return;
      try {
        await setConnectionStatus(meta.roomCode, meta.playerId, "disconnected");
        await broadcastRoomState(meta.roomCode);
      } catch {
        // room may already be gone — nothing to do
      } finally {
        socketMeta.delete(socket.id);
      }
    });
  });

  return io;
}
