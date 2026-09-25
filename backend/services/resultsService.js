/**
 * Phase 5 items #7 and #8 — result screen improvement + shareable result
 * data foundation.
 *
 * gameEngine.endGame() calls `buildResultsSummary(room)` once, at the
 * moment the match ends, and stores the output on `room.results.summary`.
 * The frontend renders it directly; nothing here talks to sockets or the
 * repository, so it's easy to unit-test or reuse (e.g. a future "share my
 * result" endpoint) independently of the live game.
 */

/**
 * @param {object} room - a full room document/object (post-game).
 */
export function buildResultsSummary(room) {
  const stats = room.gameState?.stats || {};
  const perPlayer = stats.perPlayer || {};
  const scoreHistory = room.gameState?.scoreHistory || [];

  const players = room.players || [];

  // Best individual performer: highest individual score, tie-broken by most
  // successful songs.
  let bestPerformer = null;
  for (const p of players) {
    const playerStats = perPlayer[p.playerId] || { successCount: 0 };
    if (
      !bestPerformer ||
      p.individualScore > bestPerformer.individualScore ||
      (p.individualScore === bestPerformer.individualScore &&
        playerStats.successCount > bestPerformer.successCount)
    ) {
      bestPerformer = {
        playerId: p.playerId,
        displayName: p.displayName,
        teamId: p.teamId,
        individualScore: p.individualScore,
        successCount: playerStats.successCount || 0,
      };
    }
  }

  // Biggest comeback: largest reduction in score gap, in favor of the team
  // that was behind, between any two consecutive snapshots in scoreHistory.
  let biggestComeback = null;
  for (let i = 1; i < scoreHistory.length; i++) {
    const prev = scoreHistory[i - 1];
    const curr = scoreHistory[i];
    const prevGapAB = prev.teamAScore - prev.teamBScore;
    const currGapAB = curr.teamAScore - curr.teamBScore;
    // A comeback is measured as the reduction of the deficit from the
    // trailing team's perspective. Crossing into the lead is included.
    const comebackForB = prevGapAB > 0 ? prevGapAB - currGapAB : 0;
    const comebackForA = prevGapAB < 0 ? currGapAB - prevGapAB : 0;
    const margin = Math.max(comebackForB, comebackForA);
    if (margin > 0 && (!biggestComeback || margin > biggestComeback.margin)) {
      biggestComeback = {
        teamId: comebackForB >= comebackForA ? "B" : "A",
        margin,
        roundNumber: curr.roundNumber,
      };
    }
  }
  // Only surface a comeback if there's enough data to make it meaningful.
  if (scoreHistory.length < 2 || !biggestComeback || biggestComeback.margin < 30) {
    biggestComeback = null;
  }

  const summary = {
    successfulSongs: stats.successfulSongs || 0,
    failedTurns: stats.failedTurns || 0,
    timeouts: stats.timeouts || 0,
    invalidSongs: stats.invalidSongs || 0,
    randomJams: stats.randomJams || 0,
    bestPerformer,
    biggestComeback,
  };

  return summary;
}

/**
 * Phase 5 item #8 — a reusable, storage-agnostic shape for future sharing
 * (a "share my result" link/image, export, etc.). Built from the same data
 * as the in-app results screen so the two never drift apart.
 */
export function buildShareableResult(room) {
  return {
    roomCode: room.roomCode,
    gameId: room.gameState?.currentTurn?.turnId
      ? `${room.roomCode}-${room.gameState.totalTurns}`
      : room.roomCode,
    winner: room.results?.isDraw ? null : room.results?.winnerTeamId,
    teams: {
      A: { name: room.teams.A.name, score: room.teams.A.score },
      B: { name: room.teams.B.name, score: room.teams.B.score },
    },
    playerStats: (room.players || []).map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      teamId: p.teamId,
      individualScore: p.individualScore,
    })),
    highlights: room.results?.summary || null,
    createdAt: new Date().toISOString(),
  };
}
