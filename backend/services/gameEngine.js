import { nanoid } from "nanoid";
import { getRoom, mutateRoom } from "../repositories/roomRepository.js";
import { buildTurnOrder } from "../utils/turnOrder.js";
import { resolveTurnAudio, getSongById } from "./songSearch.js";
import { identifySong } from "./musicApiService.js";
import { pickRandomInstrumental } from "../data/randomInstrumentals.js";
import { withRoomLock, clearRoomLock } from "../utils/roomLock.js";
import { pickChallenge } from "./challengeEngine.js";
import { emitGameEvent, GAME_EVENTS } from "./gameEvents.js";
import { buildResultsSummary, buildShareableResult } from "./resultsService.js";

// In-memory per-room timer handles. Ephemeral by design — if the server
// restarts mid-game, in-flight timers are lost along with it. Acceptable
// for this phase; a future phase could persist deadlines and re-derive
// timers on boot for true crash recovery (see issue #7 — structured so that
// remains possible: every timer's *deadline* is derivable from persisted
// `endsAt`/turn state, only the JS `setTimeout` handle itself is ephemeral).
const roomTimers = new Map(); // roomCode -> { declareTimer, turnTimer, validationTimer }

// Ephemeral per-room, per-player consecutive-failure streaks, used only to
// flavor the Roast Host's "repeated failure" commentary (see
// GAME_EVENTS.REPEATED_FAILURE below). Never affects scoring — purely
// presentational, so it's fine for this to reset on a server restart same
// as the timers above.
const failureStreaks = new Map(); // roomCode -> Map<playerId, number>

const DECLARE_GRACE_MS = 30_000; // 30s to announce/search a song
const VALIDATION_GRACE_MS = 20_000;

function clearTimers(roomCode) {
  const t = roomTimers.get(roomCode);
  if (t?.declareTimer) clearTimeout(t.declareTimer);
  if (t?.turnTimer) clearTimeout(t.turnTimer);
  if (t?.validationTimer) clearTimeout(t.validationTimer);
  roomTimers.delete(roomCode);
}

function setTimer(roomCode, key, fn, ms) {
  const t = roomTimers.get(roomCode) || {};
  t[key] = setTimeout(fn, ms);
  roomTimers.set(roomCode, t);
}

function clearTimer(roomCode, key) {
  const t = roomTimers.get(roomCode);
  if (t?.[key]) clearTimeout(t[key]);
}

async function broadcastRoomState(io, roomCode) {
  const room = await getRoom(roomCode);
  if (room) io.to(roomCode).emit("room:state", { room });
  return room;
}

function getStreak(roomCode, playerId) {
  const m = failureStreaks.get(roomCode);
  return m?.get(playerId) || 0;
}

function bumpStreak(roomCode, playerId, outcome) {
  let m = failureStreaks.get(roomCode);
  if (!m) {
    m = new Map();
    failureStreaks.set(roomCode, m);
  }
  if (outcome === "success") {
    m.set(playerId, 0);
    return 0;
  }
  const next = (m.get(playerId) || 0) + 1;
  m.set(playerId, next);
  return next;
}

/**
 * Called once, right after game:start passes validation. Computes the
 * fixed turn order for the whole match and kicks off turn #1.
 */
export async function beginGame(io, roomCode) {
  const room = await getRoom(roomCode);
  if (!room) return;

  const turnOrder = buildTurnOrder(room.players);
  const totalTurns = turnOrder.length * room.settings.rounds;

  await mutateRoom(roomCode, (r) => {
    r.gameState.turnOrder = turnOrder;
    r.gameState.totalTurns = totalTurns;
    r.gameState.currentTurnIndex = -1;
    r.gameState.expectedStartSound = null;
    r.gameState.usedSongIds = [];
    r.gameState.currentChallenge = null;
    r.gameState.stats = {
      successfulSongs: 0,
      failedTurns: 0,
      timeouts: 0,
      invalidSongs: 0,
      randomJams: 0,
      perPlayer: {},
    };
    r.gameState.scoreHistory = [];
  });

  const started = await broadcastRoomState(io, roomCode);
  io.to(roomCode).emit("game:started", { room: started });

  await startNextTurn(io, roomCode);
}

