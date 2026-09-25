/**
 * Phase 5/6 — Chaos and Dare challenge engine.
 *
 * This is intentionally small: a structured challenge format plus a pool of
 * starter challenges, selectable per turn. gameEngine.js only ever calls
 * `pickChallenge()` / `getChallengeById()` — it has no idea what challenges
 * exist or how they're implemented, so the pool can grow (or later become
 * DB-backed / config-driven) without touching the turn state machine.
 *
 * Chaos and Dare use separate pools. Challenge completion is explicitly
 * marked by the active player during the turn; the server then uses the
 * configured challenge reward instead of silently assuming compliance.
 */

export const CHALLENGE_TYPES = Object.freeze({
  NO_REPEAT_TITLE: "no-repeat-title",
  DRAMATIC_VOICE: "dramatic-voice",
  CHORUS_ONLY: "chorus-only",
  SPEED_UP: "speed-up",
  OPPONENT_STYLE: "opponent-style",
  RANDOM_JAM_FORCED: "random-jam-forced",
  DARE_LYRICS_ONLY: "dare-lyrics-only",
  DARE_NO_HANDS: "dare-no-hands",
  DARE_TEAM_SINGALONG: "dare-team-singalong",
  DARE_OPPONENT_PICK: "dare-opponent-pick",
});

export const CHALLENGE_POOL = [
  {
    id: "no-repeat-title",
    title: "No Repeats",
    description: "Sing your song without saying its title out loud.",
    type: CHALLENGE_TYPES.NO_REPEAT_TITLE,
    duration: null, // uses the turn's normal duration
    difficulty: "medium",
  },
  {
    id: "dramatic-voice",
    title: "Dramatic Voice",
    description: "Perform this turn in the most dramatic voice you can manage.",
    type: CHALLENGE_TYPES.DRAMATIC_VOICE,
    duration: null,
    difficulty: "easy",
  },
  {
    id: "chorus-only",
    title: "Chorus Only",
    description: "Sing only the chorus — skip straight to the best part.",
    type: CHALLENGE_TYPES.CHORUS_ONLY,
    duration: null,
    difficulty: "easy",
  },
  {
    id: "speed-up",
    title: "Speed Round",
    description: "Sing it faster than you normally would. No slowing down.",
    type: CHALLENGE_TYPES.SPEED_UP,
    duration: null,
    difficulty: "medium",
  },
  {
    id: "opponent-style",
    title: "Opponent's Choice",
    description: "Someone from the opposing team picks the style you perform in.",
    type: CHALLENGE_TYPES.OPPONENT_STYLE,
    duration: null,
    difficulty: "hard",
  },
  {
    id: "random-jam-forced",
    title: "Wildcard Jam",
    description: "Skip song-matching entirely — this turn is a forced Random Jam.",
    type: CHALLENGE_TYPES.RANDOM_JAM_FORCED,
    duration: null,
    difficulty: "medium",
  },
];



export const DARE_CHALLENGE_POOL = [
  {
    id: "dare-lyrics-only",
    title: "Lyrics Only",
    description: "No humming or instrumental-only sections — keep the lyrics going.",
    type: CHALLENGE_TYPES.DARE_LYRICS_ONLY,
    duration: null,
    difficulty: "medium",
  },
  {
    id: "dare-no-hands",
    title: "No Hands",
    description: "Perform the turn without using your hands for dramatic gestures.",
    type: CHALLENGE_TYPES.DARE_NO_HANDS,
    duration: null,
    difficulty: "easy",
  },
  {
    id: "dare-team-singalong",
    title: "Team Singalong",
    description: "Get at least one teammate to join the performance for the final few seconds.",
    type: CHALLENGE_TYPES.DARE_TEAM_SINGALONG,
    duration: null,
    difficulty: "hard",
  },
  {
    id: "dare-opponent-pick",
    title: "Opponent Picks",
    description: "The opposing team gets to choose your performance style before you start.",
    type: CHALLENGE_TYPES.DARE_OPPONENT_PICK,
    duration: null,
    difficulty: "hard",
  },
];

export function getChallengeById(id) {
  return [...CHALLENGE_POOL, ...DARE_CHALLENGE_POOL].find((c) => c.id === id) || null;
}

/**
 * Picks a random challenge, optionally avoiding immediate repeats of the
 * previous turn's challenge so Chaos Mode doesn't feel repetitive.
 */
export function pickChallenge({ excludeId = null, mode = "chaos" } = {}) {
  const basePool = mode === "dare" ? DARE_CHALLENGE_POOL : CHALLENGE_POOL;
  const pool = excludeId
    ? basePool.filter((c) => c.id !== excludeId)
    : basePool;
  const source = pool.length > 0 ? pool : basePool;
  return source[Math.floor(Math.random() * source.length)];
}
