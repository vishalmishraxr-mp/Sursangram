const FUNNY_TEAM_NAMES = [
  "Sur Ke Sikandar",
  "Bathroom Singers",
  "Arijit Ke Chacha",
  "Besure Badshah",
  "Survivors of Sur",
  "Gaana Hai Toh Aana",
  "Mic Ke Maharathi",
  "Auto-Tune Ke Bina",
  "Dhol Wale Dulhe",
  "Lyrics Ke Lootere",
];

/**
 * Returns two distinct funny names, e.g. for a "randomize both teams" action.
 */
export function generateTwoTeamNames() {
  const pool = [...FUNNY_TEAM_NAMES];
  const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  const second = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  return [first, second];
}

export function getFunnyTeamNamePool() {
  return [...FUNNY_TEAM_NAMES];
}