/** STATE 1: turn start — selects the next player, opens the declaring phase. */
export async function startNextTurn(io, roomCode) {
  const room = await getRoom(roomCode);
  if (!room || room.gameStatus !== "in-progress") return;

  const nextIndex = room.gameState.currentTurnIndex + 1;
  if (nextIndex >= room.gameState.totalTurns) {
    await endGame(io, roomCode, { endedEarly: false });
    return;
  }

  if (nextIndex === room.gameState.totalTurns - 1) {
    emitGameEvent(io, roomCode, GAME_EVENTS.FINAL_TURN, {});
  }

  const entry = room.gameState.turnOrder[nextIndex % room.gameState.turnOrder.length];
  const roundNumber = Math.floor(nextIndex / room.gameState.turnOrder.length) + 1;
  const turnId = nanoid(10);

  // Chaos/Dare modes can select a challenge for each turn. Classic/Battle
  // leave this null and keep the normal song flow.
  const isChallengeMode = room.settings.gameMode === "chaos" || room.settings.gameMode === "dare";
  const challenge = isChallengeMode && room.settings.specialChallenges !== false
    ? pickChallenge({
        excludeId: room.gameState.currentChallenge?.id || null,
        mode: room.settings.gameMode,
      })
    : null;

  await mutateRoom(roomCode, (r) => {
    r.gameState.currentTurnIndex = nextIndex;
    r.gameState.currentChallenge = challenge;
    r.gameState.currentTurn = {
      turnId,
      playerId: entry.playerId,
      teamId: entry.teamId,
      roundNumber,
      startedAt: new Date(),
      // During the declaring/search phase the player gets 30 seconds. This
      // deadline is replaced with the 30-second play window in announceSong().
      endsAt: new Date(Date.now() + DECLARE_GRACE_MS),
      status: "declaring",
      song: {},
      result: {},
      challengeCompleted: false,
      audioFinished: false,
    };
  });

  const updated = await broadcastRoomState(io, roomCode);
  io.to(roomCode).emit("turn:started", { turn: updated.gameState.currentTurn });
  if (challenge) {
    io.to(roomCode).emit("turn:challenge", { challenge });
    emitGameEvent(io, roomCode, GAME_EVENTS.CHALLENGE_ISSUED, { challenge });
  }

  // Never let the game stall waiting on a mic/song announcement.
  setTimer(
    roomCode,
    "declareTimer",
    () => handleDeclareTimeout(io, roomCode, turnId),
    DECLARE_GRACE_MS
  );
}

async function handleDeclareTimeout(io, roomCode, turnId) {
  const room = await getRoom(roomCode);
  if (!room) return;
  const turn = room.gameState.currentTurn;
  if (!turn || turn.turnId !== turnId || turn.status !== "declaring") return; // stale, ignore
  await announceSong(io, roomCode, turn.playerId, "", { auto: true });
}

/**
 * STATE 2+3+4: the active player announces a song (from speech-to-text or
 * manual text entry); we search it, fall back to Random Jam if nothing
 * matches (or if this is the auto/no-mic-input path), and start the
 * singing timer. This always resolves to *something* playable — UNLESS
 * `randomJamMode` is disabled in room settings and nothing matched, in
 * which case there is nothing valid to sing to, so the turn resolves
 * immediately instead of starting a fake/silent "active" phase (see issue
 * #4 below).
 */
