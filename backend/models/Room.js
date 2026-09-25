import mongoose from "mongoose";

const PlayerSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 24 },
    teamId: { type: String, default: null }, // "A" | "B" | null
    individualScore: { type: Number, default: 0 },
    isHost: { type: Boolean, default: false },
    isReady: { type: Boolean, default: false },
    connectionStatus: {
      type: String,
      enum: ["connected", "disconnected"],
      default: "connected",
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SettingsSchema = new mongoose.Schema(
  {
    gameMode: {
      type: String,
      enum: ["classic", "chaos", "dare", "battle"],
      default: "classic",
    },
    rounds: { type: Number, default: 10, min: 1, max: 50 },
    turnDurationSeconds: { type: Number, default: 30, min: 10, max: 30 },
    roastHost: {
      enabled: { type: Boolean, default: true },
      intensity: {
        type: String,
        enum: ["mild", "savage", "full-chaos", "off"],
        default: "mild",
      },
    },
    randomJamMode: { type: Boolean, default: true },
    specialChallenges: { type: Boolean, default: true },
    scoring: {
      validSongCompleted: { type: Number, default: 50 },
      challengeCompleted: { type: Number, default: 50 },
      correctLetter: { type: Number, default: 20 },
      failedTurn: { type: Number, default: -30 },
      timeout: { type: Number, default: -20 },
      invalidSong: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const CurrentTurnResultSchema = new mongoose.Schema(
  {
    // "invalid" added in Phase 5: an unmatched song when randomJamMode is
    // disabled (see gameEngine.js / issue #4) resolves immediately as
    // invalid rather than silently falling back to a Random Jam.
    outcome: { type: String, enum: ["success", "failed", "timeout", "invalid"], default: null },
    points: { type: Number, default: 0 },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const TurnSongSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ["karaoke", "random-jam", null], default: null },
    songId: { type: String, default: null },
    title: { type: String, default: null },
    category: { type: String, default: null }, // Random Jam category label
    profile: { type: String, default: null }, // legacy synth profile key
    startLetter: { type: String, default: null },
    endLetter: { type: String, default: null },
    audioUrl: { type: String, default: null },
    provider: { type: String, default: null },
  },
  { _id: false }
);

const CurrentTurnSchema = new mongoose.Schema(
  {
    turnId: { type: String, default: null },
    playerId: { type: String, default: null },
    teamId: { type: String, default: null },
    roundNumber: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["declaring", "active", "awaiting-validation", "finalized"],
      default: "declaring",
    },
    song: { type: TurnSongSchema, default: () => ({}) },
    result: { type: CurrentTurnResultSchema, default: () => ({}) },
    challengeCompleted: { type: Boolean, default: false },
    audioFinished: { type: Boolean, default: false },
  },
  { _id: false }
);

const TurnOrderEntrySchema = new mongoose.Schema(
  { playerId: String, teamId: String },
  { _id: false }
);

// Phase 5 — Chaos Mode foundation (see services/challengeEngine.js). Only
// populated when settings.gameMode is "chaos" or "dare"; null in Classic/Battle.
const CurrentChallengeSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    title: { type: String, default: null },
    description: { type: String, default: null },
    type: { type: String, default: null },
    duration: { type: Number, default: null },
    difficulty: { type: String, default: null },
  },
  { _id: false }
);

const GameStateSchema = new mongoose.Schema(
  {
    turnOrder: { type: [TurnOrderEntrySchema], default: [] },
    totalTurns: { type: Number, default: 0 },
    currentTurnIndex: { type: Number, default: -1 },
    currentTurn: { type: CurrentTurnSchema, default: () => ({}) },
    // Classic Mode's letter-chain requirement for the *next* turn, derived
    // from the last finalized karaoke match's `lastSound`. Null means no
    // requirement (first turn, or the previous turn was a Random Jam with
    // no identified song to chain from).
    expectedStartSound: { type: String, default: null },
    usedSongIds: { type: [String], default: [] },
    // Phase 5 additions below. `stats`/`scoreHistory` use Mixed rather than
    // a fully-typed sub-schema — they're write-once-per-turn aggregates
    // consumed only by resultsService.js, so a rigid schema would add
    // ceremony without real safety benefit.
    currentChallenge: { type: CurrentChallengeSchema, default: null },
    stats: { type: mongoose.Schema.Types.Mixed, default: () => ({
      successfulSongs: 0, failedTurns: 0, timeouts: 0, invalidSongs: 0, randomJams: 0, perPlayer: {},
    }) },
    scoreHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const ResultsSchema = new mongoose.Schema(
  {
    teamAScore: { type: Number, default: 0 },
    teamBScore: { type: Number, default: 0 },
    winnerTeamId: { type: String, default: null }, // "A" | "B" | null (draw)
    isDraw: { type: Boolean, default: false },
    endedEarly: { type: Boolean, default: false },
    // Phase 5 item #7/#8 — see services/resultsService.js. `summary` powers
    // the improved results screen; `shareable` is the reusable data shape
    // for a future "share my result" feature.
    summary: { type: mongoose.Schema.Types.Mixed, default: null },
    shareable: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const RoomSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, unique: true, index: true },
    hostPlayerId: { type: String, required: true },
    players: { type: [PlayerSchema], default: [] },
    teams: {
      A: { name: { type: String, default: "Team A" }, score: { type: Number, default: 0 } },
      B: { name: { type: String, default: "Team B" }, score: { type: Number, default: 0 } },
    },
    settings: { type: SettingsSchema, default: () => ({}) },
    gameStatus: {
      type: String,
      enum: ["lobby", "in-progress", "finished"],
      default: "lobby",
    },
    gameState: { type: GameStateSchema, default: () => ({}) },
    results: { type: ResultsSchema, default: null },
    maxPlayers: { type: Number, default: 12 },
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  { timestamps: true }
);

export default mongoose.models.Room || mongoose.model("Room", RoomSchema);