export async function announceSong(io, roomCode, playerId, songText, { auto = false } = {}) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error("Room not found");
  const turn = room.gameState.currentTurn;
  if (!turn || turn.status !== "declaring") {
    if (auto) return; // stale timeout firing after the player already acted
    throw new Error("No song announcement is expected right now");
  }
  if (turn.playerId !== playerId) {
    if (auto) return;
    throw new Error("It's not your turn");
  }

  clearTimer(roomCode, "declareTimer");

  const allowRandomJam = room.settings.randomJamMode !== false;
  const forcedJamChallenge = room.gameState.currentChallenge?.type === "random-jam-forced";
  const trimmed = (songText || "").trim();

  let songResult;
  if (forcedJamChallenge) {
    // Chaos Mode's "Wildcard Jam" challenge intentionally skips matching.
    songResult = { mode: "random-jam", song: null, ...pickRandomInstrumental() };
  } else if (!trimmed) {
    // Manual "Surprise Me" / mic failure / declare-timeout path.
    if (!allowRandomJam) {
      // BUGFIX (issue #4): previously this ignored `randomJamMode` entirely
      // and always played a random instrumental. With the setting off,
      // there is nothing to sing to — resolve the turn immediately instead.
      await finalizeTurn(io, roomCode, "timeout", "No song announced and Random Jam is disabled");
      return;
    }
    songResult = { mode: "random-jam", song: null, ...pickRandomInstrumental() };
  } else {
    const identified = await identifySong(trimmed, room.settings.gameMode === "classic" ? room.gameState.expectedStartSound : null);
    if (identified?.letterMismatch) {
      emitGameEvent(io, roomCode, GAME_EVENTS.INVALID_SONG, { playerId, songText: trimmed, expected: room.gameState.expectedStartSound, actual: identified.startLetter || identified.startSound });
      throw new Error(`Invalid chain: the song must start with “${room.gameState.expectedStartSound}”, but “${identified.startLetter || identified.startSound || "?"}” was found.`);
    }
    if (identified) {
      const identifiedKey = String(identified.externalId || identified.songId || identified.id || identified.normalizedTitle || identified.title || "").trim().toLowerCase();
      if (identifiedKey && (room.gameState.usedSongIds || []).includes(identifiedKey)) {
        emitGameEvent(io, roomCode, GAME_EVENTS.INVALID_SONG, { playerId, songText: trimmed, reason: "duplicate-song" });
        throw new Error(`“${identified.title}” has already been used in this game. Pick another song.`);
      }
      // The matched song carries its direct iTunes preview URL so every client
      // can play the same real Apple song preview during the turn.
      songResult = {
        mode: "karaoke",
        song: { ...identified },
        profile: "antakshari-bgm",
        source: identified.source || "external",
      };
    } else {
      songResult = null;
    }
    if (!songResult) {
      if (auto) {
        await finalizeTurn(io, roomCode, "timeout", "No song found");
        return;
      }
      emitGameEvent(io, roomCode, GAME_EVENTS.INVALID_SONG, { playerId, songText: trimmed });
      throw new Error(
        "Song not found or no playable audio is available. Try another title."
      );
    }

    if (songResult.mode === "random-jam" && !allowRandomJam) {
      if (auto) {
        await finalizeTurn(io, roomCode, "timeout", "No confident match and Random Jam is disabled");
        return;
      }
      emitGameEvent(io, roomCode, GAME_EVENTS.INVALID_SONG, { playerId, songText: trimmed });
      throw new Error(
        "That song wasn't found in the catalog and Random Jam is disabled for this room — try another title."
      );
    }
  }

  const startedAt = new Date();
  // Keep every active turn capped at 30 seconds.
  const activeTurnSeconds = Math.min(30, Math.max(10, Number(room.settings.turnDurationSeconds) || 30));
  const endsAt = new Date(startedAt.getTime() + activeTurnSeconds * 1000);

  await mutateRoom(roomCode, (r) => {
    r.gameState.currentTurn.status = "active";
    r.gameState.currentTurn.startedAt = startedAt;
    r.gameState.currentTurn.endsAt = endsAt;
    r.gameState.currentTurn.song =
      songResult.mode === "karaoke"
        ? {
            mode: "karaoke",
            songId: songResult.song.songId || songResult.song.externalId || songResult.song.id || null,
            title: songResult.song.title,
            category: null,
            profile: songResult.profile,
            startLetter: songResult.song.startLetter || songResult.song.startSound || null,
            endLetter: songResult.song.endLetter || songResult.song.lastSound || null,
            audioUrl: songResult.song.audioUrl || songResult.song.streamUrl || songResult.song.previewUrl || null,
            playbackSeekable: songResult.song.playbackSeekable !== false,
            provider: songResult.song.provider || null,
            externalId: songResult.song.externalId || songResult.song.songId || null,
            audioEngine: songResult.song.metadata?.searchEngine || null,
            startSound: songResult.song.startSound || null,
            lastSound: songResult.song.lastSound || null,
            source: songResult.source || songResult.song.source || "local",
            artist: songResult.song.artist || null,
            movie: songResult.song.movie || null,
            lyricMatch: songResult.song.runtime?.lyricMatch || null,
          }
        : {
            mode: "random-jam",
            songId: null,
            title: null,
            category: songResult.category,
            profile: songResult.profile,
          };

    if (songResult.mode === "karaoke") {
      const key = String(songResult.song.externalId || songResult.song.songId || songResult.song.id || songResult.song.normalizedTitle || songResult.song.title || "").trim().toLowerCase();
      if (key) {
        r.gameState.usedSongIds = Array.from(new Set([...(r.gameState.usedSongIds || []), key]));
      }
    }
  });

  const updated = await broadcastRoomState(io, roomCode);
  const eventName = songResult.mode === "karaoke" ? "turn:song-detected" : "turn:jam-activated";
  io.to(roomCode).emit(eventName, { turn: updated.gameState.currentTurn });
  if (songResult.mode === "random-jam") {
    emitGameEvent(io, roomCode, GAME_EVENTS.RANDOM_JAM, { playerId, category: songResult.category });
  }

  setTimer(
    roomCode,
    "turnTimer",
    () => handleTimerExpiry(io, roomCode, turn.turnId),
    activeTurnSeconds * 1000
  );
}

/** Timer ran out and the player never declared they were done => timeout. */
async function handleTimerExpiry(io, roomCode, turnId) {
  const room = await getRoom(roomCode);
  if (!room) return;
  const turn = room.gameState.currentTurn;
  if (!turn || turn.turnId !== turnId || turn.status !== "active") return; // stale timer, ignore

  await finalizeTurn(io, roomCode, "timeout");
}

/**
 * The active player's browser reports that the preview reached its end.
 * This is presentation-only: it never advances or scores the turn. It exists
 * solely so the Roast Host can fire a dedicated post-song line once per turn.
 */
export async function handleAudioFinished(io, roomCode, playerId) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error("Room not found");
  const turn = room.gameState.currentTurn;
  if (!turn || turn.status !== "active") return;
  if (turn.playerId !== playerId) throw new Error("Only the active player can finish the audio event");
  if (turn.audioFinished) return;

  // The Apple preview has ended. The play window should not keep counting down
  // behind the Roast Host / validation UI. Treat preview completion like the
  // player pressing "Done": stop the active timer and move to validation.
  clearTimer(roomCode, "turnTimer");

  await mutateRoom(roomCode, (r) => {
    r.gameState.currentTurn.audioFinished = true;
    r.gameState.currentTurn.status = "awaiting-validation";
    r.gameState.currentTurn.endsAt = new Date();
  });

  const updated = await broadcastRoomState(io, roomCode);
  io.to(roomCode).emit("turn:audio-finished", { turn: updated.gameState.currentTurn });
  io.to(roomCode).emit("turn:awaiting-validation", { turn: updated.gameState.currentTurn });
  emitGameEvent(io, roomCode, GAME_EVENTS.SONG_FINISHED, {
    playerId,
    teamId: turn.teamId,
    title: turn.song?.title || "song",
  });

  setTimer(
    roomCode,
    "validationTimer",
    () => handleValidationTimeout(io, roomCode, turn.turnId),
    VALIDATION_GRACE_MS
  );
}

/** Active player declares they've finished singing before time runs out. */
export async function handlePlayerDone(io, roomCode, playerId) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error("Room not found");
  const turn = room.gameState.currentTurn;
  if (!turn || turn.status !== "active") throw new Error("No active turn");
  if (turn.playerId !== playerId) throw new Error("It's not your turn");

  clearTimer(roomCode, "turnTimer");

  await mutateRoom(roomCode, (r) => {
    r.gameState.currentTurn.status = "awaiting-validation";
  });

  const updated = await broadcastRoomState(io, roomCode);
  io.to(roomCode).emit("turn:awaiting-validation", { turn: updated.gameState.currentTurn });

  setTimer(
    roomCode,
    "validationTimer",
    () => handleValidationTimeout(io, roomCode, turn.turnId),
    VALIDATION_GRACE_MS
  );
}

/** Nobody on the opposing team voted in time — don't get the game stuck. */
async function handleValidationTimeout(io, roomCode, turnId) {
  const room = await getRoom(roomCode);
  if (!room) return;
  const turn = room.gameState.currentTurn;
  if (!turn || turn.turnId !== turnId || turn.status !== "awaiting-validation") return;

  await finalizeTurn(io, roomCode, "success", "Auto-approved — no vote received in time");
}

/**
 * A member of the opposing team (or the host) confirms or rejects the turn.
 */
export async function handleChallengeComplete(io, roomCode, playerId) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error("Room not found");
  const turn = room.gameState.currentTurn;
  if (!turn || turn.status !== "active") throw new Error("No active turn");
  if (turn.playerId !== playerId) throw new Error("It's not your turn");
  if (!room.gameState.currentChallenge) throw new Error("This turn has no challenge");

  await mutateRoom(roomCode, (r) => {
    r.gameState.currentTurn.challengeCompleted = true;
  });

  const updated = await broadcastRoomState(io, roomCode);
  io.to(roomCode).emit("turn:challenge-completed", {
    turn: updated.gameState.currentTurn,
  });
  return updated;
}

export async function handleValidation(io, roomCode, validatorPlayerId, approve) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error("Room not found");
  const turn = room.gameState.currentTurn;
  if (!turn || turn.status !== "awaiting-validation") {
    throw new Error("No turn is awaiting validation");
  }

  const validator = room.players.find((p) => p.playerId === validatorPlayerId);
  if (!validator) throw new Error("You are not in this room");
  const isHost = room.hostPlayerId === validatorPlayerId;
  const isOpposingTeam = validator.teamId && validator.teamId !== turn.teamId;
  if (!isHost && !isOpposingTeam) {
    throw new Error("Only the opposing team or the host can validate this turn");
  }

  clearTimer(roomCode, "validationTimer");

  emitGameEvent(io, roomCode, approve ? GAME_EVENTS.VALIDATION_SUCCESS : GAME_EVENTS.VALIDATION_FAILURE, {
    validatorPlayerId,
    turnPlayerId: turn.playerId,
  });

  await finalizeTurn(io, roomCode, approve ? "success" : "failed");
}

/**
 * Transitions the current turn from its active state to "finalized" exactly
 * once, applies scoring, updates stats/score history, and schedules the
 * next turn. See utils/roomLock.js for why this is wrapped in a per-room
 * lock (BUGFIX issue #2 — validation race condition).
 */
async function finalizeTurn(io, roomCode, outcome, note = "") {
  return withRoomLock(roomCode, () => doFinalizeTurn(io, roomCode, outcome, note));
}

async function doFinalizeTurn(io, roomCode, outcome, note) {
  const room = await getRoom(roomCode);
  if (!room) return;
  const turn = room.gameState.currentTurn;
  // Re-checked *after* acquiring the room lock — this is what actually
  // makes the awaiting-validation -> finalized transition idempotent even
  // if two triggers (e.g. a manual vote and the validation timeout) queued
  // up back to back.
  if (!turn || turn.status === "finalized") return;

  const scoring = room.settings.scoring;
  const pointsMap = {
    success: scoring.validSongCompleted,
    failed: scoring.failedTurn,
    timeout: scoring.timeout,
    invalid: scoring.invalidSong,
  };
  let points = pointsMap[outcome] ?? 0;

  const challenge = room.gameState.currentChallenge;
  const isChallengeMode =
    (room.settings.gameMode === "chaos" || room.settings.gameMode === "dare") && challenge;
  const challengeCompleted = Boolean(turn.challengeCompleted);
  if (outcome === "success" && isChallengeMode && challengeCompleted) {
    // Challenge/Dare turns receive the configured challenge reward only when
    // the active player explicitly marks the challenge as completed. This
    // avoids silently awarding challenge points just because a song was valid.
    points = scoring.challengeCompleted;
  }

  // Classic Mode letter-chain bonus: only possible when a real song was
  // matched (Random Jam has no identified song to check), and only on a
  // successful turn.
  let letterBonusAwarded = false;
  let nextExpectedStartSound = null;
  if (outcome === "success" && turn.song?.mode === "karaoke") {
    const matchedSong = turn.song.songId ? getSongById(turn.song.songId) : null;
    const startSound = turn.song.startLetter || turn.song.startSound || matchedSong?.startLetter || matchedSong?.startSound || null;
    const lastSound = turn.song.endLetter || turn.song.lastSound || matchedSong?.endLetter || matchedSong?.lastSound || null;
    if (startSound || lastSound) {
      if (
        room.settings.gameMode === "classic" &&
        room.gameState.expectedStartSound &&
        startSound === room.gameState.expectedStartSound
      ) {
        points += scoring.correctLetter;
        letterBonusAwarded = true;
      }
      nextExpectedStartSound = lastSound;
    }
  }

  // --- stats bookkeeping (Phase 5 items #6/#7) ---
  const streak = bumpStreak(roomCode, turn.playerId, outcome);

  await mutateRoom(roomCode, (r) => {
    r.gameState.currentTurn.status = "finalized";
    r.gameState.currentTurn.result = { outcome, points, note };
    r.gameState.expectedStartSound = nextExpectedStartSound;
    r.gameState.currentChallenge = null;

    const player = r.players.find((p) => p.playerId === turn.playerId);
    if (player) player.individualScore += points;

    const teamId = turn.teamId;
    if (r.teams[teamId]) r.teams[teamId].score += points;

    const stats = r.gameState.stats || {
      successfulSongs: 0,
      failedTurns: 0,
      timeouts: 0,
      invalidSongs: 0,
      randomJams: 0,
      perPlayer: {},
    };
    if (outcome === "success") stats.successfulSongs += 1;
    else if (outcome === "failed") stats.failedTurns += 1;
    else if (outcome === "timeout") stats.timeouts += 1;
    else if (outcome === "invalid") stats.invalidSongs += 1;
    if (turn.song?.mode === "random-jam") stats.randomJams += 1;

    const perPlayer = stats.perPlayer || {};
    const p = perPlayer[turn.playerId] || { successCount: 0, failCount: 0 };
    if (outcome === "success") p.successCount += 1;
    else p.failCount += 1;
    perPlayer[turn.playerId] = p;
    stats.perPlayer = perPlayer;
    r.gameState.stats = stats;

    const history = r.gameState.scoreHistory || [];
    history.push({
      roundNumber: turn.roundNumber,
      teamAScore: r.teams.A.score,
      teamBScore: r.teams.B.score,
    });
    r.gameState.scoreHistory = history;
  });

  const updated = await broadcastRoomState(io, roomCode);
  io.to(roomCode).emit("turn:finalized", {
    turn: updated.gameState.currentTurn,
    letterBonusAwarded,
  });

  // --- game events (decoupled consumers: Roast Host today, more later) ---
  const eventPayload = { playerId: turn.playerId, teamId: turn.teamId, points, streak };
  if (outcome === "success") emitGameEvent(io, roomCode, GAME_EVENTS.SONG_SUCCESS, eventPayload);
  else if (outcome === "failed") emitGameEvent(io, roomCode, GAME_EVENTS.SONG_FAILED, eventPayload);
  else if (outcome === "timeout") emitGameEvent(io, roomCode, GAME_EVENTS.TIMEOUT, eventPayload);
  else if (outcome === "invalid") emitGameEvent(io, roomCode, GAME_EVENTS.INVALID_SONG, eventPayload);

  if (streak >= 2) {
    emitGameEvent(io, roomCode, GAME_EVENTS.REPEATED_FAILURE, { playerId: turn.playerId, streak });
  }

  const history = updated.gameState.scoreHistory || [];
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const curr = history[history.length - 1];
    const prevLeader =
      prev.teamAScore === prev.teamBScore ? null : prev.teamAScore > prev.teamBScore ? "A" : "B";
    const currLeader =
      curr.teamAScore === curr.teamBScore ? null : curr.teamAScore > curr.teamBScore ? "A" : "B";
    if (prevLeader && currLeader && prevLeader !== currLeader) {
      emitGameEvent(io, roomCode, GAME_EVENTS.COMEBACK, { newLeaderTeamId: currLeader });
    }
  }

  clearTimer(roomCode, "turnTimer");
  clearTimer(roomCode, "validationTimer");

  // Brief pause so players can see the result before the next turn begins.
  setTimeout(() => startNextTurn(io, roomCode), 2500);
}

export async function endGame(io, roomCode, { endedEarly = false } = {}) {
  clearTimers(roomCode);
  failureStreaks.delete(roomCode);
  const room = await getRoom(roomCode);
  if (!room) return;
  if (room.gameStatus === "finished") return; // already ended

  const teamAScore = room.teams.A.score;
  const teamBScore = room.teams.B.score;
  const isDraw = teamAScore === teamBScore;
  const winnerTeamId = isDraw ? null : teamAScore > teamBScore ? "A" : "B";

  const baseResults = { teamAScore, teamBScore, winnerTeamId, isDraw, endedEarly };
  const summary = buildResultsSummary(room);
  const shareable = buildShareableResult({ ...room, results: { ...baseResults, summary } });

  await mutateRoom(roomCode, (r) => {
    r.gameStatus = "finished";
    r.results = { ...baseResults, summary, shareable };
  });

  const updated = await broadcastRoomState(io, roomCode);
  io.to(roomCode).emit("game:ended", { results: updated.results, room: updated });
  clearRoomLock(roomCode);
}

export function cleanupRoomTimers(roomCode) {
  clearTimers(roomCode);
  failureStreaks.delete(roomCode);
  clearRoomLock(roomCode);
}
